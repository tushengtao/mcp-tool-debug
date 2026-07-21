---
kind: frontend_style
name: Ant Design + Vite 前端样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - apps/web/src/main.tsx
    - apps/web/src/styles.css
    - apps/web/src/App.tsx
    - apps/web/package.json
    - apps/web/vite.config.ts
---

## 系统概览
本仓库的前端位于 `apps/web`，基于 React 18 + Vite 构建，UI 组件库统一采用 **Ant Design 5**（含 `@rjsf/antd` 表单、`@ant-design/icons` 图标），并通过 AntD 的 `ConfigProvider` 在应用根节点集中配置主题与国际化。页面级布局与业务组件样式以全局 CSS 文件 `styles.css` 管理，未引入 Tailwind、CSS Modules 或 styled-components 等方案。

## 关键文件与包
- `apps/web/package.json`：声明 antd 5.29、@rjsf/antd、@uiw/react-codemirror、react-markdown 等依赖
- `apps/web/src/main.tsx`：通过 `<ConfigProvider locale={zh_CN} theme={{ token: { colorPrimary, borderRadius } }}>` 注入全局主题与中文本地化
- `apps/web/src/styles.css`：全部自定义样式（约 560 行），包含 App Shell、三栏可拖拽面板、Markdown 渲染、SchemaForm、结果面板等样式
- `apps/web/vite.config.ts`：仅启用 `@vitejs/plugin-react`，无 Sass/Less 插件，CSS 直接由 Vite 原生处理
- `apps/web/src/App.tsx`：使用 AntD `Layout` + `Menu` 实现顶部导航，路由由 react-router-dom v7 驱动

## 架构与约定
- **主题来源**：Ant Design 5 的 `theme.token` 是唯一的品牌色入口（`colorPrimary: #1677ff`，`borderRadius: 8`），所有 AntD 组件默认继承该主题；其余视觉变量（背景、边框色、文字灰阶）集中在 `:root` 与全局类中硬编码为十六进制值，尚未抽象为设计令牌。
- **样式组织方式**：单一全局 CSS 文件按功能块分段注释（如“Resizable 3-column layout”、“markdown-body”、“schema-form-wrap”），类名采用 BEM 风格前缀（`app-*`、`resizable-*`、`workbench-*`、`timing-bar`、`markdown-body`、`schema-form-wrap`、`result-pane`），避免模块隔离但保持命名域清晰。
- **响应式策略**：仅在 `@media (max-width: 960px)` 断点下将三列水平面板切换为纵向堆叠，并调整 resize-handle 方向，未使用媒体查询函数或容器查询。
- **第三方 UI 定制**：对 AntD 内部类（`.ant-alert`、`.ant-typography`）进行覆盖以适配长文本换行；对 RJSF/AntD 表单通过 `.schema-form-wrap` 包裹层统一控制宽度与错误提示样式。
- **代码编辑器与 Markdown**：JSON 编辑使用 `@uiw/react-codemirror`（自带 CodeMirror 主题），Markdown 渲染使用 `react-markdown` + `remark-gfm`，并在 `.markdown-body` 中定义标题、引用、表格、内联代码、预代码块的统一外观。

## 开发者应遵循的规则
1. **主题扩展优先走 AntD ConfigProvider**：新增品牌色、圆角、阴影等全局视觉变量时，应在 `main.tsx` 的 `theme.token` 中声明，而非在各处散落十六进制值。
2. **新增样式放入 `styles.css` 并按功能分区**：遵循现有注释分隔习惯，为新组件添加独立区块，类名保持 `component-block` 语义化命名，避免内联 style。
3. **覆盖 AntD 组件样式时使用专用包裹类**：参考 `.schema-form-wrap` 模式，用外层容器限定作用域，防止污染全局。
4. **响应式改动统一在 960px 断点附近**：当前只存在一个移动端断点，新增布局适配建议沿用同一断点，避免碎片化媒体查询。
5. **不引入新的 CSS 预处理或原子框架**：项目未配置 Sass/Less/Tailwind，新增样式应保持纯 CSS，确保与 Vite 零配置一致。