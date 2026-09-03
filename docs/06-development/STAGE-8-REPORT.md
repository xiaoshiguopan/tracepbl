# 阶段 8 数据库编码报告

> 日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档；随本次本地提交归档
> 范围：数据库 schema、migration、最小默认 seed、运维脚本和数据库测试；不含后端

## 1. 阶段结果

已把阶段 7 获批方案实现为 PostgreSQL 18.6 + pgvector 0.8.6 数据层：28 张领域/RAG/运维表、四个 schema、UUIDv7、复合作用域 FK、来源与任务 revision、乐观锁、24 小时删除窗口、可重建 vector、最小数据库角色、幂等记录和必要索引均已落地。

实现保留 GitHub Pages Demo 与完整本地工程的隔离。前端没有改为直连数据库；没有实现 API、Worker、RAG 业务、LangGraph 内表或 GLM 调用；没有读取密钥、连接生产库或使用真实用户/学生数据。

## 2. 验证结论

- 空库迁移、seed 重放、第二次迁移重放通过；migration head 为 `0002_seed_defaults.sql`。
- PostgreSQL 18.6 + pgvector 0.8.6 集成测试 10/10 通过；静态数据库合同 4/4 通过。
- 全仓前端 19 项测试、typecheck、lint、build、`git diff --check` 与 npm audit 均通过。
- 116,858-byte custom dump 已恢复到全新容器；版本、owner、migration/task/embedding 计数一致。
- 详细命令、环境、hash 与未测项见 `DATABASE-IMPLEMENTATION-VALIDATION.md`。

## 3. 依赖

- 新增已批准运行时依赖：`drizzle-orm@0.45.2`、`postgres@3.4.9`。
- 新增已批准开发依赖：`testcontainers@12.1.0`；复用 `vitest@4.1.11`。
- 没有引入第二数据库、向量库、ORM、缓存、消息队列或 TypeScript 执行器；迁移 CLI 复用 Node 24 原生 TypeScript strip-types。
- `npm audit` 当前为 0 漏洞；安装时 npm 提示 `protobufjs` 与 `ssh2` 的依赖安装脚本未进入本机 allowScripts，未擅自批准执行。

## 4. 精确归档清单

若用户回复“批准归档”，仅允许本地提交以下路径：

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.base.json`
- `database/.env.example`
- `database/README.md`
- `database/package.json`
- `database/tsconfig.json`
- `database/schema/index.ts`
- `database/migrations/0001_initial_schema.sql`
- `database/migrations/0002_seed_defaults.sql`
- `database/migrations/README.md`
- `database/scripts/database.ts`
- `database/scripts/migrate.ts`
- `database/scripts/seed.ts`
- `database/scripts/backup.ps1`
- `database/scripts/restore.ps1`
- `database/tests/schema-contract.test.ts`
- `database/tests/database.integration.test.ts`
- `docs/06-development/DATABASE-IMPLEMENTATION-VALIDATION.md`
- `docs/06-development/LEARNING-CARD-8.md`
- `docs/06-development/STAGE-8-REPORT.md`
- `docs/00-governance/PROJECT-STATE.md`

`output/` 不在清单中，保持原样未跟踪。

## 5. 门禁与风险

- 用户已于 2026-09-03 明确回复“批准归档”，只允许上述一次本地提交，不授权 push、tag、部署或阶段 9。
- LangGraph checkpointer 的正式表/迁移与 checkpoint purge 集成延后到阶段 10，必须使用固定版本官方 migration 并补完整 DB-MIG-007。
- 后端设计尚未开始。只有阶段 8 获批归档后，用户另行明确开始阶段 9，才可研究和设计 API/Worker/RAG/Agent。
