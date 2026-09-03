# TracePBL database

本目录实现已批准的 PostgreSQL 18.6 + pgvector 0.8.6 数据层，不连接 GitHub Pages Demo，也不包含 API、Worker、GLM 调用或真实数据。

## Commands

```powershell
$env:TRACEPBL_DATABASE_URL = "postgres://..."
npm run db:migrate
npm run db:seed
npm run db:test
npm run test:integration
```

集成测试默认用 Testcontainers 启动 `pgvector/pgvector:0.8.6-pg18-bookworm`。已有临时数据库时可设置 `TRACEPBL_TEST_DATABASE_URL`；测试会写入并删除合成数据，因此不得指向共享或生产数据库。

Migration 创建的是不登录的权限组 `tracepbl_owner/migrator/app/worker/backup`，不把密码写进 SQL。实际本地安装应由操作者创建独立 LOGIN 身份并授予相应权限组；日常 API/Worker 不使用 owner 或 bootstrap 连接。

备份与恢复脚本要求 PostgreSQL 18 客户端工具在 PATH。备份强制写到仓库外且拒绝覆盖；恢复强制使用空数据库。恢复后必须运行当前 migration，并在开放应用前清理已到期任务。

`agent` schema 当前只保留隔离边界。LangGraph checkpointer 的表由阶段 10 固定版本官方 migration 管理，不能在这里猜写。
