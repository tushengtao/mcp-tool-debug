import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined,
  CloudSyncOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import type {
  InvocationRun,
  InvokeResponse,
  McpConnection,
  McpTool,
  TestCase,
} from "@mcp-debug/shared";
import { api } from "../api/client";
import { SchemaForm } from "../components/SchemaForm";
import { ResultViewer } from "../components/ResultViewer";
import { CaseEditor, caseToForm, type CaseFormValue } from "../components/CaseEditor";
import { ResizablePanels } from "../components/ResizablePanels";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import dayjs from "dayjs";

export function WorkbenchPage() {
  const { id = "" } = useParams();
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

  const selected = useMemo(
    () => tools.find((t) => t.name === toolName) ?? null,
    [tools, toolName],
  );

  const reloadTools = async (query?: string) => {
    const list = await api.listTools(id, query);
    setTools(list);
    if (!toolName && list[0]) setToolName(list[0].name);
  };

  const reloadMeta = async () => {
    const list = await api.listConnections();
    setConn(list.find((c) => c.id === id) ?? null);
  };

  const reloadCases = async (name?: string) => {
    if (!name) return setCases([]);
    setCases(await api.listCases(id, name));
  };

  const reloadRuns = async (name?: string) => {
    if (!name) return setRuns([]);
    setRuns(await api.listRuns({ connectionId: id, toolName: name, limit: 50 }));
  };

  useEffect(() => {
    (async () => {
      try {
        await reloadMeta();
        await reloadTools();
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  useEffect(() => {
    setFormData({});
    setResult(null);
    setMainTab("invoke");
    reloadCases(toolName);
    reloadRuns(toolName);
  }, [toolName, id]);

  const invoke = async () => {
    if (!toolName) return;
    setInvoking(true);
    try {
      const res = await api.invoke(id, toolName, { arguments: formData, save: true });
      setResult(res);
      reloadRuns(toolName);
      if (res.status === "success" && !res.isError) {
        message.success(`成功 · ${res.durationMs} ms`);
      } else if (res.status === "tool_error" || res.isError) {
        message.warning(`工具错误 · ${res.durationMs} ms`);
      } else if (res.status === "timeout") {
        message.error(`超时 · ${res.durationMs} ms`);
      } else {
        message.error(`失败(${res.status}) · ${res.durationMs} ms`);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setInvoking(false);
    }
  };

  const openCreateCase = () => {
    setEditingCase(null);
    setCaseForm(
      caseToForm({
        name: `${toolName}-case-${dayjs().format("HHmmss")}`,
        arguments: formData,
        assert: { expectIsError: false },
        tags: [],
        enabled: true,
      }),
    );
    setCaseModal(true);
  };

  const openEditCase = (tc: TestCase) => {
    setEditingCase(tc);
    setCaseForm(caseToForm(tc));
    setCaseModal(true);
  };

  const saveCase = async () => {
    if (!toolName) return;
    if (!caseForm.name.trim()) {
      message.error("请填写用例名称");
      return;
    }
    try {
      if (editingCase) {
        await api.updateCase(editingCase.id, caseForm);
        message.success("用例已更新");
      } else {
        await api.createCase(id, toolName, caseForm);
        message.success("用例已创建");
      }
      setCaseModal(false);
      reloadCases(toolName);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const leftPanel = (
    <>
      <div className="tools-sidebar-header">
        <Input.Search
          placeholder="搜索 Tools"
          allowClear
          onSearch={async (value) => {
            setQ(value);
            await reloadTools(value);
          }}
        />
      </div>
      <div className="tools-list">
        {tools.map((t) => (
          <div
            key={t.id}
            className={`tool-item ${t.name === toolName ? "active" : ""}`}
            onClick={() => setToolName(t.name)}
            title={t.description || t.name}
          >
            <div className="name">{t.title || t.name}</div>
            <div className="desc">{t.description || t.name}</div>
          </div>
        ))}
        {!tools.length ? <Empty style={{ marginTop: 40 }} description="暂无 Tools" /> : null}
      </div>
    </>
  );

  const centerPanel = !selected ? (
    <div className="panel-scroll">
      <Empty description="请选择左侧 Tool" />
    </div>
  ) : (
    <>
      <div className="workbench-center-header">
        <div className="title" title={selected.title || selected.name}>
          {selected.title || selected.name}
        </div>
        <p className="desc" title={selected.description || ""}>
          {selected.description || "无描述"}
        </p>
      </div>
      <div className="panel-scroll">
        <Tabs
          activeKey={mainTab}
          onChange={setMainTab}
          items={[
            {
              key: "invoke",
              label: "调用",
              children: (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <Button
                      icon={<SaveOutlined />}
                      onClick={openCreateCase}
                      style={{ marginRight: 8 }}
                    >
                      另存为用例
                    </Button>
                  </div>
                  <SchemaForm
                    schema={selected.inputSchema}
                    formData={formData}
                    onChange={setFormData}
                    onSubmit={invoke}
                    loading={invoking}
                  />
                </div>
              ),
            },
            {
              key: "cases",
              label: `用例 (${cases.length})`,
              children: (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateCase}>
                      新建用例
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    dataSource={cases}
                    pagination={false}
                    scroll={{ x: true }}
                    columns={[
                      { title: "名称", dataIndex: "name", ellipsis: true },
                      {
                        title: "Tags",
                        dataIndex: "tags",
                        render: (tags: string[]) =>
                          tags?.map((t) => <Tag key={t}>{t}</Tag>),
                      },
                      {
                        title: "启用",
                        dataIndex: "enabled",
                        width: 70,
                        render: (v) => (v ? "是" : "否"),
                      },
                      {
                        title: "操作",
                        width: 260,
                        render: (_, row) => (
                          <Space wrap>
                            <Button
                              size="small"
                              icon={<PlayCircleOutlined />}
                              onClick={async () => {
                                try {
                                  const res = await api.runCase(row.id);
                                  setResult(res);
                                  setFormData(row.arguments);
                                  message.success(
                                    res.assertResult
                                      ? res.assertResult.passed
                                        ? "断言通过"
                                        : "断言失败"
                                      : "执行完成",
                                  );
                                  reloadRuns(toolName);
                                } catch (e) {
                                  message.error(
                                    e instanceof Error ? e.message : String(e),
                                  );
                                }
                              }}
                            >
                              运行
                            </Button>
                            <Button size="small" onClick={() => openEditCase(row)}>
                              编辑
                            </Button>
                            <Button
                              size="small"
                              onClick={() => {
                                setFormData(row.arguments);
                                setMainTab("invoke");
                                message.info("参数已载入调用表单");
                              }}
                            >
                              载入参数
                            </Button>
                            <Popconfirm
                              title="删除该用例？"
                              onConfirm={async () => {
                                await api.deleteCase(row.id);
                                reloadCases(toolName);
                              }}
                            >
                              <Button size="small" danger>
                                删除
                              </Button>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "history",
              label: `历史 (${runs.length})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={runs}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: true }}
                  columns={[
                    {
                      title: "发起时间",
                      dataIndex: "startedAt",
                      render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
                    },
                    { title: "耗时(ms)", dataIndex: "durationMs", width: 100 },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (s, row) => (
                        <Tag color={row.isError ? "error" : "success"}>{s}</Tag>
                      ),
                    },
                    { title: "来源", dataIndex: "source", width: 90 },
                    {
                      title: "操作",
                      width: 220,
                      render: (_, row) => (
                        <Space wrap>
                          <Button
                            size="small"
                            onClick={() => {
                              setFormData(row.requestArguments);
                              setResult({
                                runId: row.id,
                                startedAt: row.startedAt,
                                endedAt: row.endedAt,
                                durationMs: row.durationMs,
                                status: row.status,
                                isError: row.isError,
                                content: row.resultContent,
                                structuredContent: row.resultStructured,
                                schemaValidation: row.schemaValidation,
                                assertResult: row.assertResult,
                                protocolError: row.protocolError,
                              });
                              message.info("已载入该次结果");
                            }}
                          >
                            查看
                          </Button>
                          <Button
                            size="small"
                            onClick={() => {
                              setFormData(row.requestArguments);
                              setMainTab("invoke");
                              message.info("参数已复制到表单");
                            }}
                          >
                            重用参数
                          </Button>
                          <Popconfirm
                            title="删除记录？"
                            onConfirm={async () => {
                              await api.deleteRun(row.id);
                              reloadRuns(toolName);
                            }}
                          >
                            <Button size="small" danger>
                              删除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: "schema",
              label: "Schema",
              children: (
                <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <Typography.Text strong>inputSchema</Typography.Text>
                    <div className="json-editor" style={{ marginTop: 8 }}>
                      <CodeMirror
                        value={JSON.stringify(selected.inputSchema, null, 2)}
                        height="280px"
                        extensions={[json()]}
                        editable={false}
                      />
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Typography.Text strong>outputSchema</Typography.Text>
                    <div className="json-editor" style={{ marginTop: 8 }}>
                      <CodeMirror
                        value={JSON.stringify(selected.outputSchema ?? null, null, 2)}
                        height="220px"
                        extensions={[json()]}
                        editable={false}
                      />
                    </div>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </>
  );

  const rightPanel = (
    <div className="result-pane">
      <ResultViewer result={result} />
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Space wrap>
          <Link to="/connections">
            <Button icon={<ArrowLeftOutlined />}>连接列表</Button>
          </Link>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {conn?.name ?? "工作台"}
          </Typography.Title>
          {conn?.live ? <Tag color="success">在线</Tag> : <Tag>离线</Tag>}
        </Space>
        <Space wrap>
          <Button
            icon={<CloudSyncOutlined />}
            onClick={async () => {
              try {
                const res = await api.syncTools(id);
                message.success(`同步 ${res.count} 个 Tools`);
                await reloadTools(q);
                await reloadMeta();
              } catch (e) {
                message.error(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            同步 Tools
          </Button>
          <Button
            loading={suiteLoading}
            onClick={async () => {
              setSuiteLoading(true);
              try {
                const suite = await api.runSuite(id, {
                  toolNames: toolName ? [toolName] : undefined,
                  name: `tool-${toolName ?? "all"}`,
                });
                message.success(
                  `套件完成：通过 ${suite?.passed}/${suite?.total}，失败 ${suite?.failed}`,
                );
                reloadRuns(toolName);
              } catch (e) {
                message.error(e instanceof Error ? e.message : String(e));
              } finally {
                setSuiteLoading(false);
              }
            }}
          >
            跑当前 Tool 全部用例
          </Button>
        </Space>
      </div>

      <ResizablePanels
        storageKey={`mcp-debug-workbench-widths:${id}`}
        panels={[
          {
            key: "tools",
            content: leftPanel,
            defaultWidth: 280,
            minWidth: 200,
            maxWidth: 480,
          },
          {
            key: "form",
            content: centerPanel,
            defaultWidth: 420,
            minWidth: 280,
            maxWidth: 900,
          },
          {
            key: "result",
            content: rightPanel,
            flex: true,
            minWidth: 280,
          },
        ]}
      />

      <Modal
        title={editingCase ? "编辑用例" : "新建用例"}
        open={caseModal}
        onCancel={() => setCaseModal(false)}
        onOk={saveCase}
        width={720}
        destroyOnClose
      >
        <CaseEditor value={caseForm} onChange={setCaseForm} />
      </Modal>
    </div>
  );
}
