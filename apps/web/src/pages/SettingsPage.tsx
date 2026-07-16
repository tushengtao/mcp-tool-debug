import { useEffect, useState } from "react";
import { Card, Descriptions, Typography, message } from "antd";
import { api } from "../api/client";

export function SettingsPage() {
  const [health, setHealth] = useState<{ ok: boolean; dialect: string } | null>(null);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch((e) => message.error(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <Typography.Title level={3}>设置 / 状态</Typography.Title>
      <Card className="page-card">
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="API">/api/health</Descriptions.Item>
          <Descriptions.Item label="数据库方言">
            {health?.dialect ?? "加载中..."}
          </Descriptions.Item>
          <Descriptions.Item label="默认超时">连接级 timeoutMs，默认 60000</Descriptions.Item>
          <Descriptions.Item label="传输">
            streamable_http / sse / auto（不含 stdio）
          </Descriptions.Item>
          <Descriptions.Item label="JSON Schema">
            默认 2020-12，RJSF + Ajv2020 校验
          </Descriptions.Item>
          <Descriptions.Item label="环境变量">
            PORT, DATABASE_URL, DB_DIALECT, CORS_ORIGIN, DEFAULT_TIMEOUT_MS
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
