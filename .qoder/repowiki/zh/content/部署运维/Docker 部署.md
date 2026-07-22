# Docker 部署

<cite>
**本文引用的文件**   
- [Dockerfile](file://deployment/Dockerfile)
- [docker-compose.yaml](file://deployment/docker-compose.yaml)
- [nginx.conf](file://deployment/nginx.conf)
- [deploy.sh](file://deployment/deploy.sh)
- [README.md](file://deployment/README.md)
- [Dockerfile.dockerignore](file://deployment/Dockerfile.dockerignore)
- [package.json](file://package.json)
- [apps/server/package.json](file://apps/server/package.json)
- [apps/web/package.json](file://apps/web/package.json)
- [packages/shared/package.json](file://packages/shared/package.json)
- [apps/server/src/index.ts](file://apps/server/src/index.ts)
- [apps/server/src/routes/api.ts](file://apps/server/src/routes/api.ts)
- [apps/server/src/db/client.ts](file://apps/server/src/db/client.ts)
- [apps/server/src/db/schema.sqlite.ts](file://apps/server/src/db/schema.sqlite.ts)
- [apps/server/src/db/schema.pg.ts](file://apps/server/src/db/schema.pg.ts)
</cite>

## 更新摘要
**变更内容**   
- 新增 SQLite 和 PostgreSQL 双数据库配置支持说明
- 增强数据库连接管理和迁移机制文档
- 补充多阶段构建流程的详细缓存策略
- 完善容器化部署的环境变量配置指南
- 添加数据库持久化和数据卷管理说明

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [数据库配置与管理](#数据库配置与管理)
7. [依赖关系分析](#依赖关系分析)
8. [性能与优化](#性能与优化)
9. [故障排查指南](#故障排查指南)
10. [结论](#结论)
11. [附录](#附录)

## 简介
本指南面向希望将 MCP 工具调试应用容器化部署的工程师，覆盖多阶段构建、镜像优化、API 服务与 Nginx Web 容器的配置、环境变量与健康检查、数据持久化、编排与服务间通信，以及安全与性能调优建议。特别强调对 SQLite 和 PostgreSQL 双数据库的支持，提供灵活的数据库配置选项。

## 项目结构
本项目采用 Monorepo 组织方式，包含共享包、后端 API 与前端 Web 应用。部署相关的关键文件位于 deployment 目录：
- 多阶段 Dockerfile：定义构建、API 运行镜像与 Nginx 静态资源镜像
- docker-compose.yaml：编排 API 与 Web 两个服务，挂载数据卷并设置健康检查依赖
- nginx.conf：反向代理 /api 到 API 服务，其余请求走 SPA 路由
- deploy.sh：一键启动、查看日志、重启、停止等运维脚本
- Dockerfile.dockerignore：排除不必要的上下文文件，提升构建缓存命中率

```mermaid
graph TB
subgraph "宿主机"
Dev["开发者终端"]
Compose["docker compose"]
end
subgraph "Compose 网络"
API["API 服务<br/>Node.js 22 Alpine"]
WEB["Nginx Web 服务<br/>Alpine"]
DB_VOL["Volume: mcp-tool-debug-data"]
PG_DB["PostgreSQL 数据库<br/>外部服务"]
end
Dev --> Compose
Compose --> API
Compose --> WEB
API --> DB_VOL
API --> PG_DB
WEB --> API
```

**图表来源**
- [docker-compose.yaml:1-39](file://deployment/docker-compose.yaml#L1-L39)
- [Dockerfile:1-64](file://deployment/Dockerfile#L1-L64)
- [nginx.conf:1-25](file://deployment/nginx.conf#L1-L25)

**章节来源**
- [deployment/README.md:1-32](file://deployment/README.md#L1-L32)
- [deployment/Dockerfile.dockerignore:1-14](file://deployment/Dockerfile.dockerignore#L1-L14)

## 核心组件
- 多阶段构建镜像
  - build：基于 node:22-alpine，安装编译依赖，执行 npm ci 与构建脚本，清理 dev 依赖
  - api：仅包含生产依赖与产物，以非 root 用户运行，暴露 8787 端口，提供健康检查
  - web：基于 nginx:1.27-alpine，注入反向代理配置，提供静态资源与 /api 转发
- 编排与数据持久化
  - 默认使用 SQLite（文件存储），数据通过命名卷持久化
  - 支持 PostgreSQL（外部服务），通过环境变量配置连接字符串
  - Web 无状态，依赖 API 健康状态启动
- 反向代理与跨域
  - Nginx 将 /api 请求转发至 API 服务
  - API 支持 CORS_ORIGIN 环境变量控制允许的来源

**章节来源**
- [Dockerfile:1-64](file://deployment/Dockerfile#L1-L64)
- [docker-compose.yaml:1-39](file://deployment/docker-compose.yaml#L1-L39)
- [nginx.conf:1-25](file://deployment/nginx.conf#L1-L25)
- [apps/server/src/index.ts:1-39](file://apps/server/src/index.ts#L1-L39)

## 架构总览
下图展示了从浏览器到 API 的完整请求路径，包括 Nginx 反向代理、API 健康检查与数据库访问。系统支持 SQLite 和 PostgreSQL 两种数据库模式。

```mermaid
sequenceDiagram
participant Browser as "浏览器"
participant Nginx as "Nginx Web 容器"
participant API as "API 服务容器"
participant DB as "SQLite/PostgreSQL 数据库"
Browser->>Nginx : GET / (SPA 页面)
Nginx-->>Browser : 返回 index.html 及静态资源
Browser->>Nginx : GET /api/health
Nginx->>API : 转发到 http : //api : 8787/api/health
API->>DB : 查询数据库状态
DB-->>API : 返回连接信息
API-->>Nginx : { ok, dialect, liveConnections }
Nginx-->>Browser : 健康检查结果
Browser->>Nginx : POST /api/connections/ : id/tools/ : toolName/invoke
Nginx->>API : 转发请求
API->>DB : 读写业务数据
DB-->>API : 返回数据结果
API-->>Nginx : 业务响应
Nginx-->>Browser : 最终响应
```

**图表来源**
- [nginx.conf:1-25](file://deployment/nginx.conf#L1-L25)
- [apps/server/src/routes/api.ts:32-38](file://apps/server/src/routes/api.ts#L32-L38)
- [apps/server/src/index.ts:1-39](file://apps/server/src/index.ts#L1-L39)
- [docker-compose.yaml:1-39](file://deployment/docker-compose.yaml#L1-L39)

## 详细组件分析

### 多阶段构建流程与缓存策略
- 基础镜像
  - 构建阶段使用 node:22-alpine，最小体积且兼容 musl
  - 运行阶段 API 使用 node:22-alpine，Web 使用 nginx:1.27-alpine
- 依赖安装优化
  - 先复制 package*.json 与 workspace 子包清单，再执行 npm ci，最大化利用层缓存
  - 仅在需要时安装编译依赖（如 better-sqlite3 的 native 模块）
- 构建顺序与缓存
  - 先复制源码再构建，确保变更时只重建受影响层
  - 构建完成后执行 prune --omit=dev，剔除开发依赖，减小镜像体积
- 忽略规则
  - 使用 Dockerfile.dockerignore 排除 .git、node_modules、dist、data 等，避免污染构建上下文

```mermaid
flowchart TD
Start(["开始构建"]) --> CopyPkgs["复制 package*.json 与工作区清单"]
CopyPkgs --> InstallDeps["npm ci 安装依赖"]
InstallDeps --> CopySrc["复制 packages/apps 源码"]
CopySrc --> Build["执行构建脚本<br/>build:server + build:web"]
Build --> Prune["npm prune --omit=dev 清理开发依赖"]
Prune --> End(["完成构建阶段"])
```

**图表来源**
- [Dockerfile:1-64](file://deployment/Dockerfile#L1-L64)
- [Dockerfile.dockerignore:1-14](file://deployment/Dockerfile.dockerignore#L1-L14)
- [package.json:31-40](file://package.json#L31-L40)

**章节来源**
- [Dockerfile:1-64](file://deployment/Dockerfile#L1-L64)
- [Dockerfile.dockerignore:1-14](file://deployment/Dockerfile.dockerignore#L1-L14)
- [package.json:31-40](file://package.json#L31-L40)

### API 服务容器配置
- 运行环境
  - 工作目录 /app，NODE_ENV=production，PORT=8787
  - 默认使用 SQLite，数据库文件路径 file:./data/mcp-debug.db，可通过 DATABASE_URL 覆盖
  - DB_DIALECT=sqlite，便于运行时识别方言
- 进程管理
  - 使用 dumb-init 作为 PID 1，正确处理信号与僵尸进程
  - 以非 root 用户 node 运行，降低安全风险
- 健康检查
  - 每 10s 探测一次，超时 3s，启动宽限期 10s，最多重试 5 次
  - 调用 /api/health 接口，返回 ok/dialect/liveConnections
- 端口映射
  - 内部监听 8787，compose 中可映射到宿主机 API_PORT（默认 8787）
- 数据持久化
  - 将 /app/apps/server/data 挂载到命名卷 mcp-tool-debug-data，保证 SQLite 数据不丢失

```mermaid
classDiagram
class APIService {
+环境变量 NODE_ENV
+环境变量 PORT
+环境变量 DATABASE_URL
+环境变量 DB_DIALECT
+环境变量 CORS_ORIGIN
+健康检查 /api/health
+数据卷 /app/apps/server/data
+用户 node(非root)
+入口 dumb-init
+命令 node apps/server/dist/index.js
}
```

**图表来源**
- [Dockerfile:24-52](file://deployment/Dockerfile#L24-L52)
- [apps/server/src/index.ts:1-39](file://apps/server/src/index.ts#L1-L39)
- [apps/server/src/routes/api.ts:32-38](file://apps/server/src/routes/api.ts#L32-L38)
- [docker-compose.yaml:4-21](file://deployment/docker-compose.yaml#L4-L21)

**章节来源**
- [Dockerfile:24-52](file://deployment/Dockerfile#L24-L52)
- [apps/server/src/index.ts:1-39](file://apps/server/src/index.ts#L1-L39)
- [apps/server/src/routes/api.ts:32-38](file://apps/server/src/routes/api.ts#L32-L38)
- [docker-compose.yaml:4-21](file://deployment/docker-compose.yaml#L4-L21)

### Nginx Web 服务器配置
- 静态文件服务
  - 根目录 /usr/share/nginx/html，index.html 为入口
  - 所有非 /api 请求走 try_files，实现 SPA 路由回退
- 反向代理
  - location /api/ 转发到 http://api:8787，保持 HTTP/1.1
  - 传递 Host、X-Real-IP、X-Forwarded-For、X-Forwarded-Proto 头
  - 关闭缓冲与缓存，设置较长读取超时以支持长连接场景
- 健康检查
  - 每 10s 探测根路径，超时 3s，启动宽限期 5s，最多重试 5 次

```mermaid
flowchart TD
A["收到请求"] --> B{"路径匹配 /api/ ?"}
B --> |是| C["proxy_pass 到 api:8787"]
B --> |否| D["try_files 返回静态资源或 index.html"]
C --> E["附加代理头并转发"]
D --> F["返回前端资源"]
```

**图表来源**
- [nginx.conf:1-25](file://deployment/nginx.conf#L1-L25)
- [Dockerfile:54-64](file://deployment/Dockerfile#L54-L64)

**章节来源**
- [nginx.conf:1-25](file://deployment/nginx.conf#L1-L25)
- [Dockerfile:54-64](file://deployment/Dockerfile#L54-L64)

### docker-compose.yaml 编排详解
- 服务定义
  - api：指定构建上下文与目标 stage，镜像名 mcp-tool-debug-api:local，自动重启策略 unless-stopped
  - web：指定构建上下文与目标 stage，镜像名 mcp-tool-debug-web:local，depends_on 等待 api 健康
- 环境变量
  - NODE_ENV、PORT、DATABASE_URL、DB_DIALECT、CORS_ORIGIN 均支持 .env 覆盖
- 端口映射
  - API 端口默认 8787，WEB 端口默认 5173，均可通过 .env 变量调整
- 数据卷
  - 命名卷 mcp-tool-debug-data 持久化 SQLite 数据文件
- 网络
  - 默认创建 bridge 网络，服务间通过服务名 api 互相访问

```mermaid
graph LR
Compose["docker compose"] --> API["service: api<br/>image: mcp-tool-debug-api:local"]
Compose --> WEB["service: web<br/>image: mcp-tool-debug-web:local"]
API --> Vol["volume: mcp-tool-debug-data"]
WEB -.->|"depends_on(api healthy)"| API
```

**图表来源**
- [docker-compose.yaml:1-39](file://deployment/docker-compose.yaml#L1-L39)

**章节来源**
- [docker-compose.yaml:1-39](file://deployment/docker-compose.yaml#L1-L39)

### 构建脚本与运维
- deploy.sh 提供 up/down/restart/logs/status 等常用操作
- 首次运行会自动复制 .env.example 生成 .env（若存在）
- 统一通过 --env-file 加载环境变量，简化本地与 CI 集成

**章节来源**
- [deploy.sh:1-51](file://deployment/deploy.sh#L1-L51)
- [deployment/README.md:1-32](file://deployment/README.md#L1-L32)

## 数据库配置与管理

### 数据库方言检测与切换
系统支持 SQLite 和 PostgreSQL 两种数据库方言，通过环境变量或连接字符串自动检测：

- **方言检测逻辑**
  - 优先检查 DB_DIALECT 环境变量（postgres 或 sqlite）
  - 根据 DATABASE_URL 前缀自动推断（postgres:// 或 postgresql:// 为 PostgreSQL）
  - 默认为 SQLite 模式
- **连接管理**
  - SQLite：使用 better-sqlite3 驱动，支持 WAL 模式和外键约束
  - PostgreSQL：使用 pg 驱动，支持连接池管理
- **数据库迁移**
  - 启动时自动执行 migrate() 函数
  - 根据方言选择对应的表结构定义
  - 支持增量迁移和幂等操作

```mermaid
flowchart TD
Start(["应用启动"]) --> CheckEnv["检查 DB_DIALECT 环境变量"]
CheckEnv --> HasEnv{"DB_DIALECT 已设置?"}
HasEnv --> |是| UseEnv["使用环境变量指定的方言"]
HasEnv --> |否| CheckURL["检查 DATABASE_URL 前缀"]
CheckURL --> IsPg{"URL 以 postgres:// 开头?"}
IsPg --> |是| UsePg["使用 PostgreSQL 方言"]
IsPg --> |否| UseSqlite["使用 SQLite 方言"]
UseEnv --> Migrate["执行数据库迁移"]
UsePg --> Migrate
UseSqlite --> Migrate
Migrate --> Ready["数据库就绪"]
```

**图表来源**
- [apps/server/src/db/client.ts:17-25](file://apps/server/src/db/client.ts#L17-L25)
- [apps/server/src/db/client.ts:35-37](file://apps/server/src/db/client.ts#L35-L37)

### SQLite 配置与优化
- **默认配置**
  - 数据库文件路径：file:./data/mcp-debug.db
  - 数据持久化：通过 Docker volume 挂载到 /app/apps/server/data
  - 自动创建目录和文件权限设置
- **性能优化**
  - 启用 WAL 模式提升并发写入性能
  - 启用外键约束保证数据完整性
  - 预创建 data 目录并设置 node 用户权限
- **表结构设计**
  - 5 个核心表：mcp_connections、mcp_tools、test_cases、suite_runs、invocation_runs
  - 合理的索引设计优化查询性能
  - JSON 字段存储复杂数据结构

### PostgreSQL 配置与扩展
- **连接配置**
  - 支持标准 PostgreSQL 连接字符串格式
  - 自动创建连接池管理数据库连接
  - 支持 SSL 连接和认证配置
- **类型映射**
  - boolean 类型原生支持
  - JSON 字段使用 TEXT 类型存储
  - 时间戳字段使用 TEXT 类型保证兼容性
- **迁移策略**
  - 启动时执行完整的 DDL 语句
  - 使用 CREATE TABLE IF NOT EXISTS 保证幂等性
  - 支持增量升级和数据迁移

**章节来源**
- [apps/server/src/db/client.ts:1-267](file://apps/server/src/db/client.ts#L1-267)
- [apps/server/src/db/schema.sqlite.ts:1-120](file://apps/server/src/db/schema.sqlite.ts#L1-120)
- [apps/server/src/db/schema.pg.ts:1-127](file://apps/server/src/db/schema.pg.ts#L1-127)

## 依赖关系分析
- 工作区与脚本
  - 顶层 package.json 定义了 build:shared/build:server/build:web 等脚本，供多阶段构建调用
  - server 与 web 分别依赖 @mcp-debug/shared，构建产物在 dist 目录
- 运行时依赖
  - API 使用 Hono、better-sqlite3、drizzle-orm、pg、zod 等
  - Web 使用 React、Ant Design、Vite 等构建产物由 Vite 输出到 dist

```mermaid
graph TB
Root["根 package.json"] --> Shared["@mcp-debug/shared"]
Root --> Server["@mcp-debug/server"]
Root --> Web["@mcp-debug/web"]
Server --> Shared
Web --> Shared
```

**图表来源**
- [package.json:27-40](file://package.json#L27-L40)
- [apps/server/package.json:1-32](file://apps/server/package.json#L1-32)
- [apps/web/package.json:1-38](file://apps/web/package.json#L1-38)
- [packages/shared/package.json:1-22](file://packages/shared/package.json#L1-22)

**章节来源**
- [package.json:27-40](file://package.json#L27-L40)
- [apps/server/package.json:1-32](file://apps/server/package.json#L1-32)
- [apps/web/package.json:1-38](file://apps/web/package.json#L1-38)
- [packages/shared/package.json:1-22](file://packages/shared/package.json#L1-22)

## 性能与优化
- 构建缓存
  - 优先复制 package*.json 与工作区清单，再执行 npm ci，提高缓存命中
  - 使用 Dockerfile.dockerignore 排除无关文件，减少上下文大小
- 镜像体积
  - 构建后执行 prune --omit=dev，移除开发依赖
  - 使用 Alpine 基础镜像，减小系统库体积
- 运行时优化
  - API 使用 dumb-init 处理信号，避免僵尸进程
  - Nginx 关闭缓冲与缓存，适合长连接与实时场景
- 资源限制（建议在编排层补充）
  - 为 API 与 Web 服务设置 CPU/内存限制，防止资源争用
- 数据库优化
  - SQLite：启用 WAL 模式，合理设置 PRAGMA 参数
  - PostgreSQL：配置连接池大小，优化查询计划
  - 根据负载评估是否迁移到 PostgreSQL（需同步更新 DATABASE_URL 与 DB_DIALECT）

## 故障排查指南
- 无法访问 Web 页面
  - 确认 WEB_PORT 映射正确，浏览器访问 http://localhost:5173
  - 检查 Nginx 健康检查是否通过
- API 不可用
  - 检查 API_PORT 映射与环境变量 CORS_ORIGIN
  - 访问 http://localhost:8787/api/health 验证服务状态
- 数据库连接失败
  - SQLite：检查数据卷挂载和文件权限
  - PostgreSQL：验证连接字符串格式和网络可达性
  - 查看应用日志中的数据库初始化错误
- 数据丢失
  - 确认命名卷 mcp-tool-debug-data 已挂载，down 不会删除数据
- 权限问题
  - API 以 node 用户运行，确保 data 目录可写；Dockerfile 已预创建并 chown
- 构建失败
  - 检查 Dockerfile.dockerignore 是否误排除了必要文件
  - 确认 Node.js 版本满足 engines 要求

**章节来源**
- [Dockerfile:24-52](file://deployment/Dockerfile#L24-L52)
- [docker-compose.yaml:1-39](file://deployment/docker-compose.yaml#L1-L39)
- [apps/server/src/routes/api.ts:32-38](file://apps/server/src/routes/api.ts#L32-L38)
- [apps/server/src/db/client.ts:1-267](file://apps/server/src/db/client.ts#L1-267)

## 结论
通过多阶段构建与 Alpine 基础镜像，项目在体积与安全上取得良好平衡；API 与 Nginx 职责清晰，配合健康检查与数据卷实现稳定运行。新增的 SQLite 和 PostgreSQL 双数据库支持提供了灵活的部署选项，满足不同场景需求。结合环境变量与编排配置，可在本地与生产环境快速部署。建议在生产环境中进一步引入资源限制、日志收集与监控告警，以提升可观测性与稳定性。

## 附录
- 快速启动
  - 进入 deployment 目录，赋予脚本执行权限，执行 ./deploy.sh up
  - 访问 Web 与 API 健康检查地址
- 常用命令
  - status/logs/restart/down 等通过 deploy.sh 统一管理
- 数据库配置示例
  - SQLite：DATABASE_URL=file:./data/mcp-debug.db, DB_DIALECT=sqlite
  - PostgreSQL：DATABASE_URL=postgresql://user:pass@host:5432/dbname, DB_DIALECT=postgres
- 环境变量参考
  - NODE_ENV：运行环境（development/production）
  - PORT：API 服务端口
  - DATABASE_URL：数据库连接字符串
  - DB_DIALECT：数据库方言（sqlite/postgres）
  - CORS_ORIGIN：允许的跨域来源

**章节来源**
- [deployment/README.md:1-32](file://deployment/README.md#L1-L32)
- [deploy.sh:1-51](file://deployment/deploy.sh#L1-L51)
- [apps/server/src/db/client.ts:1-267](file://apps/server/src/db/client.ts#L1-267)