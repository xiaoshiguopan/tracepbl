# 查询、写入与性能设计

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：阶段 7 已批准归档

## 1. 规模假设

当前目标是个人本地作品：1 个 workspace、少于 100 个 task、每个 task 约 1 个中心问题/0—3 个子问题、12—50 个候选来源、4—12 个已选来源、最多数十个 claim/活动/量规对象；全部 RAG chunks 少于 10,000。并发主要来自同一用户的多个浏览器页签和 API/Worker 同时完成任务，不是假设数百在线用户。

达到以下任一触发点才重新评估：chunks ≥10,000 且检索 p95 不满足后端阶段目标；task ≥10,000；单表 ≥100 万行；开放局域网/多用户；实际 `EXPLAIN (ANALYZE, BUFFERS)` 证明当前索引不足。不得依据虚构增长提前分库、分表或分区。

## 2. 主要读取路径

| 消费者/场景 | 查询轮廓 | 索引 |
|---|---|---|
| 我的本机任务 | workspace、未删除、按 updated_at 倒序 | `tasks(workspace_id,updated_at DESC) WHERE deleted_at IS NULL` |
| 加载一个任务 | workspace + task id；再按各子表 ordinal | 各表复合 FK/唯一索引；避免 N+1，由 repository 批量加载 |
| P03 公共来源 | 未退役、核验/权利/类型过滤、稳定排序 | 按实际筛选建立小型 B-tree；首版目录很小，可顺序扫描 |
| task 已选来源 | task + selection_order | `task_sources(task_id,selection_order)` |
| P05 证据 | task + claim ordinal，再取 relation/citation | claim/relation/citation FK 和 ordinal 索引 |
| P06 活动 | task + ordinal，批量取 activity_sources | `(task_id,ordinal)`、junction 双向 FK |
| P07 量规 | task + ordinal，批量取 levels/activities | rubric/level/junction 索引 |
| P08 检查结果 | task + run kind + created_at desc | `verification_runs(task_id,run_kind,created_at DESC)` |
| P09 当前签发/导出 | task revision + 最近 export run | revision unique、`export_runs(task_id,started_at DESC)` |
| 到期删除 | purge_after 非空且 <= now | partial `tasks(purge_after)` |
| Worker 认领 | queued/retry + available_at + priority | `jobs(status,available_at,priority DESC)` partial hot queue |
| 幂等请求 | workspace + idempotency key | unique B-tree |

首版所有列表均在本地小规模内。API 分页形式属于阶段 9；数据库设计只要求排序键稳定，候选使用 UUIDv7/id 作为并列破局键，避免翻页重复或遗漏。

## 3. 写入路径与事务

### 3.1 保存当前 task

单一短事务：读取/条件更新 task `WHERE workspace_id=? AND id=? AND lock_version=?`；批量 upsert 当前领域行；删除明确移除的 junction；写 audit event；递增 `lock_version`。影响 0 行即冲突，不继续写子项。更新顺序统一为 task → child → junction → audit，降低死锁。

### 3.2 创建里程碑 revision

在同一事务锁定 task 行，递增 `revision_seq`，汇总当前关系化状态，校验整体门禁，写不可变 snapshot/hash，必要时写 teacher decision/export run。相同内容、原因和幂等键不得产生重复 revision。

### 3.3 外部 GLM/embedding

事务一创建 model run/job 即提交；Worker 在事务外调用智谱；完成后开启新事务写 result/hits/vector 和终态。网络等待期间不持有数据库锁。写回时比较输入版本；不一致则 `stale`，不覆盖教师新内容。

### 3.4 删除/撤销/purge

删除事务只设置 `deleted_at`、`purge_after=deleted_at+24h`、递增版本并写事件。撤销在期限内条件更新清空两字段。purge 以小批次锁定到期 task，先清理 agent checkpoint，再按 FK 级联 hard delete；失败整 task 回滚并有限重试。

## 4. 向量与中文检索

- `embedding-3` 输出 `vector(1024)`，使用 cosine distance。
- 先按允许 source version、task selection、rights/verification 条件确定候选集合，再做距离排序。
- `<10,000` chunks 使用精确检索，保证完整召回；只为过滤列建 B-tree。
- 不建立 HNSW/IVFFlat、分区或第二向量库。达到触发点后用固定查询集比较 recall@k、p50/p95、索引大小和写入成本，再决定 HNSW。
- 中文关键词补充首版可在小集合上做规范化 `ILIKE`/受控应用匹配；只有真实查询证明需要时才评估 `pg_trgm`。PostgreSQL 默认词典不能被假定为可靠中文分词。
- 结果必须保存 chunk ID、rank、distance 与是否进入模型上下文；相关性不等于真实性。

## 5. 索引清单原则

必建：PK/UNIQUE 自动索引、所有 FK 的引用侧索引、workspace/task 常用复合索引、活动任务与到期删除 partial index、job 热队列索引。候选：来源类型/权利/核验联合索引、JSONB GIN、trigram、HNSW；只有 `EXPLAIN` 和真实查询命中后加入。

索引不重复：已有 `(task_id,ordinal)` 不再单独建 `task_id`；低基数状态不单独建全表索引，结合 workspace/time/partial 条件。每次新增索引记录对应查询、测试前后计划、读收益与写成本。

## 6. 性能验证

阶段 8 使用合成规模生成器建立三个数据档：典型（100 tasks/5,000 chunks）、上界（100/10,000）、异常长文本但仍在输入限制内。记录数据库版本、硬件、冷/热缓存、数据量和完整查询计划；不把开发机一次结果宣传为生产 SLA。

最低检查：任务列表和单 task 聚合无全表意外扫描；queue claim 使用 hot index；purge 批次不长时间锁整表；精确向量检索返回正确 k 和作用域；每个 query 的 workspace/task 过滤在 repository 中不可省略；无逐行外部调用或 ORM N+1。

## 7. 不在本阶段决定

具体 HTTP 分页参数、缓存 header、SSE/轮询、API 超时和前端请求合并属于阶段 9。当前不设生产 p95 SLA、不做云规格选择、不部署监控；数据库只提供可测访问路径和扩容触发条件。
