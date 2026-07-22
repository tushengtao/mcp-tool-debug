import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  type MenuProps,
} from "antd";
import {
  CloudSyncOutlined,
  CopyOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  EditOutlined,
  EllipsisOutlined,
  ExportOutlined,
  ImportOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { McpConnection, TransportType } from "@mcp-debug/shared";
import dayjs from "dayjs";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUi } from "../ui";
import mcpIcon from "../assets/mcp-icon.png";

type ConnectionForm = {
  name: string;
  url: string;
  description?: string;
  transport: TransportType;
  timeoutMs: number;
  headers: HeaderFormRow[];
};

type HeaderFormRow = {
  name: string;
  value?: string;
  originalName?: string;
};

const bearerHeader = (): HeaderFormRow => ({ name: "Authorization", value: "Bearer " });

export function ConnectionsPage() {
  const { text, defaultTimeoutMs, transportPreference } = useUi();
  const [list, setList] = useState<McpConnection[]>([]);
  const [toolCounts, setToolCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<McpConnection | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "online" | "offline">("all");
  const [form] = Form.useForm<ConnectionForm>();
  const watchedHeaders = Form.useWatch("headers", form) ?? [];
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const connections = await api.listConnections();
      setList(connections);
      const counts = await Promise.allSettled(
        connections.map(async (connection) => [connection.id, (await api.listTools(connection.id)).length] as const),
      );
      setToolCounts(Object.fromEntries(counts.flatMap((item) => item.status === "fulfilled" ? [item.value] : [])));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => list.filter((connection) => {
    const matchesStatus = status === "all" || (status === "online" ? connection.live : !connection.live);
    const haystack = `${connection.name} ${connection.description ?? ""} ${connection.url}`.toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  }), [list, query, status]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      transport: transportPreference,
      timeoutMs: defaultTimeoutMs,
      headers: [bearerHeader()],
    });
    setOpen(true);
  };

  const openEdit = (connection: McpConnection) => {
    setEditing(connection);
    form.resetFields();
    form.setFieldsValue({
      name: connection.name,
      url: connection.url,
      description: connection.description ?? undefined,
      transport: connection.transport,
      timeoutMs: connection.timeoutMs,
      headers: connection.headerNames.length
        ? connection.headerNames.map((name) => ({
            name,
            value: undefined,
            originalName: name,
          }))
        : [bearerHeader()],
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const rows = values.headers ?? [];
    const names = rows.map((row) => row.name?.trim()).filter(Boolean);
    if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) {
      message.error(text("请求头名称不能重复", "Header names must be unique"));
      return;
    }

    const isUnusedBearerTemplate = (row: HeaderFormRow) => !row.originalName
      && row.name?.trim().toLocaleLowerCase() === "authorization"
      && row.value?.trim().toLocaleLowerCase() === "bearer";

    try {
      const body = { name: values.name, description: values.description, url: values.url, transport: values.transport, timeoutMs: values.timeoutMs };
      if (editing) {
        const headerPatch: Record<string, string | null> = {};
        const retainedNames = new Set(
          rows.filter((row) => row.originalName).map((row) => row.originalName!),
        );
        for (const name of editing.headerNames) {
          if (!retainedNames.has(name)) headerPatch[name] = null;
        }
        for (const row of rows) {
          const name = row.name?.trim();
          if (row.originalName) {
            if (row.value !== undefined && row.value.length > 0) headerPatch[row.originalName] = row.value;
            continue;
          }
          if (isUnusedBearerTemplate(row) || (!name && !row.value)) continue;
          if (!name || !row.value?.trim()) {
            message.error(text("新增请求头需要同时填写名称和值", "New headers require both a name and value"));
            return;
          }
          headerPatch[name] = row.value;
        }
        await api.updateConnection(editing.id, Object.keys(headerPatch).length ? { ...body, headerPatch } : body);
      } else {
        const headers: Record<string, string> = {};
        for (const row of rows) {
          const name = row.name?.trim();
          if (isUnusedBearerTemplate(row) || (!name && !row.value)) continue;
          if (!name || !row.value?.trim()) {
            message.error(text("请求头需要同时填写名称和值", "Headers require both a name and value"));
            return;
          }
          headers[name] = row.value;
        }
        await api.createConnection({ ...body, headers });
      }
      message.success(text(editing ? "连接已更新" : "连接已创建", editing ? "Connection updated" : "Connection created"));
      setOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const connect = async (connection: McpConnection) => {
    try {
      if (connection.live) await api.disconnect(connection.id);
      else await api.connect(connection.id);
      message.success(text(connection.live ? "连接已断开" : "连接成功", connection.live ? "Disconnected" : "Connected"));
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      await load();
    }
  };

  const sync = async (connection: McpConnection) => {
    try {
      const result = await api.syncTools(connection.id);
      message.success(text(`已同步 ${result.count} 个 Tools`, `Synced ${result.count} tools`));
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const exportAll = () => Modal.confirm({
    title: text("导出包含连接凭据", "Export contains credentials"),
    content: text("导出文件包含 Authorization、Cookie、API Key 等 Header，请安全保管。", "The export includes Authorization, Cookie and API key headers. Store it securely."),
    okText: text("继续导出", "Export"),
    cancelText: text("取消", "Cancel"),
    onOk: async () => {
      const data = await api.exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mcp-debug-export-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  const importAll = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await api.importAll(JSON.parse(await file.text()));
        message.success(text(`已导入 ${result.connections} 个连接 / ${result.cases} 个用例`, `Imported ${result.connections} connections / ${result.cases} cases`));
        await load();
      } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    };
    input.click();
  };

  const globalMenu: MenuProps["items"] = [
    { key: "import", icon: <ImportOutlined />, label: text("导入备份", "Import backup"), onClick: importAll },
    { key: "export", icon: <ExportOutlined />, label: text("导出备份", "Export backup"), onClick: exportAll },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title={text("连接", "Connections")}
        actions={<>
          <Dropdown menu={{ items: globalMenu }}><Button icon={<EllipsisOutlined />}>{text("更多", "More")}</Button></Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{text("新建连接", "New connection")}</Button>
        </>}
      />

      <div className="metric-strip" aria-label={text("连接摘要", "Connection summary")}>
        <div><span>{text("全部连接", "Connections")}</span><strong>{list.length}</strong></div>
        <div><span>{text("在线", "Online")}</span><strong className="tone-success">{list.filter((item) => item.live).length}</strong></div>
        <div><span>{text("已同步 Tools", "Synced tools")}</span><strong>{Object.values(toolCounts).reduce((sum, value) => sum + value, 0)}</strong></div>
      </div>

      <section className="surface-panel">
        <div className="table-toolbar">
          <Input prefix={<SearchOutlined />} allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("搜索名称、URL 或描述", "Search name, URL or description")} />
          <Select value={status} onChange={setStatus} options={[
            { value: "all", label: text("全部状态", "All statuses") },
            { value: "online", label: text("在线", "Online") },
            { value: "offline", label: text("离线", "Offline") },
          ]} />
        </div>
        <Table
          className="connection-table"
          loading={loading}
          rowKey="id"
          dataSource={filtered}
          pagination={false}
          locale={{ emptyText: <Empty description={text("还没有连接", "No connections yet")} /> }}
          onRow={(connection) => ({ onClick: () => navigate(`/connections/${connection.id}/tools`) })}
          columns={[
            { title: text("连接", "Connection"), key: "name", render: (_, row) => <div className="entity-cell"><span className="entity-icon entity-icon--mcp"><img src={mcpIcon} alt="" /></span><div><strong>{row.name}</strong><span>{row.description || text("", "")}</span></div></div> },
            { title: text("状态", "Status"), key: "status", width: 118, render: (_, row) => <StatusBadge status={row.live ? "online" : row.lastError ? "error" : "offline"} label={row.live ? text("在线", "Online") : row.lastError ? text("需重连", "Reconnect") : text("离线", "Offline")} /> },
            { title: text("传输协议", "Transport"), dataIndex: "transport", width: 150, render: (value) => <Tag>{value}</Tag> },
            { title: "Endpoint", dataIndex: "url", ellipsis: true, render: (value) => <Typography.Text className="mono" copyable={{ text: value }} ellipsis>{value}</Typography.Text> },
            { title: "Tools", key: "tools", width: 80, align: "right", render: (_, row) => toolCounts[row.id] ?? "—" },
            { title: text("最近活动", "Last activity"), dataIndex: "lastConnectedAt", width: 168, render: (value) => value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—" },
            { title: text("操作", "Actions"), key: "actions", width: 260, render: (_, row) => {
              const menu: MenuProps["items"] = [
                { key: "edit", icon: <EditOutlined />, label: text("编辑", "Edit"), onClick: () => openEdit(row) },
                { key: "copy", icon: <CopyOutlined />, label: text("复制地址", "Copy endpoint"), onClick: async () => { await navigator.clipboard.writeText(row.url); message.success(text("已复制", "Copied")); } },
                { type: "divider" },
                { key: "delete", danger: true, icon: <DeleteOutlined />, label: <Popconfirm title={text("删除该连接？", "Delete this connection?")} onConfirm={async () => { await api.deleteConnection(row.id); await load(); }}>{text("删除", "Delete")}</Popconfirm> },
              ];
              return <Space onClick={(event) => event.stopPropagation()}>
                <Button icon={row.live ? <DisconnectOutlined /> : <LinkOutlined />} onClick={() => void connect(row)}>{row.live ? text("断开", "Disconnect") : text("连接", "Connect")}</Button>
                <Button icon={<CloudSyncOutlined />} onClick={() => void sync(row)}>{text("同步", "Sync")}</Button>
                <Dropdown menu={{ items: menu }} trigger={["click"]}><Button aria-label={text("更多操作", "More actions")} icon={<EllipsisOutlined />} /></Dropdown>
              </Space>;
            } },
          ]}
        />
      </section>

      <Modal className="connection-modal" width={680} title={editing ? text("编辑连接", "Edit connection") : text("新建 MCP 连接", "New MCP connection")} open={open} onCancel={() => { setOpen(false); form.resetFields(); }} onOk={() => void submit()} okText={text("保存", "Save")} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item name="name" label={text("名称", "Name")} rules={[{ required: true }]}><Input placeholder="" /></Form.Item>
          <Form.Item name="url" label={text("地址", "Endpoint URL")} rules={[{ required: true }, { type: "url" }]}><Input placeholder="https://example.com/mcp" /></Form.Item>
          <div className="form-grid-2">
            <Form.Item name="transport" label={text("传输方式", "Transport")}><Select options={[{ value: "auto", label: "Auto" }, { value: "streamable_http", label: "Streamable HTTP" }, { value: "sse", label: "SSE" }]} /></Form.Item>
            <Form.Item name="timeoutMs" label={text("超时（毫秒）", "Timeout (ms)")}><InputNumber min={1000} step={1000} style={{ width: "100%" }} /></Form.Item>
          </div>
          <Form.Item name="description" label={text("描述", "Description")}><Input.TextArea rows={2} /></Form.Item>
          <section className="header-editor" aria-label={text("请求头配置", "Request header configuration")}>
            <div className="header-editor-heading">
              <div>
                <strong><KeyOutlined /> {text("请求头", "Request headers")}</strong>
                <span>{editing
                  ? text("已保存的敏感值不会回显；留空表示保持原值。", "Saved secret values are never revealed; leave blank to keep them unchanged.")
                  : text("敏感值只会提交到后端，连接 API 不会将其返回。", "Secret values are sent only to the server and are never returned by connection APIs.")}</span>
              </div>
            </div>
            <Form.List name="headers">
              {(fields, { add, remove }) => (
                <>
                  <div className="header-editor-columns" aria-hidden="true">
                    <span>{text("名称", "Name")}</span>
                    <span>{text("值", "Value")}</span>
                    <span />
                  </div>
                  <div className="header-editor-rows">
                    {fields.map(({ key, name, ...restField }) => {
                      const configured = Boolean(watchedHeaders[name]?.originalName);
                      return (
                        <div className="header-editor-row" key={key}>
                          <Form.Item {...restField} name={[name, "name"]}>
                            <Input className="mono" disabled={configured} placeholder="X-API-Key" />
                          </Form.Item>
                          <Form.Item {...restField} name={[name, "value"]}>
                            <Input.Password
                              className="mono"
                              autoComplete="new-password"
                              placeholder={configured
                                ? text("已安全保存 · 输入新值可替换", "Stored securely · enter a new value to replace")
                                : "Bearer <token>"}
                            />
                          </Form.Item>
                          <Space size={4}>
                            {configured && <Tag color="blue">{text("已配置", "Stored")}</Tag>}
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label={text("删除请求头", "Remove header")}
                              onClick={() => remove(name)}
                            />
                          </Space>
                          <Form.Item {...restField} name={[name, "originalName"]} hidden><Input /></Form.Item>
                        </div>
                      );
                    })}
                  </div>
                  <div className="header-editor-actions">
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ name: "", value: "" })}>
                      {text("添加请求头", "Add header")}
                    </Button>
                    {!watchedHeaders.some((row) => row?.name?.trim().toLocaleLowerCase() === "authorization") && (
                      <Button icon={<KeyOutlined />} onClick={() => add(bearerHeader())}>
                        {text("添加 Bearer Token", "Add Bearer token")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Form.List>
          </section>
        </Form>
      </Modal>
    </div>
  );
}
