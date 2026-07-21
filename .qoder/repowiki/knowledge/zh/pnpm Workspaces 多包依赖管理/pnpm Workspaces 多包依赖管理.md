---
kind: dependency_management
name: pnpm Workspaces 多包依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - package-lock.json
    - apps/server/package.json
    - apps/web/package.json
    - packages/shared/package.json
---

## 系统概览
本项目采用 **pnpm workspaces** 作为多包工作区的依赖管理方案，通过根 `package.json` 声明 `workspaces: ["packages/*", "apps/*"]`，将 `apps/server`、`apps/web` 与 `packages/shared` 聚合到单一依赖图中。同时仓库保留了 npm 的 `package-lock.json`（lockfileVersion 3），用于锁定所有包的精确版本与完整性校验。

## 关键文件与包
- 根配置：`package.json`（workspaces 声明、顶层脚本、`engines.node >= 20`）、`pnpm-workspace.yaml`（显式列出 `apps/*` 与 `packages/*`）
- 锁文件：`package-lock.json`（npm lockfile v3，记录完整依赖树与 integrity）
- 子包清单：`apps/server/package.json`、`apps/web/package.json`、`packages/shared/package.json`
- 本地包引用：server 与 web 均通过 `@mcp-debug/shared` 的 `file:../../packages/shared` 协议直接指向共享包源码目录

## 架构与约定
1. **包划分**
   - `@mcp-debug/shared`：纯 TypeScript 类型与工具库，无运行时依赖，仅提供 `dist/index.js` 与 `dist/index.d.ts`，并通过 `exports` 字段暴露 ESM 入口。
   - `@mcp-debug/server`：基于 Hono + Node Server 的后端，依赖 `drizzle-orm`、`better-sqlite3`/`pg`、`ajv`、`zod` 等。
   - `@mcp-debug/web`：基于 Vite + React 的前端，依赖 Ant Design、RJSF、CodeMirror 等。

2. **版本策略**
   - 所有第三方依赖在各自 `package.json` 中声明为**固定版本号**（如 `hono: 4.7.7`、`react: 18.3.1`），未使用 `^` 或 `~` 范围，确保可重复构建。
   - 跨包共享的公共依赖（如 `ajv: 8.17.1`、`typescript: 5.7.3`）在各子包中保持版本一致，由 pnpm 自动提升去重。

3. **本地包解析**
   - 通过 `file:` 协议而非发布到私有 registry 引用 `@mcp-debug/shared`，避免额外注册表开销；pnpm 会将其视为 symlink 安装，实现零拷贝共享。

4. **Node 引擎约束**
   - 根 `engines.node >= 20` 强制要求运行环境，配合 `.tool-versions` 统一开发机版本。

5. **构建编排**
   - 根 `scripts` 提供 `build:shared` → `build:server` 的级联依赖，确保 shared 先编译再构建 server；`dev` 通过 `concurrently` 并行启动 server 与 web。

## 开发者应遵循的规则
- 新增包时，在对应 `apps/*` 或 `packages/*` 下的 `package.json` 中以**固定版本号**声明依赖，不要使用语义化范围。
- 若需跨包复用代码，优先放入 `packages/shared` 并通过 `@mcp-debug/shared` 的 `file:` 引用，而不是复制粘贴。
- 修改任何 `package.json` 后提交前执行 `pnpm install`，保证 `package-lock.json` 同步更新。
- 新增全局开发工具（如 lint、格式化）时，放在根 `devDependencies` 并通过 workspace 脚本统一调用，避免在每个子包重复声明。
- 如需引入私有 npm 包，应在 CI 或本地通过 `.npmrc` 配置 registry/token，不要在 `package.json` 中硬编码 URL。