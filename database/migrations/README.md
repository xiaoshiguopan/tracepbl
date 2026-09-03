# Database migrations

按文件名顺序执行。已归档 migration 不得原地修改；修正必须新增 migration。

- `0001_initial_schema.sql`：PostgreSQL 18、pgvector、四个 schema、领域/RAG/运维表、约束、索引和最小角色权限。
- `0002_seed_defaults.sql`：幂等写入一个无身份信息的本地 workspace 与固定 embedding profile；不含史料、用户或秘密。

`agent` schema 只建立隔离边界。LangGraph checkpointer 的表必须由阶段 10 固定版本官方 migration 创建；当前不手写其内部结构。
