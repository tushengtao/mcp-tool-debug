import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
  Popconfirm,
} from "antd";
import {
  ApiOutlined,
  CloudSyncOutlined,
  DeleteOutlined,
  LinkOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { McpConnection, TransportType } from "@mcp-debug/shared";
import { api } from "../api/client";

export function ConnectionsPage() {
  const [list, setList] = useState<McpConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.listConnections());
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    const values = await form.validateFields();
    let headers: Record<string, string> = {};
    if (values.headersText?.trim()) {
      try {
        headers = JSON.parse(values.headersText);
      } catch {
        message.error("Headers 必须是 JSON 对象");
        return;
      }
    }
    try {
      await api.createConnection({
        name: values.name,
        description: values.description,
        url: values.url,
        transport: values.transport as TransportType,
        timeoutMs: values.timeoutMs,
        headers,
      });
      message.success("已创建连接");
      setOpen(false);
      form.resetFields();
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            MCP 连接
          </Typography.Title>
          <Typography.Text type="secondary">
            管理 Streamable HTTP / SSE 连接，同步 Tools 并进入调试工作台
          </Typography.Text>
        </div>
        <Space>
          <Button
            onClick={() => {
              Modal.confirm({
                title: "导出文件包含连接凭据",
                content:
                  "导出文件会包含 Authorization、Cookie、API Key 等完整 Header，请仅保存到可信位置。",
                okText: "确认导出",
                cancelText: "取消",
                onOk: async () => {
                  try {
                    const data = await api.exportAll();
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `mcp-debug-export-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : String(e));
                    throw e;
                  }
                },
              });
            }}
          >
            导出
          </Button>
          <Button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "application/json";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const res = await api.importAll(JSON.parse(text));
                  message.success(`导入 ${res.connections} 连接 / ${res.cases} 用例`);
                  load();
                } catch (e) {
                  message.error(e instanceof Error ? e.message : String(e));
                }
              };
              input.click();
            }}
          >
            导入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            新建连接
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        {list.map((c) => (
          <Col xs={24} md={12} xl={8} key={c.id}>
            <Card
              loading={loading}
              className="page-card"
              title={
                <Space>
                  <span>{c.name}</span>
                  {c.live ? <Tag color="success">在线</Tag> : <Tag>离线</Tag>}
                  <Tag>{c.transport}</Tag>
                </Space>
              }
            >
              <div className="muted" style={{ marginBottom: 8 }}>
                {c.description || "无描述"}
              </div>
              <Typography.Paragraph copyable ellipsis style={{ marginBottom: 8 }}>
                {c.url}
              </Typography.Paragraph>
              {c.lastError ? (
                <Typography.Text type="danger">错误：{c.lastError}</Typography.Text>
              ) : (
                <Typography.Text type="secondary">
                  最近连接：{c.lastConnectedAt || "尚未连接"}
                </Typography.Text>
              )}
              <div className="conn-card-actions" style={{ marginTop: 16 }}>
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={async () => {
                    try {
                      await api.connect(c.id);
                      message.success("已连接");
                      load();
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : String(e));
                      load();
                    }
                  }}
                >
                  连接
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    await api.disconnect(c.id);
                    message.success("已断开");
                    load();
                  }}
                >
                  断开
                </Button>
                <Button
                  size="small"
                  icon={<CloudSyncOutlined />}
                  onClick={async () => {
                    try {
                      const res = await api.syncTools(c.id);
                      message.success(`已同步 ${res.count} 个 Tools`);
                      load();
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  同步 Tools
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<ApiOutlined />}
                  onClick={() => navigate(`/connections/${c.id}/tools`)}
                >
                  工作台
                </Button>
                <Popconfirm
                  title="确认删除该连接？"
                  onConfirm={async () => {
                    await api.deleteConnection(c.id);
                    message.success("已删除");
                    load();
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        title="新建 MCP 连接"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onCreate}
        okText="创建"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ transport: "auto", timeoutMs: 60000 }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="例如 WeCom MCP" />
          </Form.Item>
          <Form.Item name="url" label="URL" rules={[{ required: true }]}>
            <Input placeholder="https://example.com/mcp" />
          </Form.Item>
          <Form.Item name="transport" label="传输">
            <Select
              options={[
                { value: "auto", label: "auto（HTTP 失败回退 SSE）" },
                { value: "streamable_http", label: "streamable_http" },
                { value: "sse", label: "sse" },
              ]}
            />
          </Form.Item>
          <Form.Item name="timeoutMs" label="超时 (ms)">
            <InputNumber style={{ width: "100%" }} min={1000} step={1000} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="headersText"
            label="Headers JSON"
            extra='例如 {"Authorization":"Bearer xxx"}'
          >
            <Input.TextArea rows={4} placeholder="{}" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
