# Contributing / 参与贡献

[English](#english) · [简体中文](#简体中文)

## English

Thanks for helping improve MCP Tool Debug. Bug reports, documentation fixes, compatibility test cases, and focused pull requests are welcome.

### Development

```bash
git clone https://github.com/tushengtao/mcp-tool-debug.git
cd mcp-tool-debug
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run test:server
npm run build:server
npm run build:web
```

Keep pull requests focused, explain the user-facing problem, and include a regression test when behavior changes. Never commit real MCP credentials, exported connection bundles, or production data.

## 简体中文

感谢你参与改进 MCP Tool Debug。欢迎提交缺陷报告、文档修正、兼容性用例和范围清晰的 Pull Request。

### 本地开发

```bash
git clone https://github.com/tushengtao/mcp-tool-debug.git
cd mcp-tool-debug
npm install
npm run dev
```

提交 Pull Request 前请运行：

```bash
npm run test:server
npm run build:server
npm run build:web
```

请让每个 PR 聚焦于一个问题，说明用户侧痛点；行为发生变化时应补充回归测试。不要提交真实 MCP 凭据、连接导出文件或生产数据。
