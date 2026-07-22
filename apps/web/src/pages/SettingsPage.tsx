import { useEffect, useState } from "react";
import { Alert, Button, InputNumber, Radio, Select, Switch, Typography, message } from "antd";
import { BgColorsOutlined, CloudServerOutlined, GithubOutlined, InfoCircleOutlined, SettingOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUi } from "../ui";

export function SettingsPage() {
  const ui = useUi();
  const { text } = ui;
  const [health, setHealth] = useState<{ ok: boolean; dialect: string; liveConnections?: number } | null>(null);
  useEffect(() => { api.health().then(setHealth).catch((error) => message.error(error instanceof Error ? error.message : String(error))); }, []);

  return <div className="page-stack settings-page">
    <PageHeader title={text("设置", "Settings")} description={text("查看运行状态，并配置本地外观、语言与连接默认值。", "Inspect runtime status and configure local appearance, language and connection defaults.")} />
    <div className="settings-grid">
      <section className="surface-panel settings-section">
        <div className="section-heading"><CloudServerOutlined /><div><strong>{text("运行状态", "Runtime status")}</strong><span>{text("来自后端健康检查的只读信息", "Read-only information from the backend health check")}</span></div></div>
        <div className="settings-rows">
          <SettingRow label="API"><StatusBadge status={health?.ok ? "success" : "offline"} label={health?.ok ? text("运行正常", "Healthy") : text("检查中", "Checking")} /></SettingRow>
          <SettingRow label={text("数据库方言", "Database dialect")}><code>{health?.dialect ?? "—"}</code></SettingRow>
          <SettingRow label={text("活动连接", "Live connections")}><strong>{health?.liveConnections ?? "—"}</strong></SettingRow>
          <SettingRow label={text("Schema 方言", "Schema dialect")}><span>JSON Schema 2020-12 · RJSF + Ajv2020</span></SettingRow>
        </div>
      </section>

      <section className="surface-panel settings-section">
        <div className="section-heading"><BgColorsOutlined /><div><strong>{text("外观与语言", "Appearance & language")}</strong><span>{text("仅保存在当前浏览器", "Stored only in this browser")}</span></div></div>
        <div className="settings-rows">
          <SettingRow label={text("主题", "Theme")}><Radio.Group value={ui.themeMode} onChange={(event) => ui.setThemeMode(event.target.value)} optionType="button" buttonStyle="solid" options={[{ value: "light", label: text("亮色", "Light") }, { value: "dark", label: text("暗色", "Dark") }, { value: "system", label: text("跟随系统", "System") }]} /></SettingRow>
          <SettingRow label={text("界面语言", "Language")}><Select value={ui.locale} onChange={ui.setLocale} style={{ width: 180 }} options={[{ value: "zh-CN", label: "简体中文" }, { value: "en-US", label: "English" }]} /></SettingRow>
          <SettingRow label={text("界面密度", "Density")}><Radio.Group value={ui.density} onChange={(event) => ui.setDensity(event.target.value)} optionType="button" options={[{ value: "compact", label: text("紧凑", "Compact") }, { value: "comfortable", label: text("舒适", "Comfortable") }]} /></SettingRow>
          <SettingRow label={text("减少动态效果", "Reduce motion")}><Switch defaultChecked={window.matchMedia("(prefers-reduced-motion: reduce)").matches} disabled /><Typography.Text type="secondary">{text("跟随系统", "System controlled")}</Typography.Text></SettingRow>
        </div>
      </section>

      <section className="surface-panel settings-section">
        <div className="section-heading"><SettingOutlined /><div><strong>{text("连接默认值", "Connection defaults")}</strong><span>{text("用于新建连接，可在连接级覆盖", "Used for new connections and overridable per connection")}</span></div></div>
        <div className="settings-rows">
          <SettingRow label={text("默认超时", "Default timeout")}><InputNumber value={ui.defaultTimeoutMs} onChange={(value) => ui.setDefaultTimeoutMs(value ?? 60000)} min={1000} step={1000} /><span className="muted">ms</span></SettingRow>
          <SettingRow label={text("首选传输", "Preferred transport")}><Select value={ui.transportPreference} onChange={ui.setTransportPreference} style={{ width: 200 }} options={[{ value: "auto", label: "Auto" }, { value: "streamable_http", label: "Streamable HTTP" }, { value: "sse", label: "SSE" }]} /></SettingRow>
        </div>
      </section>

      <section className="surface-panel settings-section">
        <div className="section-heading"><InfoCircleOutlined /><div><strong>{text("关于项目", "About")}</strong><span>MCP Tool Debugger</span></div></div>
        <Alert showIcon type="info" message={text("面向 MCP 开发者的开源调试与自动化测试工作台", "An open-source debugging and automation workbench for MCP developers")} description={text("支持 Streamable HTTP / SSE、JSON Schema 2020-12、可复用用例与会话自动恢复。", "Supports Streamable HTTP / SSE, JSON Schema 2020-12, reusable test cases and automatic session recovery.")} />
        <Button className="about-link" icon={<GithubOutlined />} href="https://github.com/tushengtao/mcp-tool-debug" target="_blank">GitHub</Button>
      </section>
    </div>
  </div>;
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="setting-row"><div className="setting-label">{label}</div><div className="setting-control">{children}</div></div>;
}
