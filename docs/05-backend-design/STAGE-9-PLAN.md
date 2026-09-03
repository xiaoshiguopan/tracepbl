# 阶段 9 后端设计计划

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档；随本次本地提交归档
> 范围：只设计 Hono API、Worker、RAG/Agent、本地运行和验证；不含代码、迁移实现、依赖安装、真实 GLM 调用或部署

## 1. 目标与成功标准

阶段 9 把已完成的前端行为和 PostgreSQL 数据约束转换成无需在编码期重新发明产品规则的后端蓝图。完成标准是：模块、API、授权、事务、异步恢复、RAG/引用、模型费用、LangGraph、SSE、删除、本地运行和测试都有唯一落点；第一性原理评审的 P0/P1 为零；用户批准前不进入阶段 10。

## 2. 固定输入

- P00—P09 与 P12 已完成；P04 并入 P03，P10 并入 P09，P11 取消且不得恢复。
- 前端主归档 `0d8d898`，状态收口 `3c708b8`；数据库设计 `51270a8`，数据库编码 `db19d4f`。
- 数据库为 PostgreSQL 18.6 + pgvector 0.8.6，现有 28 张表、`0001`/`0002` migration 和最小角色权限均为已实现事实。
- 固定栈：Node.js/TypeScript、Hono、REST/OpenAPI 3.1、Zod、SSE、PostgreSQL job table、LangGraph.js、PostgreSQL checkpointer、可替换 GLM adapter。
- 生成目标 `GLM-5.3-Flash`；embedding 为 `embedding-3`、1024 维、cosine；不得静默换型。
- GitHub Pages 永远是 IndexedDB + 公开/合成 fixture + 预生成结果的静态 Demo；完整模式默认只监听 localhost。

## 3. 已确认的产品决定

1. 无登录页；首次启动生成本地秘密并建立安全 Cookie 会话，workspace 只由服务端注入。
2. Demo 与完整本地模式通过显式配置选择，不自动探测 localhost。
3. AI 只由教师主动点击；首次使用和每个动作均披露发送范围、调用次数上限和费用边界。
4. AI 输出先成为建议；教师采用后才改变当前设计。
5. LangGraph 使用短步骤流程，并在教师决定处中断。
6. URL 只在教师明确触发后抓取单个普通公开页面；失败可改为粘贴文本。
7. 教师确认“有权用于当前任务处理”后才允许正文切片、RAG 和模型传输；权利未知只保留元数据。
8. 无 Key 时只提供内置预生成 AI 示例，用户任务可继续手工完成；不自动降级到其他模型。
9. 同时执行单次、每日 Token/调用和人民币预算硬上限。
10. Docker Compose 是标准完整环境，开发模式允许分进程启动。

## 4. 工作包与产物

| 工作包 | 产物 | 完成证据 |
|---|---|---|
| 9.1 当前资料研究 | `CASE-STUDY-RESEARCH.md` | 官方资料、成熟案例、采用与拒绝理由可追踪 |
| 9.2 边界与用例 | `BACKEND-ARCHITECTURE.md` | 依赖方向、服务/repository/事务边界明确 |
| 9.3 HTTP 契约 | `API-AND-OPENAPI-DESIGN.md` | 资源、输入输出、错误、并发、幂等和 SSE 契约明确 |
| 9.4 安全与生命周期 | `AUTHORIZATION-TRANSACTIONS-LIFECYCLE.md` | workspace、删除、URL、秘密和权限负向路径明确 |
| 9.5 Worker 和事件 | `WORKER-JOBS-SSE.md` | 认领、租约、重试、取消、stale 和断线恢复明确 |
| 9.6 AI/RAG/Agent | `AI-RAG-AGENT.md` | 模型、预算、检索、引用、checkpoint 和人工门禁明确 |
| 9.7 本地运行 | `LOCAL-RUNTIME-OBSERVABILITY.md` | Compose、无 Key、配置、日志和健康检查明确 |
| 9.8 测试与落地 | `BACKEND-TEST-PLAN.md`、`IMPLEMENTATION-AND-ROLLBACK.md` | 测试矩阵、迁移顺序和回滚明确 |
| 9.9 第一性原理复审 | `BACKEND-REVIEW.md` | 两道完成门通过，P0/P1 清零 |
| 9.10 交付 | `LEARNING-CARD.md`、`STAGE-9-REPORT.md` | 新手可理解，归档范围精确 |

## 5. 门禁

- 阶段 9 可以记录阶段 10 需要新增的 migration，但不得创建或修改 SQL。
- 设计文档获批归档前，不得创建 `apps/api`、`apps/worker` 或 `packages/*` 后端代码。
- 用户回复“批准归档”前不得执行 `git add`、commit、tag 或 push。
- 真实 GLM、秘密文件、生产服务、真实数据、外网部署和外部副作用始终需要后续单独授权。
