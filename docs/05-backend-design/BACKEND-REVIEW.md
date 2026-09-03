# 后端设计评审

> 文档版本：0.1
> 审查日期：2026-09-03
> 状态：完备性门与编码就绪门通过；用户已于 2026-09-03 批准归档
> 审查规范：`../02-planning/DESIGN-REVIEW-STANDARD.md`

## 1. 依据、版本、范围和非范围

依据为现役 PRD/技术决策、阶段 4 总规划、阶段 5/6 前端契约和实现、阶段 7/8 数据库设计与代码、当前 Git 提交及用户在阶段 9 对十项推荐方案的确认。

固定版本：Hono 4.13.5、`@hono/node-server` 2.1.1、Zod 4.5.4、`@hono/zod-openapi` 1.6.1、PostgreSQL 18.6、pgvector 0.8.6、Drizzle 0.45.2、postgres.js 3.4.9、LangGraph.js 1.4.13、checkpointer 1.0.5、`GLM-5.3-Flash`、`embedding-3` 1024/cosine。

范围是 localhost 完整后端的模块、REST/OpenAPI、授权、事务、Worker、SSE、RAG、Agent、费用、删除、本地运行和测试设计。非范围是代码、SQL/OpenAPI 文件、依赖、真实模型、联网搜索、文件/OCR、账号/团队/分享、生产部署和真实数据。

## 2. 第一性原理重建

### 调用者最终结果

教师能在本机持续保存 P01—P09 工作，主动请求可追溯 AI 建议，先审阅再采用，遇到并发/失败可安全恢复，最终只在来源、审计和教师批准门禁通过后得到本地导出清单；删除立即隐藏、24 小时可撤销，之后内容和 checkpoint 清除。

### 不可改变的真相

- PostgreSQL 是完整模式真相；task ID、Cookie 和前端隐藏按钮都不单独授权。
- workspace 由服务端注入；私有来源不跨 task；source version/revision 历史不可变。
- 未知/失败不升级为 verified；模型提供的引用、状态和批准都不可信。
- 当前状态采用乐观锁；外部调用不在长事务；旧结果不得覆盖新编辑。
- AI 输出是建议；教师采用/批准和费用、删除、门禁均由确定性代码执行。
- P04/P10 合并，P11 取消；Pages 不连后端。

### 主要失败

空/错输入应返回字段错误；慢/断外部服务保留已有状态；重复请求由回执复用；并发写返回 412；多材料允许 partial；跨 workspace 与不存在同 404；取消后结果不应用；Worker 崩溃由 lease 恢复；SSE 断线回放或 reset；备份恢复先重做 overdue purge。

## 3. 完备性门

| 检查 | 证据 | 结论 |
|---|---|---|
| 计划产物、范围和非范围 | 本目录 13 份现役文档 | 通过 |
| 当前官方资料/成熟案例 | `CASE-STUDY-RESEARCH.md`，含日期、commit、Star、许可快照和不照搬点 | 通过 |
| API/权限/事务/异步/AI/运行/测试 | 对应专题文档及追踪表 | 通过 |
| 前端与数据库一致 | API read model 对齐 P01—P09；新增数据库能力只通过未来 0003 | 通过 |
| 无占位符/敏感数据/范围外实现 | 静态扫描和 Git diff 复核 | 通过 |

## 4. 编码就绪门

| 检查 | 证据 | 结论 |
|---|---|---|
| 高返工决定冻结 | 下方决定表；用户已确认十项方案 | 通过 |
| 状态/错误/字段/边界无冲突 | API、jobs/SSE、AI 和生命周期交叉走查 | 通过 |
| 复合失败已演练 | 并发+取消、删除+job、断线+事件缺口、恢复+到期清理、无 Key+手工流程 | 通过 |
| 可直接建立代码/测试/migration | `IMPLEMENTATION-AND-ROLLBACK.md`、`BACKEND-TEST-PLAN.md` | 通过 |
| P0/P1 | 已发现项均修订并复验；当前为零 | 通过 |

## 5. 决定冻结表

| 决定 | 分类 | 边界 |
|---|---|---|
| 模块化单体、API/Worker 两进程、PostgreSQL 真相 | hard-freeze | 不拆微服务、不加队列/缓存真相源 |
| `/api/v1`、Zod/OpenAPI、Problem、If-Match、幂等键 | hard-freeze | 公共行为改变需回到设计 |
| localhost 会话、workspace 服务端注入、不可区分 404 | hard-freeze | 公网/账号需回 PRD |
| AI 建议后采用、固定模型、无降级、预算 fail closed | hard-freeze | 不能为可用性放宽 |
| task-scoped RAG 与精确引用门禁 | hard-freeze | 不可信模型字段不得成为真相 |
| PostgreSQL lease/fencing、SSE 回放、24h purge | hard-freeze | 不能用内存队列或 UI 状态替代 |
| 0003 的具体列名、内部 class/file 划分 | bounded-flex | 必须保持已冻结不变量和公共合同 |
| lease 时长、轮询间隔、熔断阈值的小范围调优 | bounded-flex | 默认安全、合同/故障测试证明，不改用户语义 |
| HTML 抽取器内部实现 | bounded-flex | 不新增范围、必须通过 SSRF/主动内容测试；新增依赖仍单独准入 |
| 真实 GLM 可用性与官方价格验证 | bounded-flex 的外部验证 | 阶段 10 可先完成 fake；真实调用保持关闭，不能降级 |
| deferred-blocker | 无 | 当前没有阻止后端编码的未决定高返工项 |

## 6. P0/P1/P2、修订和复验

| 级别 | 初始发现 | 修订 | 复验证据 |
|---|---|---|---|
| P0 | 现有 job 缺完整 lease/cancel fencing，可能由旧 Worker 覆盖新结果 | 冻结 0003 lease token/expiry/cancel 和条件完成 | 崩溃、过期、取消竞态测试已进入测试计划 |
| P0 | SSE 若复用 audit 或只靠内存，断线可能丢失/跨 task | 独立 task-scoped `job_events` + Last-Event-ID + reset | API/SSE 和 DB 负向合同已定义 |
| P0 | 并发调用只求和历史用量会突破预算 | 新 usage ledger 先预留后结算 | 并发 reservation 测试已定义 |
| P0 | AI 建议若直接写当前表会冒充教师采用 | generated revision 与 adoption 事务分离 | 架构、API、Agent 三处一致 |
| P1 | app 当前没有完整 enqueue/cancel 最小权限 | 0003 精确补 GRANT/受控函数，Worker/teacher 权限分离 | 角色集成测试已定义 |
| P1 | checkpoint 与 task 非同一 FK 事务，可能残留 | purge 先 deleteThread、后删 task，失败可重跑 | 生命周期和恢复演练已定义 |
| P1 | Hono 省略 Content-Type 可能绕过 body validator | 独立 Content-Type 中间件和负向合同 | 官方 issue + 测试计划 |
| P1 | PostgresStore namespace 风险可能跨边界 | 禁用 Store；随机服务端 thread ID；Saver 不作授权 | AI 文档与安全测试一致 |
| P1 | 新模型价格/权限未知却设置费用估算 | 无 price profile 即禁用真实调用；目标不变 | runtime/provider 失败合同和后置 smoke |
| P2 | 最终环境变量名、lease/轮询微调、内部文件划分 | 留阶段 10 在边界内决定 | 不改变公共行为，测试可局部验证 |

修订后重新检查了 API 状态、数据库增量、Worker 竞态、Agent 恢复、删除和测试追踪，未留下 P0/P1。

## 7. 需求—设计—失败—证据追踪

| 要求 | 设计 | 失败/边界 | 未来证据 |
|---|---|---|---|
| 任务隔离 | 服务端 workspace + scoped repository + 复合 FK | 猜 ID/跨 task/已删除 | 404 等价负向集成 |
| 不覆盖教师编辑 | ETag/If-Match + input lock + stale | 双窗口/慢模型 | 并发 E2E |
| AI 可控 | 主动触发、建议 revision、adoption | 无 Key/取消/格式错 | fake provider + E2E |
| 引用可追溯 | version/chunk/hit/quote 确定性门禁 | 假 URL/相似题名/错 chunk | RAG 负向测试 |
| Worker 可恢复 | SKIP LOCKED + lease/fencing | 崩溃/重复/超时 | DB 故障注入 |
| SSE 可恢复 | job_events + Last-Event-ID/reset | 断线/清理/越权 | 契约与浏览器 E2E |
| 费用硬限 | reservation/settlement + call/token/CNY cap | 并发/usage 缺失 | ledger 集成测试 |
| 安全删除 | 立即隐藏、24h、checkpoint-first purge | 恢复旧备份/中途崩溃 | restore drill |
| 本地边界 | 127.0.0.1、Host/Origin/Cookie | CSRF/DNS rebinding | 安全负向测试 |

## 8. 与前端/数据库的差异及处置

- 前端 `OperationStatus.partial` 是 API 聚合；数据库 stale 映射为公开 `failed + RESULT_STALE`；LangGraph 等待保持现役主状态 `running`，用可选 phase 和 SSE paused 事件表达。阶段 8 job CHECK 无需加入 partial/paused，公开主状态枚举不扩展。
- 前端本地 Demo 保持不变；真实 API adapter 留集成阶段，阶段 10 不提前重写 UI。
- 数据库现有 28 表不回写；租约、事件、费用证据和返回模型通过新 0003 前滚。
- generated task revision 复用现有 `reason='generated'`，避免第二套建议真相；采用时仍写当前领域表。
- export run 最终提供不可变 manifest，由浏览器产生本地 DOCX/PDF；后端不保存文件，符合 P09/P10 契约。

## 9. 未验证项、负责人和触发条件

| 未验证 | 当前处置 | 负责人/最晚点 | 触发动作 |
|---|---|---|---|
| 国内 key 是否可调用 GLM-5.3-Flash | fake 先行，真实关闭 | 用户授权 + 阶段 10 联调 | 合成 smoke；失败不降级 |
| 真实按量价格/数据保存政策 | 无 price profile fail closed | 用户与实现者，首次真实调用前 | 复核官方/账号页面并批准 |
| 目标浏览器 Secure localhost Cookie 差异 | loopback 例外合同 | 阶段 10 E2E | 浏览器矩阵；不通过则保留安全同源替代 |
| 规模/性能目标 | 当前为测试预算，不声称通过 | 阶段 10 | EXPLAIN、P95 和连接释放测量 |

## 10. 结论

是否申请进入后端编码：**是，但只能在本设计获用户“批准归档”并完成本地归档后，由用户另行明确开始阶段 10。** 理由：完备性门和编码就绪门通过，当前 P0/P1 为零，剩余项都有 fail-closed 边界或局部可逆验证方式。
