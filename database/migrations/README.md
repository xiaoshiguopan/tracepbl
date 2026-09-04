# Database migrations

按文件名顺序执行。已归档 migration 不得原地修改；修正必须新增 migration。

- `0001_initial_schema.sql`：PostgreSQL 18、pgvector、四个 schema、领域/RAG/运维表、约束、索引和最小角色权限。
- `0002_seed_defaults.sql`：幂等写入一个无身份信息的本地 workspace 与固定 embedding profile；不含史料、用户或秘密。
- `0003_backend_runtime_support.sql`：向前补充 job lease/fencing、取消与进度、task-scoped SSE events、usage ledger、模型/价格证据、运行组件版本、受控事务函数和 API/Worker 最小权限；不修改前两个已归档 migration。

`agent` schema 中的 LangGraph checkpointer 表由阶段 10 固定版本 `PostgresSaver.setup()` 初始化，并通过 `ops.runtime_components` 记录版本；其内部结构不复制进项目 SQL migration。
