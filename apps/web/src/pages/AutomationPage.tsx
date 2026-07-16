import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { InvocationRun, McpConnection, SuiteRun, TestCase } from "@mcp-debug/shared";
import { api } from "../api/client";
import dayjs from "dayjs";

export function AutomationPage() {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [connectionId, setConnectionId] = useState<string>();
  const [cases, setCases] = useState<TestCase[]>([]);
  const [suiteRuns, setSuiteRuns] = useState<SuiteRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const loadConnections = async () => {
    const list = await api.listConnections();
    setConnections(list);
    if (!connectionId && list[0]) setConnectionId(list[0].id);
  };

  const loadCases = async (id?: string) => {
    if (!id) return setCases([]);
    setCases(await api.listAllCases(id));
  };

  const loadSuites = async (id?: string) => {
    setSuiteRuns(await api.listSuiteRuns(id));
  };

  useEffect(() => {
    loadConnections().catch((e) => message.error(String(e)));
  }, []);

  useEffect(() => {
    loadCases(connectionId).catch(() => undefined);
    loadSuites(connectionId).catch(() => undefined);
  }, [connectionId]);

  return (
    <div>
      <Typography.Title level={3}>自动化测试</Typography.Title>
      <Typography.Paragraph type="secondary">
        按连接批量执行测试用例，记录通过率与每次调用的耗时明细。
      </Typography.Paragraph>

      <Card className="page-card" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          initialValues={{ parallel: 1 }}
          onFinish={async (values) => {
            if (!connectionId) return;
            setLoading(true);
            try {
              const tags = values.tags
                ? String(values.tags)
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean)
                : undefined;
              const suite = await api.runSuite(connectionId, {
                caseIds: values.caseIds,
                tags,
                parallel: values.parallel,
                name: values.name || `suite-${dayjs().format("YYYYMMDD-HHmmss")}`,
              });
              message.success(
                `完成：${suite?.passed}/${suite?.total} 通过，失败 ${suite?.failed}，耗时 ${suite?.durationMs}ms`,
              );
              loadSuites(connectionId);
            } catch (e) {
              message.error(e instanceof Error ? e.message : String(e));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item label="连接">
            <Select
              style={{ width: 220 }}
              value={connectionId}
              onChange={setConnectionId}
              options={connections.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="name" label="套件名">
            <Input placeholder="可选" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="caseIds" label="用例">
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 220 }}
              placeholder="默认全部启用用例"
              options={cases.map((c) => ({
                value: c.id,
                label: `${c.toolName} / ${c.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="tags" label="Tags">
            <Input placeholder="tag1,tag2" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="parallel" label="并发">
            <InputNumber min={1} max={8} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              开始执行
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className="page-card" title="最近套件运行">
        <Table
          rowKey="id"
          dataSource={suiteRuns}
          columns={[
            { title: "名称", dataIndex: "name" },
            {
              title: "状态",
              dataIndex: "status",
              render: (s) => (
                <Tag color={s === "passed" ? "success" : s === "failed" ? "error" : "processing"}>
                  {s}
                </Tag>
              ),
            },
            {
              title: "通过/总数",
              render: (_, r) => `${r.passed}/${r.total}`,
            },
            { title: "失败", dataIndex: "failed" },
            { title: "耗时(ms)", dataIndex: "durationMs" },
            {
              title: "开始时间",
              dataIndex: "startedAt",
              render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
            },
            {
              title: "操作",
              render: (_, r) => (
                <Button
                  size="small"
                  onClick={async () => {
                    const detail = await api.getSuiteRun(r.id);
                    showSuiteDetail(detail);
                  }}
                >
                  明细
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function showSuiteDetail(detail: { suite: SuiteRun; runs: InvocationRun[] }) {
  Modal.info({
    title: `套件 ${detail.suite.name}`,
    width: 900,
    content: (
      <div>
        <Space style={{ marginBottom: 12 }}>
          <Tag>{detail.suite.status}</Tag>
          <span>
            通过 {detail.suite.passed}/{detail.suite.total}，失败 {detail.suite.failed}
          </span>
        </Space>
        <Table
          size="small"
          rowKey="id"
          dataSource={detail.runs}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: "Tool", dataIndex: "toolName" },
            { title: "状态", dataIndex: "status" },
            { title: "耗时", dataIndex: "durationMs" },
            {
              title: "断言",
              render: (_: unknown, row: InvocationRun) =>
                row.assertResult ? (row.assertResult.passed ? "pass" : "fail") : "-",
            },
          ]}
        />
      </div>
    ),
  });
}
