# 阶段 7 数据库设计评审

> 评审日期：2026-09-03
> 评审范围：数据库设计文档及其与现役产品、前端、治理契约的一致性
> 评审标准：`../02-planning/DESIGN-REVIEW-STANDARD.md`
> 结论：设计达到完备性与编码就绪要求，并于 2026-09-03 获用户批准归档；阶段 8 仍须另行授权

## 1. 依据、范围与非范围

依据包括 PRD、技术决策、项目手册、阶段 4 总体规划、阶段 5 前端设计、阶段 6 实现/验证、当前 TypeScript 状态模型与 fixture，以及本目录中的官方资料和成熟 GitHub 案例研究。

本次只回答 PostgreSQL 18 + pgvector 的领域、关系、约束、索引、事务、并发、隔离、审计、删除、备份、迁移和测试。没有编写 SQL、Drizzle schema、迁移、seed、后端接口、RAG/Agent 业务代码；没有连接数据库、调用模型、读取密钥或安装依赖。

## 2. 第一性原理重建

数据库必须首先保证三个消费者结果：教师的当前工作不会被静默覆盖；导出与审计能够回到当时的确切来源版本；公开 Demo 与完整本地工程不会混成一个虚假在线服务。

由此得到不可妥协的不变量：

1. task ID 只定位，不授权；当前完整模式以本机单一 workspace 隔离，所有请求仍由服务层检查归属。
2. 公共来源目录与任务私有材料分离；私有材料不能跨 task 复用。
3. 来源版本、里程碑 revision、citation 和审计事件追加写；不能靠覆盖当前行伪造历史。
4. 引用必须同时指向 task 已选择的 source version 与该版本的确切 chunk/locator。
5. 生成、核验、教师签发和导出不是同一个状态；未知或失败不得变为已通过。
6. 当前可编辑状态用 `lock_version` 乐观锁；跨聚合签发、删除、job 认领等操作有明确事务边界。
7. 删除后立即不可见，24 小时内只允许撤销删除；到期后按依赖顺序彻底清除，不恢复 P11 页面。
8. 向量是可重建派生数据，不是真相源；小规模先用精确 cosine 检索。

主要失败包括跨任务引用、私有来源串用、旧写覆盖新写、重复 job/费用、引用错配、删除残留、迁移半完成、备份不可恢复、模型/提示版本不可追溯。设计与测试计划均有对应控制。

## 3. 完备性门

| 检查项 | 证据 | 结论 |
|---|---|---|
| 领域与一致性边界 | `DOMAIN-MODEL.md` | 通过 |
| 实体、关系、基数 | `ERD.md`、`DATABASE-SCHEMA.md` | 通过 |
| 字段、类型、可空性、状态、敏感性 | `DATABASE-SCHEMA.md` | 通过 |
| PK/UK/FK/CHECK/删除行为 | `DATABASE-SCHEMA.md` | 通过 |
| 权限、拒绝场景、RLS 取舍 | `ACCESS-CONTROL.md` | 通过 |
| 查询、规模与索引 | `QUERY-AND-PERFORMANCE.md` | 通过 |
| 事务、并发、幂等、恢复 | schema、查询与迁移文档 | 通过 |
| 生命周期、备份、恢复 | `MIGRATION-STRATEGY.md` | 通过 |
| 迁移、前滚与回滚 | `MIGRATION-STRATEGY.md` | 通过 |
| 正常/负面/并发/恢复测试 | `DATABASE-TEST-PLAN.md` | 通过（设计完成，待阶段 8 实现） |
| 官方资料与成熟案例 | `CASE-STUDY-RESEARCH.md` | 通过 |

## 4. 编码就绪门

- PostgreSQL schema 分为 `core`、`rag`、`ops`、`agent`，各自职责和删除边界明确。
- UUIDv7、identity、text + CHECK、jsonb 的使用边界明确；不把 JSON 当关系模型替代品。
- 复合外键把 workspace/task/source-version 作用域带到关键关系上；跨表私有来源作用域由唯一一个窄约束触发器守护。
- `revision_no`、`lock_version`、job 幂等键、lease、追加式事件的并发语义明确。
- `embedding-3` 固定 1024 维、cosine、精确扫描；HNSW/IVFFlat 只有达到实测阈值后才准加入。
- expand/contract、不可逆迁移、备份恢复、失败前滚和环境验证路径明确。
- 每条关键约束都有应通过与应拒绝测试，且禁止只测 ORM happy path。

结论：阶段 8 可以把本文档逐项翻译为迁移和数据库集成测试，不需要临场猜测产品语义。

## 5. 发现、修订与复验

| 级别 | 发现 | 影响 | 处置 |
|---|---|---|---|
| P0 | 现役上游仍写 Qwen，而用户本轮明确改为智谱 GLM | 密钥、模型审计、向量维度会互相冲突 | 同步现役 PRD、技术决策、手册与状态；历史报告不改 |
| P0 | 原“最后活动 24 小时失效”与长期本地作品集工程冲突 | 会导致教师任务被意外删除 | 改为完整本地工程持续保存；仅显式删除后 24 小时宽限 |
| P1 | 三表关系无法只靠普通 FK 防止 task_private source 串入另一 task | 可产生跨任务证据污染 | 增加窄 scope guard 约束触发器及负面测试 |
| P1 | embedding 可选 2048 维，而 pgvector `vector` ANN 索引上限为 2000 维 | 将来无法按原类型建 ANN | 当前固定 `vector(1024)`；模型配置变更必须新 profile/迁移 |
| P1 | 小规模直接上 ANN 会增加调参和过滤误差 | 复杂度高且无收益证据 | 默认精确 cosine；只在 EXPLAIN/召回基准证明需要时引入 HNSW |
| P1 | 保存导出二进制会引入对象生命周期和残留 | 删除与仓库演示更复杂 | 只存 export event/manifest，不持久化 DOCX/PDF 文件 |
| P1 | 初稿未把全部复合 FK 候选键与 retrieval hit 的 task source scope 写全 | 阶段 8 可能无法建约束，或留下跨 task 检索证据 | 补齐 `(workspace,task,id)` 候选键，并让 hit 同时引用 model run、task source、version 与 chunk |
| P2 | 无 RLS 不是未来在线多用户模型 | 若直接上线会形成权限缺口 | 当前仅 localhost 单用户；出现第二用户/远程访问即阻断并重做认证、租户与 RLS |
| P2 | 国内密钥对 `GLM-5.3-Flash` 的实际可调用性尚未实测 | 后端接入可能返回型号不可用 | model ID 配置化；阶段 10 只用非敏感最小 smoke test，失败显式报告，不静默换模型 |

修订后复验结果：P0=0，P1=0；两个 P2 均有清晰触发条件，不阻断数据库编码，也不允许把未来在线安全当成已完成。

## 6. 前端与数据库的差异处置

- IndexedDB 状态不是表设计来源；数据库从 task、来源版本、证据关系、活动、量规、核验、revision 等领域关系重建。
- P00 菜单中的本机任务管理是客户端/本地 workspace 行为，不恢复 P11 独立页面，也不代表服务端权限。
- 前端一个 `TaskState` 在数据库中拆为当前聚合、不可变 revision、关系表和事件表；避免单一大 JSON 行。
- P03 展示对象与公共 catalog、task source selection、source version、chunk 分开；前端卡片不机械等于一张表。
- P09 浏览器即时生成文件；数据库只记录签发 revision 和去内容化导出事件。
- P12 的统一不可用文案仍适用：未授权、已删除、不存在不向客户端泄露差异。

## 7. Freeze 分类

### hard-freeze

- PostgreSQL 18 + pgvector；单一关系真相源。
- 当前 localhost 单用户、一个内部 workspace、无账号/分享/RLS。
- 公共 catalog 与 task_private 隔离；来源和 revision 版本化。
- GLM provider、`embedding-3` 1024 维、cosine；默认无 key 可运行。
- 显式删除立即隐藏、24 小时撤销、之后彻底清除。
- 只处理 G0/G1/G2；禁止真实个人/学生/敏感数据。
- v0.1 来源输入只有 URL/文本；不做 PDF/DOCX/OCR 摄取。

### bounded-flex

- 可在不改变不变量的前提下细化 CHECK 名称、索引名称、分页默认值、job lease 时长和批量清理大小。
- 只有基准证明后才可增加 trigram/HNSW 索引；增加时必须补迁移与回归基准。
- `agent` schema 可在阶段 9 按 LangGraph 官方 checkpointer 版本细化，但不得反向污染 `core` 真相源。

### deferred-blocker

- 多用户、远程访问、分享、账号、真实云部署、真实个人/学生数据、不同保留期限或新的彻底删除语义。
- 任何一项出现都必须先回到 PRD/安全/数据库设计重新批准，不能在阶段 8 顺手实现。

## 8. 最终结论

本设计已于 2026-09-03 获用户“批准归档”：产品决定明确，数据库设计覆盖完整，P0/P1 已关闭，阶段 8 有可执行测试与迁移边界。本次批准只允许阶段 7 文档的一次本地提交，不授权数据库编码、依赖安装、推送或部署；完成归档后仍须用户另行明确开始阶段 8。
