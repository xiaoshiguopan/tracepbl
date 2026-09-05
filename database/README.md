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

Migration 创建的是不登录的权限组 `tracepbl_owner/migrator/app/worker/backup`，不把密码写进 SQL。`npm run provision:runtime --workspace @tracepbl/database` 使用 migrator 连接和环境变量中的独立密码创建或更新本地 API/Worker LOGIN；日常进程不使用 owner 或 bootstrap 连接。

备份与恢复脚本要求 PostgreSQL 18 客户端工具在 PATH。备份强制写到仓库外且拒绝覆盖；恢复强制使用空数据库。恢复必须提供独立最新删除清单及可信指纹；脚本运行当前 migration、核对清单并先清理 checkpoint/到期任务后才允许开放。已有数据库升级与旧备份限制见 `../docs/07-quality-security/RECOVERY-RUNBOOK.md`。

`0003_backend_runtime_support.sql` 在不改写 `0001`/`0002` 的前提下补充 job lease/fencing、SSE events、usage ledger、运行组件版本、受控函数与最小权限。`agent` schema 内的 LangGraph checkpointer 表由固定版本 `PostgresSaver.setup()` 初始化，内部结构不手写进项目 migration；初始化结果登记到 `ops.runtime_components`，供 API readiness 核验。

阶段 11 增加 CP-11-01 的 0004 迁移和显式合成种子 `scripts/seed-integration.ts`。合成种子仅在 `TRACEPBL_SYNTHETIC_FIXTURES=true` 时写入六条标明“非真实史料”的记录，不运行真实模型，不自动导入到 Demo。操作说明见 `../docs/06-development/STAGE-11-LOCAL-RUN.md`。

阶段 12 的 `0005_recovery_and_cost_safety.sql` 新增两个恢复保护关系、冻结价格和执行权、生成/embedding 合并金额门禁；旧迁移不变。恢复清单放在数据库外的独立卷，不能随任务 purge 清除；旧备份缺少新基线时不自动放行。
