# 数据库测试计划

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：阶段 7 已批准归档
> 实施阶段：阶段 8；当前没有数据库测试已运行

## 1. 测试原则与环境

数据库测试针对真实 PostgreSQL 18 + pgvector，不用 SQLite 或纯 Mock 代替约束、事务、锁和向量行为。Stage 8 使用 Testcontainers 或项目批准的等价临时容器；每个 suite 从可重复 migration 建库，只写 G0 合成数据和许可明确的 G1/G2 最小公开材料。

默认 CI 不读取 GLM Key、不联网调用付费模型。embedding 使用固定 1024 维合成向量或已登记预生成 fixture；真实模型冒烟测试属于以后单独授权。

## 2. 迁移与结构

| ID | 测试 | 通过条件 |
|---|---|---|
| DB-MIG-001 | 空库 0→head | 全部 migration 成功，extension/schema/role/表/约束存在 |
| DB-MIG-002 | 重建第二个空库 | schema 指纹一致，无环境漂移 |
| DB-MIG-003 | seed 重放 | 第二次不重复 workspace/source/version |
| DB-MIG-004 | 中途失败 | 事务 DDL 回滚；独立 concurrent index 有明确清理 |
| DB-MIG-005 | 逐版升级 | 每个历史 migration 顺序成功，不修改旧文件 |
| DB-MIG-006 | 权限 | app/worker 不能 DDL；owner 不用于运行连接 |
| DB-MIG-007 | LangGraph 隔离 | checkpointer 只写 `agent`，无 core 真相或越权 grant |

## 3. 约束与关系

- 拒绝空/超长核心字段、负分钟、非法状态、错误 UUID/FK、重复 ordinal/version/idempotency key。
- 拒绝 stage/grade 不一致、sub question 无 parent/超过 ordinal 3、private source 缺 workspace/task、catalog source 错带私人归属。
- 拒绝同 source 重复 version_no/content_hash、非法 rights/verification 组合、metadata-only/禁用版本保存全文或生成 chunk、非 1024 维或非有限向量；task_private 的复用确认不得解除 task scope。
- 拒绝跨 task parent question、claim/source relation、activity source、rubric activity、finding/decision、revision/export 关联。
- 拒绝未进入 `task_sources` 的 source version 被 evidence/activity 使用。
- 拒绝把 task A 的 task_private source 选择到 task B；允许同 workspace task 选择 catalog source，以验证数据库 scope guard。
- 验证移除正在被 relation/activity 使用的 task source 受 RESTRICT，而不是悄悄级联丢证据。
- 验证 app/worker 无权 hard delete 公共 source/version；retire 后旧 task 仍可读取，owner 物理维护删除不属于产品操作。

聚合门禁另以领域+数据库集成测试验证：草稿可不满三个子问题/七活动/五量规；最终签发在缺项、总时长不等于 45 或活动—量规不对齐时整事务失败且不产生 revision/approval/export。

## 4. 隔离与权限负向测试

构造 workspace A/B，即使当前产品只创建 A，也直接调用 repository/SQL 负向用例：A 的上下文不能读写 B task；用 B task ID 替换路径不返回标题/存在性；A claim 不能引用 B source；Worker 不能插入 teacher decision；app 不能更新 revision/source version/audit event；task ID 单独出现不能绕过 workspace 条件。

以 `tracepbl_app`、`tracepbl_worker` 等真实非 owner role 执行，不以 superuser 测试后宣称权限通过。当前 RLS 不适用项应明确断言“未启用”，防止未经批准的策略漂移。

## 5. 并发、幂等与事务

| ID | 场景 | 预期 |
|---|---|---|
| DB-CON-001 | 两事务同 expected lock_version 保存 | 恰好一个成功，另一个冲突；无部分子项 |
| DB-CON-002 | 相同幂等键同请求并发 | 仅一个领域副作用，另一请求复用结果 |
| DB-CON-003 | 相同键不同 request hash | 明确冲突，不复用错误响应 |
| DB-CON-004 | Worker 并发认领 | job 只被一个 worker 锁定，其他 worker 跳过 |
| DB-CON-005 | Worker 崩溃/租约过期 | 未完成 job 可有限重试，不复制成功 run |
| DB-CON-006 | GLM 返回时 task 已改变 | model run=`stale`，教师内容不被覆盖 |
| DB-CON-007 | revision + approval + export 写入失败 | 整体回滚，无假 approved/成功导出 |
| DB-CON-008 | 删除与保存竞争 | 删除取得权威版本后旧保存冲突；deleted task 不复活 |

检查死锁时固定写入顺序；只对可安全重放事务进行有限重试，不盲目重试教师批准、导出和外部费用动作。

## 6. RAG 与追溯

- profile 精确记录 `zhipu/embedding-3/1024/cosine/chunker_version`。
- 同 chunk/profile 不产生重复 embedding；新 profile 与旧 profile 可共存。
- 精确 cosine 查询在固定小向量集返回人工可计算的顺序和距离。
- 检索前的 workspace/task/source selection/rights/verification 过滤有效，禁止私人材料跨 task 命中。
- retrieval hit 的 model run、task source、source version 与 chunk 必须形成同一 workspace/task/version 复合 FK；跨 task、未选择版本或错配 chunk 均被数据库拒绝；rank 唯一且模型上下文选择可复原。
- source version 内容变化生成新 version/chunks/vectors，旧 revision/hit 仍指向旧版。
- citation quote/hash/locator 错配时不进入 verified/approved 路径。
- 当前 schema 不存在 HNSW/IVFFlat；达到性能触发点前出现 ANN migration 视为设计漂移。

## 7. 生命周期、删除与恢复

1. 删除立即使普通 task/list/query 不可见，并设置准确 `purge_after=deleted_at+24h`。
2. 24 小时内撤销恢复 task 及其全部关系，递增版本并留当前 task 内事件。
3. 重复删除/撤销返回一致结果，不泄露其他 workspace 是否存在。
4. 到期 purge 删除 task current rows、revision、private source/version、chunks/embeddings、model/retrieval、jobs、export、checkpoint 和内容性 audit。
5. 公共 source 与其他 task 不受影响；无孤儿 FK。
6. purge 中任何一步失败则该 task 事务回滚并有限重试。
7. 从删除前 backup 恢复后先重跑 purge；到期 task 不重新开放。
8. Pages IndexedDB 清除继续由前端测试负责，不以数据库测试冒充。

## 8. 备份与恢复

- 使用含多个 task、source version、citation、revision 和 vector 的合成库生成 `pg_dump -Fc`。
- 恢复到全新 PostgreSQL 18 + pgvector；运行当前 migration 与 ANALYZE。
- 核对关键表行数、content hash、revision hash、FK 无孤儿、vector 维度、role grant 和 app/worker 冒烟查询。
- 损坏/错误版本 dump 必须安全失败；部分恢复库不能开放。
- 备份路径在仓库外，秘密扫描证明 dump/manifest 未进入 Git。

## 9. 前端契约映射

| 前端行为 | 数据库证据 |
|---|---|
| 本机任务列表/复制/删除撤销 | task active partial index、独立新 task ID、删除事务与 24h purge |
| P01/P02 编辑和往返 | 当前关系行 + lock_version，不用 revision 代替草稿 |
| P03 选择、换批、自有 URL/文本 | source/version/task_source 去重和作用域；不伪造 URL 抓取 |
| P05 同一史料服务多问题 | relation 多对多唯一约束，非数组 ID |
| P06 七活动/45 分钟 | ordinal/分钟行内约束 + 签发聚合事务 |
| P07 五维量规 | item/level/activity 关系；最终门禁 |
| P08 自动/人工核验 | run/finding/teacher decision 分离；unknown 不当 pass |
| P09 Word/PDF | export 引用不可变 revision，不保存文件 |
| P12 安全不可用 | deleted/not-found/other workspace 不泄露内容 |

## 10. 完成证据

阶段 8 报告必须列出实际命令、PostgreSQL/pgvector 版本、测试数量、失败/跳过、migration head、查询计划、dump/restore 证据和未测项。没有当前命令输出不得声称通过；不得删除或弱化负向测试制造成功。
