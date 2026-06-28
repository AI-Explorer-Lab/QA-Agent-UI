# Trusted Agent UI

Vue 3 前端工作台，用于对接 `QA-Agent` 后端。

## 开发

```bash
npm install
npm run dev
```

默认开发端口：`http://127.0.0.1:5177`

开发代理会把 `/qa`、`/documents`、`/health` 转发到 `http://127.0.0.1:8000`。

如需连接其他后端地址：

```bash
set VITE_API_BASE_URL=http://127.0.0.1:8888
npm run dev
```
