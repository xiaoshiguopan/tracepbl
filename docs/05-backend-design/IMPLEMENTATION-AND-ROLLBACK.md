# 阶段 10 实施顺序、数据库增量与回滚边界

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：阶段 9 已批准归档；阶段 10 实施仍未授权

## 1. 实施原则

阶段 10 只能实现本设计，不得临场改变产品行为、模型、权限、公开范围、费用、数据生命周期或部署方式。采用纵向可验证切片，但先建立稳定内层和失败合同，再连接外部 provider。

## 2. 建议顺序

1. 建立 `packages/domain` 与 `packages/contracts`：值对象、状态机、Problem、OperationStatus 和 Zod；先用单元/契约测试锁定。
2. 在 `packages/database` 增加 repository、Unit of Work 和新的向前 migration；先完成角色/事务/队列集成测试。
3. 建立 `apps/api`：配置、会话、Host/Origin/Content-Type 中间件、task 读取/保存、404/ETag/幂等。
4. 建立 `apps/worker`：claim/lease/fencing、取消、重试、事件和 purge；用故障注入验证。
5. 建立 `packages/retrieval`：材料门禁、chunk v1、fake embedding、exact cosine、引用验证。
6. 建立 `packages/ai`：fake provider、提示模板、结构校验、预算 ledger，再接 LangGraph/PostgresSaver。
7. 实现审计和导出 manifest；保持 P04/P10 合并、P11 取消。
8. 建立 Compose、健康检查、无 Key 和 CI；完成全量后端验证。
9. 真实前端 API adapter 接入属于后续集成阶段；阶段 10 只用契约/测试客户端证明兼容，除非用户另行授权调整前端。

## 3. 阶段 10 新 migration 的精确职责

新增版本建议命名 `0003_backend_runtime_support.sql`，不得修改已归档 `0001_initial_schema.sql` 或 `0002_seed_defaults.sql`。它只补后端运行所需能力：

- `ops.jobs`：`lease_token`、`lease_expires_at`、`cancel_requested_at`、`wait_state`、`progress_current/total`、租约/恢复索引、终态不可复活约束；
- `ops.job_events`：task-scoped SSE 回放事件及索引；
- `ops.usage_ledger`：模型/embedding 的 reservation、settlement、release、CNY/Token/自然日约束；
- `rag.model_runs`：输出 generated revision 的复合外键、实际返回模型、price profile version、currency 等去内容化追溯/计费证据；现有 `task_revision_id` 保留为输入 milestone 引用；
- app enqueue/cancel 和 worker claim/finish/purge 所需的最小 GRANT/受控函数；
- 数据库约束证明事件、ledger、job 的 workspace/task 关系；
- Agent schema 初始化版本记录。

实现时若发现已有列可安全承载相同不变量，可减少新增列，但不得取消租约 fencing、取消竞态、SSE 回放或并发预算保证；这属于 bounded-flex，必须由测试证明。

## 4. Checkpointer 初始化

`PostgresSaver.setup()` 只能由受控 migrate/init 命令在 `agent` schema 执行；常驻 Worker 无 CREATE/ALTER 权限。初始化完成后记录 package/checkpoint migration version并验证表 owner。不得把官方表复制到自建 ORM，也不得手工假设未来结构。

## 5. 兼容窗口

- 新 migration 先向前应用，再启动新 Worker/API；旧 Web/Demo 不受影响。
- API `/api/v1` 在阶段 10 内保持兼容；增加可选字段可以，改变状态/错误/必填字段需回到阶段 9。
- 新程序启动前检查 migration head；旧程序回退时忽略新增表列，不删除数据。
- paused graph 带 graph/prompt/schema 版本；不兼容时安全失败并要求重新生成。

## 6. 回滚

首选回滚：停止新 API/Worker，恢复上一版程序，保留 `0003` 的新增表列。禁止自动 destructive down migration。若 migration 在事务内失败则 PostgreSQL 回滚并保持旧 head；若官方 checkpointer init 部分失败，readiness 关闭并由同版本 init 重放。

只有明确的数据损坏且用户批准时才从已验证备份恢复；恢复后必须先执行 overdue purge，再开放服务。任何删除表、丢弃列、重写历史 migration、清空数据库或回滚真实费用都不属于自动回滚。

## 7. 停止条件

- 固定依赖存在未缓解的 Critical/High 风险；
- Hono/Zod/OpenAPI 无法实现 Content-Type 和响应合同；
- queue 无法证明 fencing 或预算并发上限；
- checkpoint 无法按 task 完整删除；
- 引用无法 100% 解析到当前 task 的准确 version/chunk；
- 国内 API 返回的不是目标模型或无可审查价格/数据政策；
- 实现需要公网、账号、真实数据、联网搜索或模型降级。

触发后停止编码并回到阶段 9/更上游由用户决策，不放宽门禁制造通过。
