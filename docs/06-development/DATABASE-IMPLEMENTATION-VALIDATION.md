# 阶段 8 数据库实现验证记录

> 日期：2026-09-03
> 状态：实现完成并获用户批准归档
> 数据：仅固定默认配置与合成测试数据

## 1. 运行环境

- Windows Node.js `v24.19.0`、npm `11.17.0`；与批准快照的 Node 最低要求相符，npm 低于目标 `11.19.0`，未为此执行系统级升级。
- WSL2 Docker Engine `29.7.2`；Windows 未安装 Docker Desktop，测试通过 WSL2 内已有 Docker Engine 承载临时容器。
- 镜像：`pgvector/pgvector:0.8.6-pg18-bookworm`，digest `sha256:2ba9ca5f2e7daa0f0e7723cba1ee9167bab54efd3640516a44ac1a928dd67e7a`。
- 数据库实测：PostgreSQL `18.6 (Debian 18.6-1.pgdg12+2)`、pgvector `0.8.6`。

## 2. 迁移与结构

- migration head：`0002_seed_defaults.sql`。
- `npm run db:migrate` 在空库成功，`npm run db:seed` 重放成功，再次 `npm run db:migrate` 无重复对象或漂移。
- 创建 `core/rag/ops/agent` 四个 schema；前三者共 28 张表，`agent` 只保留隔离边界。
- 领域 ID 由 PostgreSQL 18 `uuidv7()` 生成；任务采用 `lock_version`；删除字段强制 `purge_after = deleted_at + 24 hours`。
- 私有 source scope、不可切片权利状态和终态不可复活使用窄约束触发器；未引入业务流程触发器。
- `vector(1024)` 使用精确 cosine；数据库无 HNSW/IVFFlat、无 RLS policy。

## 3. 当前测试证据

- `npm run test:integration`：1 文件、10 项全部通过。覆盖版本、迁移/seed 重放、私有来源跨 task 拒绝、乐观锁、24 小时删除/撤销、精确向量顺序、runtime role 拒绝、metadata-only 切片拒绝、幂等冲突、终态复活拒绝、无 RLS 与 hard purge 级联。
- `npm test`：前端 19 项 + 数据库静态合同 4 项，共 23 项全部通过。
- `npm run typecheck`：web/database 两个 workspace 通过。
- `npm run lint`：web/database 两个 workspace 通过。
- `npm run build`：Vite 56 modules 构建通过；保留既有 pdfmake 大 chunk warning，没有用数据库改动掩盖。
- `npm run format:check`：通过，仅有现有 Windows 行尾提示。
- `npm audit`：直接及开发依赖 0 漏洞。
- PowerShell parser：`backup.ps1`、`restore.ps1` 无语法错误。

## 4. 备份恢复演练

在含 2 个 migration 记录、1 个存量 task 和 2 个 1024 维 embedding 的合成库执行 `pg_dump -Fc`：

- dump 大小：116,858 bytes；
- SHA-256：`4a84310a0d42b92e1e01855a12b1c8558a2f5b5d27c3305eec22e4186f49ece1`；
- dump 位于 WSL `/tmp`，未进入仓库；
- 在全新 PostgreSQL 18.6 + pgvector 0.8.6 容器预建数据库角色后，以 `pg_restore --exit-on-error` 恢复成功；
- 恢复核对：migration=2、task=1、embedding=2，`core.tasks` owner=`tracepbl_owner`。

演练数据库、容器和 dump 仅是临时验证资产，不属于提交清单。

## 5. 未实现与后续门禁

- LangGraph checkpointer 内部表没有手写；按阶段 7 bounded-flex，等阶段 10 固定包版本后由官方 migration 写入 `agent`，届时补 DB-MIG-007 完整 replay/purge 测试。
- 本阶段没有实现签发聚合服务、job lease worker、到期 purge 调度或 HTTP repository；这些属于后端阶段。数据库已提供 FK、状态、权限和索引边界，但不能冒充业务用例已完成。
- 未读取或调用 GLM key；未跑真实 embedding、真实史料、生产规模或公网多用户测试。
- 当前无 Docker Desktop；仓库 Testcontainers 测试可在标准 Docker 环境直接运行，本机本轮使用等价 WSL 临时容器验证。
