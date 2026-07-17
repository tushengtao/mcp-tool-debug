# Docker 部署

镜像构建使用 `node:22-alpine`。API 运行在 Node.js 容器中，Web 静态文件由 Nginx 提供，并将 `/api/` 请求转发给 API 容器。

## 启动

```sh
cd deployment
chmod +x deploy.sh
./deploy.sh up
```

首次运行会从 `.env.example` 自动生成 `.env`。启动后访问：

- Web：<http://localhost:5173>
- API 健康检查：<http://localhost:8787/api/health>

如果部署到其他域名或端口，请修改 `.env` 中的 `CORS_ORIGIN`、`WEB_PORT` 和 `API_PORT`。

## 管理命令

```sh
./deploy.sh status
./deploy.sh logs
./deploy.sh restart
./deploy.sh down
```

`down` 不会删除 SQLite 数据。数据保存在名为 `mcp-tool-debug-data` 的 Docker volume 中。

