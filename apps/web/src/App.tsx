import {
  BulbOutlined,
  ClusterOutlined,
  ExperimentOutlined,
  GlobalOutlined,
  MoonOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Input, Modal, Tooltip } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AutomationPage } from "./pages/AutomationPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkbenchPage } from "./pages/WorkbenchPage";
import { useUi, type ThemeMode } from "./ui";
import appLogo from "./assets/app-logo.png";

const themeIcons = { light: <SunOutlined />, dark: <MoonOutlined />, system: <BulbOutlined /> };

export default function App() {
  const { locale, setLocale, themeMode, setThemeMode, text } = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const commands = useMemo(() => [
    { key: "connections", label: text("连接", "Connections"), description: text("管理 MCP 服务与 Tools", "Manage MCP servers and tools"), path: "/connections", icon: <ClusterOutlined /> },
    { key: "automation", label: text("自动化", "Automation"), description: text("批量运行测试用例", "Run regression test suites"), path: "/automation", icon: <ExperimentOutlined /> },
    { key: "settings", label: text("设置", "Settings"), description: text("外观、语言与运行状态", "Appearance, language and runtime status"), path: "/settings", icon: <SettingOutlined /> },
  ], [text]);
  const filteredCommands = commands.filter((command) => `${command.label} ${command.description}`.toLowerCase().includes(commandQuery.toLowerCase()));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <div className="app-shell">
    <aside className="app-rail" aria-label={text("主导航", "Primary navigation")}>
      <NavLink className="rail-brand" to="/connections" aria-label="MCP Tool Debugger"><img src={appLogo} alt="" /></NavLink>
      <nav className="rail-nav">{commands.map((item) => <Tooltip key={item.key} title={item.label} placement="right"><NavLink aria-label={item.label} className={({ isActive }) => `rail-link ${isActive ? "active" : ""}`} to={item.path}>{item.icon}<span className="rail-label">{item.label}</span></NavLink></Tooltip>)}</nav>
    </aside>
    <div className="app-frame">
      <header className="app-command-bar">
        <div className="command-brand"><span>MCP Tool</span><strong>{text("调试台", "Debugger")}</strong></div>
        <div className="command-actions">
          <button className="command-search" type="button" onClick={() => setCommandOpen(true)} aria-label={text("搜索或输入命令", "Search or enter a command")}><SearchOutlined /><span>{text("搜索或输入命令…", "Search or enter a command…")}</span><kbd>Ctrl K</kbd></button>
          <Tooltip title={text("切换语言", "Switch language")}><Button className="locale-toggle" icon={<GlobalOutlined />} onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}>{locale === "zh-CN" ? "中" : "EN"}</Button></Tooltip>
          <Dropdown trigger={["click"]} menu={{ selectedKeys: [themeMode], onClick: ({ key }) => setThemeMode(key as ThemeMode), items: [
            { key: "light", icon: <SunOutlined />, label: text("亮色", "Light") },
            { key: "dark", icon: <MoonOutlined />, label: text("暗色", "Dark") },
            { key: "system", icon: <BulbOutlined />, label: text("跟随系统", "System") },
          ] }}><Button aria-label={text("切换主题", "Switch theme")} icon={themeIcons[themeMode]} /></Dropdown>
        </div>
      </header>
      <main className={`app-content ${location.pathname.includes("/tools") || location.pathname === "/automation" ? "is-workbench" : ""}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/connections" replace />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/connections/:id/tools" element={<WorkbenchPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/connections" replace />} />
        </Routes>
      </main>
      <footer className="app-status-bar"><span><i className="status-dot" /> MCP {text("已就绪", "ready")}</span><span className="status-tech">JSON Schema 2020-12 · Streamable HTTP / SSE</span></footer>
    </div>
    <Modal className="command-modal" title={text("搜索或输入命令", "Search or enter a command")} open={commandOpen} onCancel={() => setCommandOpen(false)} footer={null} width={560} afterClose={() => setCommandQuery("")}>
      <Input autoFocus prefix={<SearchOutlined />} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder={text("输入页面名称…", "Type a page name…")} />
      <div className="command-list">{filteredCommands.map((command) => <button key={command.key} type="button" className="command-item" onClick={() => { navigate(command.path); setCommandOpen(false); }}>{command.icon}<span><strong>{command.label}</strong><small>{command.description}</small></span></button>)}</div>
    </Modal>
  </div>;
}
