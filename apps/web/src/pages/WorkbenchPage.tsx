import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  type MenuProps,
} from "antd";
import {
  ArrowLeftOutlined,
  CloudSyncOutlined,
  EllipsisOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import type { InvocationRun, InvokeResponse, McpConnection, McpTool, TestCase } from "@mcp-debug/shared";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import dayjs from "dayjs";
import { api } from "../api/client";
import { SchemaForm } from "../components/SchemaForm";
import { ResultViewer } from "../components/ResultViewer";
import { CaseEditor, caseToForm, type CaseFormValue } from "../components/CaseEditor";
import { ResizablePanels } from "../components/ResizablePanels";
import { StatusBadge } from "../components/StatusBadge";
import { useUi } from "../ui";

function useWorkbenchWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => { const onResize = () => setWidth(window.innerWidth); window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize); }, []);
  return width;
}

export function WorkbenchPage() {
  const { id = "" } = useParams();
  const { text, resolvedTheme } = useUi();
  const viewportWidth = useWorkbenchWidth();
  const narrow = viewportWidth < 1280;
  const compactThreeColumn = viewportWidth <= 1320;
  const [conn, setConn] = useState<McpConnection | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [q, setQ] = useState("");
  const [toolName, setToolName] = useState<string>();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [invoking, setInvoking] = useState(false);
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [runs, setRuns] = useState<InvocationRun[]>([]);
  const [caseModal, setCaseModal] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [caseForm, setCaseForm] = useState<CaseFormValue>(caseToForm());
  const [suiteLoading, setSuiteLoading] = useState(false);
  const [mainTab, setMainTab] = useState("invoke");
  const [narrowPane, setNarrowPane] = useState<"request" | "result">("request");
  const selected = useMemo(() => tools.find((tool) => tool.name === toolName) ?? null, [tools, toolName]);

  const reloadTools = async (query?: string) => {
    const items = await api.listTools(id, query);
    setTools(items);
    setToolName((current) => current && items.some((item) => item.name === current) ? current : items[0]?.name);
  };
  const reloadMeta = async () => setConn((await api.listConnections()).find((item) => item.id === id) ?? null);
  const reloadCases = async (name?: string) => setCases(name ? await api.listCases(id, name) : []);
  const reloadRuns = async (name?: string) => setRuns(name ? await api.listRuns({ connectionId: id, toolName: name, limit: 50 }) : []);

  useEffect(() => { Promise.all([reloadMeta(), reloadTools()]).catch((error) => message.error(error instanceof Error ? error.message : String(error))); }, [id]);
  useEffect(() => { setFormData({}); setResult(null); setMainTab("invoke"); void reloadCases(toolName); void reloadRuns(toolName); }, [toolName, id]);

  const invoke = async (argumentsData: Record<string, unknown>) => {
    if (!toolName) return;
    setInvoking(true);
    try {
      const response = await api.invoke(id, toolName, { arguments: argumentsData, save: true });
      setResult(response);
      setNarrowPane("result");
      await reloadRuns(toolName);
      const ok = response.status === "success" && !response.isError;
      (ok ? message.success : response.isError ? message.warning : message.error)(text(ok ? `调用成功 · ${response.durationMs} ms` : `调用失败 · ${response.durationMs} ms`, ok ? `Call succeeded · ${response.durationMs} ms` : `Call failed · ${response.durationMs} ms`));
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    finally { setInvoking(false); }
  };

  const openCreateCase = () => {
    setEditingCase(null);
    setCaseForm(caseToForm({ name: `${toolName}-case-${dayjs().format("HHmmss")}`, arguments: formData, assert: { expectIsError: false }, tags: [], enabled: true }));
    setCaseModal(true);
  };
  const openEditCase = (testCase: TestCase) => { setEditingCase(testCase); setCaseForm(caseToForm(testCase)); setCaseModal(true); };
  const saveCase = async () => {
    if (!toolName || !caseForm.name.trim()) { message.error(text("请填写用例名称", "Enter a case name")); return; }
    try {
      if (editingCase) await api.updateCase(editingCase.id, caseForm); else await api.createCase(id, toolName, caseForm);
      message.success(text(editingCase ? "用例已更新" : "用例已创建", editingCase ? "Case updated" : "Case created"));
      setCaseModal(false);
      await reloadCases(toolName);
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  };

  const toolsPanel = <div className="tools-pane">
    <div className="pane-heading"><div><strong>Tools</strong><span>{tools.length}</span></div></div>
    <div className="tools-sidebar-header"><Input.Search value={q} onChange={(event) => setQ(event.target.value)} placeholder={text("搜索 Tools", "Search tools")} allowClear onSearch={(value) => void reloadTools(value)} /></div>
    <div className="tools-list">{tools.map((tool) => <button key={tool.id} type="button" className={`tool-item ${tool.name === toolName ? "active" : ""}`} onClick={() => setToolName(tool.name)} title={tool.description || tool.name}><span className="name">{tool.title || tool.name}</span><span className="desc">{tool.description || tool.name}</span></button>)}{!tools.length && <Empty description={text("暂无 Tools", "No tools")} />}</div>
  </div>;

  const loadRun = (run: InvocationRun, reuse = false) => {
    setFormData(run.requestArguments);
    if (reuse) { setMainTab("invoke"); setNarrowPane("request"); return; }
    setResult({ runId: run.id, startedAt: run.startedAt, endedAt: run.endedAt, durationMs: run.durationMs, status: run.status, isError: run.isError, content: run.resultContent, structuredContent: run.resultStructured, schemaValidation: run.schemaValidation, assertResult: run.assertResult, protocolError: run.protocolError });
    setNarrowPane("result");
  };

  const requestPanel = !selected ? <div className="panel-scroll center-empty"><Empty description={text("选择一个 Tool 开始调试", "Select a tool to start debugging")} /></div> : <div className="request-pane">
    <div className="workbench-center-header"><div className="title" title={selected.title || selected.name}>{selected.title || selected.name}</div><p className="desc">{selected.description || text("无描述", "No description")}</p></div>
    <div className="panel-scroll"><Tabs activeKey={mainTab} onChange={setMainTab} items={[
      { key: "invoke", label: text("调用", "Call"), children: <div className="invoke-tab"><div className="sub-toolbar"><Button icon={<SaveOutlined />} onClick={openCreateCase}>{text("另存为用例", "Save as case")}</Button></div><SchemaForm schema={selected.inputSchema} formData={formData} onChange={setFormData} onSubmit={invoke} loading={invoking} /></div> },
      { key: "cases", label: `${text("用例", "Cases")} (${cases.length})`, children: <><div className="sub-toolbar"><Button type="primary" icon={<PlusOutlined />} onClick={openCreateCase}>{text("新建用例", "New case")}</Button></div><Table rowKey="id" dataSource={cases} pagination={false} size="small" columns={[
        { title: text("名称", "Name"), dataIndex: "name", ellipsis: true },
        { title: "Tags", dataIndex: "tags", render: (tags: string[]) => tags?.map((tag) => <Tag key={tag}>{tag}</Tag>) },
        { title: text("状态", "Status"), dataIndex: "enabled", width: 90, render: (value) => <StatusBadge status={value ? "success" : "offline"} label={value ? text("启用", "Enabled") : text("停用", "Disabled")} /> },
        { title: text("操作", "Actions"), width: 160, render: (_, row) => {
          const menu: MenuProps["items"] = [{ key: "edit", label: text("编辑", "Edit"), onClick: () => openEditCase(row) }, { key: "load", label: text("载入参数", "Load arguments"), onClick: () => { setFormData(row.arguments); setMainTab("invoke"); } }, { type: "divider" }, { key: "delete", danger: true, label: <Popconfirm title={text("删除该用例？", "Delete this case?")} onConfirm={async () => { await api.deleteCase(row.id); await reloadCases(toolName); }}>{text("删除", "Delete")}</Popconfirm> }];
          return <Space><Button icon={<PlayCircleOutlined />} onClick={async () => { const response = await api.runCase(row.id); setResult(response); setFormData(row.arguments); setNarrowPane("result"); await reloadRuns(toolName); }}>{text("运行", "Run")}</Button><Dropdown menu={{ items: menu }}><Button icon={<EllipsisOutlined />} /></Dropdown></Space>;
        } },
      ]} /></> },
      { key: "history", label: `${text("历史", "History")} (${runs.length})`, children: <Table rowKey="id" dataSource={runs} size="small" pagination={{ pageSize: 10 }} columns={[
        { title: text("时间", "Time"), dataIndex: "startedAt", render: (value) => dayjs(value).format("MM-DD HH:mm:ss") },
        { title: text("耗时", "Duration"), dataIndex: "durationMs", width: 100, render: (value) => `${value} ms` },
        { title: text("状态", "Status"), key: "status", width: 140, render: (_, row) => <StatusBadge status={row.isError ? "error" : row.status === "success" ? "success" : "warning"} label={row.status} /> },
        { title: text("操作", "Actions"), width: 150, render: (_, row) => <Space><Button onClick={() => loadRun(row)}>{text("查看", "View")}</Button><Dropdown menu={{ items: [{ key: "reuse", label: text("复用参数", "Reuse arguments"), onClick: () => loadRun(row, true) }, { type: "divider" }, { key: "delete", danger: true, label: <Popconfirm title={text("删除记录？", "Delete run?")} onConfirm={async () => { await api.deleteRun(row.id); await reloadRuns(toolName); }}>{text("删除", "Delete")}</Popconfirm> }] }}><Button icon={<EllipsisOutlined />} /></Dropdown></Space> },
      ]} /> },
      { key: "schema", label: "Schema", children: <div className="schema-stack"><SchemaCode title="inputSchema" value={selected.inputSchema} dark={resolvedTheme === "dark"} height="300px" /><SchemaCode title="outputSchema" value={selected.outputSchema ?? null} dark={resolvedTheme === "dark"} height="220px" /></div> },
    ]} /></div>
  </div>;
  const resultPanel = <div className="result-pane"><div className="pane-heading"><div><strong>{text("运行结果", "Run result")}</strong>{result && <StatusBadge status={result.isError ? "error" : result.status === "success" ? "success" : "warning"} label={result.status} />}</div></div><div className="result-scroll"><ResultViewer result={result} /></div></div>;

  return <div className="workbench-page">
    <div className="workbench-pagebar">
      <div className="workbench-context"><Link to="/connections"><Button icon={<ArrowLeftOutlined />} aria-label={text("返回连接", "Back to connections")} /></Link><div><strong>{conn?.name ?? text("工作台", "Workbench")}</strong><span>{selected?.name ?? text("选择 Tool", "Select a tool")}</span></div><StatusBadge status={conn?.live ? "online" : "offline"} label={conn?.live ? text("在线", "Online") : text("离线", "Offline")} /></div>
      <Space><Button icon={<CloudSyncOutlined />} onClick={async () => { try { const response = await api.syncTools(id); message.success(text(`已同步 ${response.count} 个 Tools`, `Synced ${response.count} tools`)); await Promise.all([reloadTools(q), reloadMeta()]); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } }}>{text("同步 Tools", "Sync tools")}</Button><Button loading={suiteLoading} onClick={async () => { setSuiteLoading(true); try { const suite = await api.runSuite(id, { toolNames: toolName ? [toolName] : undefined, name: `tool-${toolName ?? "all"}` }); message.success(text(`执行完成：通过 ${suite.passed}/${suite.total}，失败 ${suite.failed}`, `Run finished: ${suite.passed}/${suite.total} passed, ${suite.failed} failed`)); await reloadRuns(toolName); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSuiteLoading(false); } }}>{text("运行当前 Tool 用例", "Run current tool cases")}</Button></Space>
    </div>
    {narrow ? <div className="workbench-narrow"><div className="narrow-tools">{toolsPanel}</div><div className="narrow-main"><Segmented block value={narrowPane} onChange={(value) => setNarrowPane(value as "request" | "result")} options={[{ value: "request", label: text("请求", "Request") }, { value: "result", label: text("结果", "Result") }]} />{narrowPane === "request" ? requestPanel : resultPanel}</div></div> : <ResizablePanels storageKey={`mcp-debug-workbench-widths:${id}:${compactThreeColumn ? "compact" : "standard"}`} panels={[
      { key: "tools", content: toolsPanel, defaultWidth: compactThreeColumn ? 220 : 280, minWidth: compactThreeColumn ? 200 : 220, maxWidth: 380 },
      { key: "form", content: requestPanel, defaultWidth: compactThreeColumn ? 520 : Math.min(1000, Math.max(520, Math.round((viewportWidth - 80) * 0.45))), minWidth: 520, maxWidth: 1000 },
      { key: "result", content: resultPanel, flex: true, minWidth: 420 },
    ]} />}
    <Modal title={editingCase ? text("编辑用例", "Edit case") : text("新建用例", "New case")} open={caseModal} onCancel={() => setCaseModal(false)} onOk={() => void saveCase()} width={720} destroyOnHidden><CaseEditor value={caseForm} onChange={setCaseForm} /></Modal>
  </div>;
}

function SchemaCode({ title, value, dark, height }: { title: string; value: unknown; dark: boolean; height: string }) {
  return <div><Typography.Text strong>{title}</Typography.Text><div className="json-editor"><CodeMirror value={JSON.stringify(value, null, 2)} height={height} extensions={[json()]} editable={false} theme={dark ? "dark" : "light"} /></div></div>;
}
