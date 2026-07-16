import { Layout, Menu } from "antd";
import {
  ClusterOutlined,
  ExperimentOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { WorkbenchPage } from "./pages/WorkbenchPage";
import { AutomationPage } from "./pages/AutomationPage";
import { SettingsPage } from "./pages/SettingsPage";

const { Header, Content } = Layout;

export default function App() {
  const location = useLocation();
  const selected = location.pathname.startsWith("/automation")
    ? "automation"
    : location.pathname.startsWith("/settings")
      ? "settings"
      : "connections";

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <div className="brand">
          <div className="brand-badge">MCP</div>
          <span>MCP Tool 调试台</span>
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[selected]}
          style={{ flex: 1, minWidth: 0, justifyContent: "flex-end", border: "none" }}
          items={[
            {
              key: "connections",
              icon: <ClusterOutlined />,
              label: <Link to="/connections">连接</Link>,
            },
            {
              key: "automation",
              icon: <ExperimentOutlined />,
              label: <Link to="/automation">自动化</Link>,
            },
            {
              key: "settings",
              icon: <SettingOutlined />,
              label: <Link to="/settings">设置</Link>,
            },
          ]}
        />
      </Header>
      <Content className="app-content">
        <Routes>
          <Route path="/" element={<Navigate to="/connections" replace />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/connections/:id/tools" element={<WorkbenchPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/connections" replace />} />
        </Routes>
      </Content>
    </Layout>
  );
}
