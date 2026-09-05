# Database migrations

按文件名顺序执行。已归档 migration 不得原地修改；修正必须新增 migration。

- `0001_initial_schema.sql`：PostgreSQL 18、pgvector、四个 schema、领域/RAG/运维表、约束、索引和最小角色权限。
- `0002_seed_defaults.sql`：幂等写入一个无身份信息的本地 workspace 与固定 embedding profile；不含史料、用户或秘密。
- `0003_backend_runtime_support.sql`：向前补充 job lease/fencing、取消与进度、task-scoped SSE events、usage ledger、模型/价格证据、运行组件版本、受控事务函数和 API/Worker 最小权限；不修改前两个已归档 migration。

`agent` schema 中的 LangGraph checkpointer 表由阶段 10 固定版本 `PostgresSaver.setup()` 初始化，并通过 `ops.runtime_components` 记录版本；其内部结构不复制进项目 SQL migration。

## 阶段 11 已批准向前补齐

`0004_stage11_contract_alignment.sql` 对应 CP-11-01：问题子项 ordinal 上限扩展为 4，签发快照冻结选中来源版本及导出正文依据，backend_schema 版本推进为 0004。0001—0003 保持原内容与校验和。已有 revision 不重写；缺少完整冻结内容的旧教学包明确要求重新复核签发。迁移无 down 脚本，恢复采用受控向前修复；不得降低 CHECK 后丢弃第 4 个问题。空库升级及既有 0003 向前升级已实测，详见阶段 11 验证记录。
