import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Progress,
  Select,
  Table,
  Tag,
  message,
} from "antd";
import {
  FilterOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type {
  InvocationRun,
  InvocationRunSummary,
  InvokeResponse,
  McpConnection,
  SuiteRun,
  SuiteRunProgress,
  TestCaseOverview,
} from "@mcp-debug/shared";
import dayjs from "dayjs";
import { api } from "../api/client";
import { ResizablePanels } from "../components/ResizablePanels";
import { ResultViewer } from "../components/ResultViewer";
import { StatusBadge } from "../components/StatusBadge";
import { useUi } from "../ui";

type DetailMode = "batch" | "case";
type CaseStatusFilter = "all" | "passed" | "failed" | "never" | "disabled";

const terminalSuiteStatuses = new Set(["passed", "failed", "cancelled"]);

export function AutomationPage() {
  const { text } = useUi();
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [connectionId, setConnectionId] = useState<string>();
  const [cases, setCases] = useState<TestCaseOverview[]>([]);
  const [suiteRuns, setSuiteRuns] = useState<SuiteRun[]>([]);
  const [query, setQuery] = useState("");
  const [toolFilter, setToolFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<CaseStatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCaseId, setSelectedCaseId] = useState<string>();
  const [detailMode, setDetailMode] = useState<DetailMode>("batch");
  const [suiteId, setSuiteId] = useState<string>();
  const [progress, setProgress] = useState<SuiteRunProgress | null>(null);
  const [caseHistory, setCaseHistory] = useState<InvocationRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [selectedRun, setSelectedRun] = useState<InvocationRun | null>(null);
  const [parallel, setParallel] = useState(1);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [runningCase, setRunningCase] = useState(false);
  const manualRunSelection = useRef(false);

  useEffect(() => {
    api.listConnections()
      .then((items) => {
        setConnections(items);
        setConnectionId((current) => current ?? items[0]?.id);
      })
      .catch((error) => message.error(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    let disposed = false;
    setCases([]);
    setSuiteRuns([]);
    setSelectedIds(new Set());
    setSelectedCaseId(undefined);
    setSelectedRunId(undefined);
    setSelectedRun(null);
    setProgress(null);
    setQuery("");
    setToolFilter("all");
    setTagFilter("all");
    setStatusFilter("all");
    Promise.all([api.listCaseOverviews(connectionId), api.listSuiteRuns(connectionId)])
      .then(([nextCases, nextSuites]) => {
        if (disposed) return;
        setCases(nextCases);
        setSuiteRuns(nextSuites);
        const active = nextSuites.find((item) => item.status === "running" || item.status === "cancelling");
        const initial = active ?? nextSuites[0];
        if (initial) {
          setDetailMode("batch");
          setSuiteId(initial.id);
          manualRunSelection.current = false;
        } else if (nextCases[0]) {
          setDetailMode("case");
          setSelectedCaseId(nextCases[0].id);
        }
      })
      .catch((error) => message.error(error instanceof Error ? error.message : String(error)));
    return () => { disposed = true; };
  }, [connectionId]);

  useEffect(() => {
    if (detailMode !== "batch" || !suiteId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await api.getSuiteProgress(suiteId);
        if (disposed) return;
        setProgress(next);
        setCancelling(next.suite.status === "cancelling");
        if (!manualRunSelection.current) {
          setSelectedRunId(next.runs[0]?.id);
        }
        if (!terminalSuiteStatuses.has(next.suite.status)) {
          timer = setTimeout(poll, 1000);
        } else if (connectionId) {
          const [nextCases, nextSuites] = await Promise.all([
            api.listCaseOverviews(connectionId),
            api.listSuiteRuns(connectionId),
          ]);
          if (!disposed) {
            setCases(nextCases);
            setSuiteRuns(nextSuites);
          }
        }
      } catch (error) {
        if (!disposed) message.error(error instanceof Error ? error.message : String(error));
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [connectionId, detailMode, suiteId]);

  useEffect(() => {
    if (detailMode !== "case" || !selectedCaseId) return;
    let disposed = false;
    setCaseHistory([]);
    manualRunSelection.current = false;
    api.listRunSummaries({ testCaseId: selectedCaseId, limit: 50 })
      .then((runs) => {
        if (disposed) return;
        setCaseHistory(runs);
        setSelectedRunId(runs[0]?.id);
      })
      .catch((error) => message.error(error instanceof Error ? error.message : String(error)));
    return () => { disposed = true; };
  }, [detailMode, selectedCaseId]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      return;
    }
    let disposed = false;
    api.getRun(selectedRunId)
      .then((run) => { if (!disposed) setSelectedRun(run); })
      .catch((error) => message.error(error instanceof Error ? error.message : String(error)));
    return () => { disposed = true; };
  }, [selectedRunId]);

  const toolOptions = useMemo(
    () => Array.from(new Set(cases.map((item) => item.toolName))).sort(),
    [cases],
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(cases.flatMap((item) => item.tags))).sort(),
    [cases],
  );
  const filteredCases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter((item) => {
      if (toolFilter !== "all" && item.toolName !== toolFilter) return false;
      if (tagFilter !== "all" && !item.tags.includes(tagFilter)) return false;
      if (statusFilter === "disabled" && item.enabled) return false;
      if (statusFilter === "never" && (!item.enabled || item.lastRun)) return false;
      if (statusFilter === "passed" && (!item.enabled || !item.lastRun?.passed)) return false;
      if (statusFilter === "failed" && (!item.enabled || !item.lastRun || item.lastRun.passed)) return false;
      if (needle && !`${item.name} ${item.toolName} ${item.description ?? ""} ${item.tags.join(" ")}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [cases, query, statusFilter, tagFilter, toolFilter]);
  const groupedCases = useMemo(() => {
    const groups = new Map<string, TestCaseOverview[]>();
    for (const item of filteredCases) {
      const group = groups.get(item.toolName) ?? [];
      group.push(item);
      groups.set(item.toolName, group);
    }
    return Array.from(groups.entries());
  }, [filteredCases]);
  const visibleEnabledIds = useMemo(
    () => filteredCases.filter((item) => item.enabled).map((item) => item.id),
    [filteredCases],
  );
  const visibleSelected = visibleEnabledIds.filter((id) => selectedIds.has(id)).length;
  const selectedCase = cases.find((item) => item.id === selectedCaseId);
  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);

  const toggleVisible = (checked: boolean) => setSelectedIds((current) => {
    const next = new Set(current);
    visibleEnabledIds.forEach((id) => checked ? next.add(id) : next.delete(id));
    return next;
  });
  const toggleCase = (id: string, checked: boolean) => setSelectedIds((current) => {
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });
  const openCase = (id: string) => {
    setSelectedCaseId(id);
    setDetailMode("case");
    setSelectedRunId(undefined);
    setSelectedRun(null);
  };
  const selectSummary = (run: InvocationRunSummary) => {
    manualRunSelection.current = true;
    setSelectedRunId(run.id);
  };
  const startBatch = async () => {
    if (!connectionId || !selectedIds.size) return;
    setStarting(true);
    try {
      const suite = await api.startSuiteRun(connectionId, {
        caseIds: Array.from(selectedIds),
        parallel,
        name: text(`批量运行 · ${selectedIds.size} 个用例 · ${dayjs().format("MM-DD HH:mm")}`, `Batch run · ${selectedIds.size} cases · ${dayjs().format("MM-DD HH:mm")}`),
      });
      setSuiteRuns((current) => [suite, ...current.filter((item) => item.id !== suite.id)]);
      setSuiteId(suite.id);
      setProgress({ suite, runs: [] });
      setDetailMode("batch");
      setSelectedRunId(undefined);
      setSelectedRun(null);
      manualRunSelection.current = false;
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };
  const cancelBatch = async () => {
    if (!suiteId) return;
    setCancelling(true);
    try {
      const suite = await api.cancelSuiteRun(suiteId);
      setProgress((current) => current ? { ...current, suite } : current);
    } catch (error) {
      setCancelling(false);
      message.error(error instanceof Error ? error.message : String(error));
    }
  };
  const runSelectedCase = async () => {
    if (!selectedCase) return;
    setRunningCase(true);
    try {
      const response = await api.runCase(selectedCase.id);
      const [run, history, nextCases] = await Promise.all([
        api.getRun(response.runId),
        api.listRunSummaries({ testCaseId: selectedCase.id, limit: 50 }),
        connectionId ? api.listCaseOverviews(connectionId) : Promise.resolve(cases),
      ]);
      setSelectedRun(run);
      setSelectedRunId(run.id);
      setCaseHistory(history);
      setCases(nextCases);
      manualRunSelection.current = true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningCase(false);
    }
  };

  const casePane = <section className="automation-case-pane">
    <div className="automation-pane-heading">
      <div><strong>{text("用例库", "Case library")}</strong><span>{text(`${cases.length} 个用例`, `${cases.length} cases`)}</span></div>
      <Button size="small" icon={<ReloadOutlined />} aria-label={text("刷新用例", "Refresh cases")} onClick={async () => {
        if (!connectionId) return;
        try { setCases(await api.listCaseOverviews(connectionId)); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
      }} />
    </div>
    <div className="automation-case-filters">
      <Select showSearch optionFilterProp="label" value={connectionId} onChange={setConnectionId} options={connections.map((item) => ({ value: item.id, label: item.name }))} />
      <Input allowClear prefix={<SearchOutlined />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("搜索用例", "Search cases")} />
      <div className="automation-filter-row">
        <Select value={toolFilter} onChange={setToolFilter} options={[{ value: "all", label: "Tool" }, ...toolOptions.map((value) => ({ value, label: value }))]} />
        <Select value={tagFilter} onChange={setTagFilter} options={[{ value: "all", label: "Tags" }, ...tagOptions.map((value) => ({ value, label: value }))]} />
        <Select value={statusFilter} onChange={setStatusFilter} suffixIcon={<FilterOutlined />} options={[
          { value: "all", label: text("全部状态", "All statuses") },
          { value: "passed", label: text("最近通过", "Last passed") },
          { value: "failed", label: text("最近失败", "Last failed") },
          { value: "never", label: text("从未运行", "Never run") },
          { value: "disabled", label: text("已禁用", "Disabled") },
        ]} />
      </div>
    </div>
    <div className="automation-select-row">
      <Checkbox
        checked={visibleEnabledIds.length > 0 && visibleSelected === visibleEnabledIds.length}
        indeterminate={visibleSelected > 0 && visibleSelected < visibleEnabledIds.length}
        onChange={(event) => toggleVisible(event.target.checked)}
      >{text("选择当前筛选结果", "Select filtered cases")}</Checkbox>
      <span>{filteredCases.length}</span>
    </div>
    <div className="automation-case-list">
      {groupedCases.length ? groupedCases.map(([toolName, items]) => <details key={toolName} open className="automation-case-group">
        <summary><span>{toolName}</span><b>{items.length}</b></summary>
        {items.map((item) => <div key={item.id} role="button" tabIndex={0} className={`automation-case-row ${selectedCaseId === item.id && detailMode === "case" ? "is-active" : ""} ${!item.enabled ? "is-disabled" : ""}`} onClick={() => openCase(item.id)} onKeyDown={(event) => { if (event.key === "Enter") openCase(item.id); }}>
          <Checkbox disabled={!item.enabled} checked={selectedIds.has(item.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => toggleCase(item.id, event.target.checked)} />
          <div className="automation-case-copy"><strong title={item.name}>{item.name}</strong><span>{item.tags.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}</span></div>
          <CaseRunState item={item} />
        </div>)}
      </details>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text("没有匹配的测试用例", "No matching test cases")} />}
    </div>
    <div className="automation-case-actions">
      <span>{text(`已选 ${selectedIds.size} 个`, `${selectedIds.size} selected`)}</span>
      <label><span>{text("并发", "Concurrency")}</span><InputNumber min={1} max={8} value={parallel} onChange={(value) => setParallel(value ?? 1)} /></label>
      <Button type="primary" icon={<PlayCircleOutlined />} loading={starting} disabled={!selectedIds.size} onClick={() => void startBatch()}>{text("运行所选", "Run selected")}</Button>
    </div>
  </section>;

  const detailPane = <section className="automation-detail-pane">
    {detailMode === "batch"
      ? <BatchDetail
          progress={progress}
          suites={suiteRuns}
          suiteId={suiteId}
          caseById={caseById}
          selectedRunId={selectedRunId}
          selectedRun={selectedRun}
          cancelling={cancelling}
          onSuiteChange={(id) => { setSuiteId(id); setSelectedRunId(undefined); setSelectedRun(null); manualRunSelection.current = false; }}
          onSelectRun={selectSummary}
          onCancel={() => void cancelBatch()}
          text={text}
        />
      : <CaseDetail
          testCase={selectedCase}
          history={caseHistory}
          selectedRunId={selectedRunId}
          selectedRun={selectedRun}
          running={runningCase}
          onRun={() => void runSelectedCase()}
          onSelectRun={selectSummary}
          text={text}
        />}
  </section>;

  return <div className="automation-page">
    <div className="automation-pagebar"><div><strong>{text("自动化测试", "Automation")}</strong></div></div>
    <ResizablePanels
      className="automation-workspace"
      storageKey="mcp-debug-automation-widths"
      panels={[
        { key: "cases", content: casePane, defaultWidth: 430, minWidth: 300, maxWidth: 560 },
        { key: "details", content: detailPane, flex: true, minWidth: 600 },
      ]}
    />
  </div>;
}

function CaseRunState({ item }: { item: TestCaseOverview }) {
  const { text } = useUi();
  if (!item.enabled) return <StatusBadge status="offline" label={text("禁用", "Disabled")} />;
  if (!item.lastRun) return <StatusBadge status="offline" label={text("未运行", "Never run")} />;
  return <div className="automation-case-state"><StatusBadge status={item.lastRun.passed ? "success" : "error"} label={item.lastRun.passed ? text("通过", "Passed") : text("失败", "Failed")} /><small>{item.lastRun.durationMs} ms</small></div>;
}

function BatchDetail(props: {
  progress: SuiteRunProgress | null;
  suites: SuiteRun[];
  suiteId?: string;
  caseById: Map<string, TestCaseOverview>;
  selectedRunId?: string;
  selectedRun: InvocationRun | null;
  cancelling: boolean;
  onSuiteChange(id: string): void;
  onSelectRun(run: InvocationRunSummary): void;
  onCancel(): void;
  text(zh: string, en: string): string;
}) {
  const { progress, text } = props;
  if (!props.suiteId) return <div className="automation-detail-empty"><Empty description={text("选择用例并开始批量运行", "Select cases and start a batch run")} /></div>;
  if (!progress) return <div className="automation-detail-empty"><Empty description={text("正在加载运行详情", "Loading run details")} /></div>;
  const suite = progress.suite;
  const completed = suite.passed + suite.failed + suite.skipped;
  const percent = suite.total ? Math.round((completed / suite.total) * 100) : 0;
  const active = suite.status === "running" || suite.status === "cancelling";
  return <>
    <div className="automation-detail-heading">
      <div><strong>{text("批量运行", "Batch run")}</strong><StatusBadge status={suite.status === "running" || suite.status === "cancelling" ? "running" : suite.status === "passed" ? "success" : suite.status === "cancelled" ? "warning" : "error"} label={suiteStatusLabel(suite.status, text)} /></div>
      <div><Select value={props.suiteId} onChange={props.onSuiteChange} options={props.suites.map((item) => ({ value: item.id, label: `${dayjs(item.startedAt).format("MM-DD HH:mm:ss")} · ${suiteStatusLabel(item.status, text)}` }))} />{active && <Button danger icon={<StopOutlined />} loading={props.cancelling} onClick={props.onCancel}>{text("停止", "Stop")}</Button>}</div>
    </div>
    <div className="automation-progress-summary">
      <div><span>{completed}/{suite.total}</span><Progress percent={percent} showInfo={false} status={suite.failed ? "exception" : undefined} /></div>
      <Metric label={text("通过", "Passed")} value={suite.passed} tone="success" />
      <Metric label={text("失败", "Failed")} value={suite.failed} tone="danger" />
      <Metric label={text("运行中", "Running")} value={Math.max(0, suite.total - completed)} />
      <Metric label={text("跳过", "Skipped")} value={suite.skipped} />
    </div>
    <RunList runs={progress.runs} caseById={props.caseById} selectedRunId={props.selectedRunId} onSelect={props.onSelectRun} text={text} />
    <RunInspector run={props.selectedRun} text={text} />
  </>;
}

function CaseDetail(props: {
  testCase?: TestCaseOverview;
  history: InvocationRunSummary[];
  selectedRunId?: string;
  selectedRun: InvocationRun | null;
  running: boolean;
  onRun(): void;
  onSelectRun(run: InvocationRunSummary): void;
  text(zh: string, en: string): string;
}) {
  const { testCase, text } = props;
  if (!testCase) return <div className="automation-detail-empty"><Empty description={text("点击左侧用例查看运行历史", "Select a case to view its history")} /></div>;
  const passed = props.history.filter((item) => item.passed).length;
  return <>
    <div className="automation-detail-heading">
      <div className="automation-case-title"><strong title={testCase.name}>{testCase.name}</strong><span>{testCase.toolName}</span></div>
      <Button type="primary" icon={<PlayCircleOutlined />} loading={props.running} disabled={!testCase.enabled} onClick={props.onRun}>{text("运行当前用例", "Run case")}</Button>
    </div>
    <div className="automation-history-summary"><strong>{text("运行历史", "Run history")}</strong><span>{text(`最近 ${props.history.length} 次：${passed} 通过 / ${props.history.length - passed} 失败`, `Last ${props.history.length}: ${passed} passed / ${props.history.length - passed} failed`)}</span></div>
    <RunList runs={props.history} selectedRunId={props.selectedRunId} onSelect={props.onSelectRun} text={text} />
    <RunInspector run={props.selectedRun} text={text} />
  </>;
}

function RunList(props: {
  runs: InvocationRunSummary[];
  caseById?: Map<string, TestCaseOverview>;
  selectedRunId?: string;
  onSelect(run: InvocationRunSummary): void;
  text(zh: string, en: string): string;
}) {
  const { text } = props;
  return <div className="automation-run-list"><Table<InvocationRunSummary>
    size="small"
    rowKey="id"
    dataSource={props.runs}
    pagination={false}
    scroll={{ y: 220 }}
    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text("暂无运行结果", "No run results")} /> }}
    rowClassName={(row) => row.id === props.selectedRunId ? "is-selected-run" : ""}
    onRow={(row) => ({ onClick: () => props.onSelect(row) })}
    columns={[
      { title: text("状态", "Status"), key: "status", width: 100, render: (_, row) => <StatusBadge status={row.passed ? "success" : "error"} label={row.passed ? text("通过", "Passed") : text("失败", "Failed")} /> },
      { title: text("用例", "Case"), key: "case", ellipsis: true, render: (_, row) => props.caseById?.get(row.testCaseId ?? "")?.name ?? dayjs(row.startedAt).format("YYYY-MM-DD HH:mm:ss") },
      { title: "Tool", dataIndex: "toolName", ellipsis: true },
      { title: text("耗时", "Duration"), dataIndex: "durationMs", width: 92, render: (value) => `${value} ms` },
      { title: text("断言", "Assertions"), key: "assert", width: 86, render: (_, row) => row.assertPassed == null ? "—" : row.assertPassed ? text("通过", "Pass") : text("失败", "Fail") },
      { title: "Schema", key: "schema", width: 86, render: (_, row) => row.schemaValid == null ? "—" : row.schemaValid ? text("通过", "Valid") : text("失败", "Invalid") },
    ]}
  /></div>;
}

function RunInspector({ run, text }: { run: InvocationRun | null; text(zh: string, en: string): string }) {
  const result: Partial<InvokeResponse> | null = run ? {
    runId: run.id,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs: run.durationMs,
    status: run.status,
    isError: run.isError,
    content: run.resultContent,
    structuredContent: run.resultStructured,
    schemaValidation: run.schemaValidation,
    assertResult: run.assertResult,
    protocolError: run.protocolError,
  } : null;
  return <div className="automation-run-inspector"><div className="automation-inspector-heading"><strong>{text("运行详情", "Run details")}</strong>{run && <span>{dayjs(run.startedAt).format("YYYY-MM-DD HH:mm:ss")}</span>}</div><div className="automation-inspector-scroll"><ResultViewer result={result} requestArguments={run?.requestArguments} rawResponse={run?.rawResponse} /></div></div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  return <div><span>{label}</span><strong className={tone ? `tone-${tone}` : undefined}>{value}</strong></div>;
}

function suiteStatusLabel(status: SuiteRun["status"], text: (zh: string, en: string) => string) {
  if (status === "running") return text("运行中", "Running");
  if (status === "cancelling") return text("正在停止", "Stopping");
  if (status === "passed") return text("已通过", "Passed");
  if (status === "failed") return text("已失败", "Failed");
  return text("已取消", "Cancelled");
}
