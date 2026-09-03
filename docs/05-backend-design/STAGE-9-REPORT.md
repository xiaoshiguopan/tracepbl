# 阶段 9 后端设计报告

> 文档版本：0.1
> 日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档；随本次本地提交归档
> 范围：后端设计与项目状态同步；不含代码、migration/OpenAPI 实现、依赖、真实 GLM 或部署

## 1. 阶段结果

阶段 9 已把用户确认的十项方案转换为可直接实施的后端设计：模块化单体、Hono REST/OpenAPI、localhost 会话和逐资源授权、repository/领域服务/事务、乐观锁与幂等、URL 安全、轻量 RAG 和引用门禁、固定 GLM adapter、预算、PostgreSQL Worker queue、LangGraph checkpoint、task-scoped SSE、24 小时删除/purge、本地 Compose、可观测性、测试和回滚均有明确落点。

第一性原理复审发现并关闭四个 P0 和五个 P1；当前 P0/P1 为零。剩余真实 GLM 权限/价格、Cookie 浏览器矩阵和性能数据都有 fail-closed 或局部验证边界，不要求编码期决定新的产品行为。

## 2. 关键决定

- 一个模块化单体、API/Worker 两进程；PostgreSQL 是完整模式真相，Pages 永不连接后端。
- 无登录页；本地随机秘密 + host-only Cookie；workspace 只由服务端注入；无权与不存在统一 404。
- API `/api/v1`；Zod 生成/验证 OpenAPI 3.1；JSON 强制 Content-Type；写入使用 If-Match 与幂等键。
- 外部调用都在事务外；Worker 采用 SKIP LOCKED、lease token/fencing、有限重试、合作取消和 stale 门禁。
- AI 仅主动触发，结果先写 generated revision；教师 adoption 才改变当前状态。
- 只检索当前 task 已选、权利允许的准确 source version/chunk；引用由服务端重建，模型不能自报来源。
- 固定 `GLM-5.3-Flash` 和 `embedding-3` 1024/cosine；无 Key/价格档案时真实 AI 关闭，无静默降级。
- 单次/每日调用、Token 和 ¥2.00 每日预算同时限制；并发预算先预留后结算。
- LangGraph 只做短图与 interrupt；禁用 PostgresStore、长期记忆和高风险工具；task purge 整线程删 checkpoint。
- SSE 用独立 job_events 支持 Last-Event-ID/reset；不传 token 正文。
- 删除立即隐藏、24 小时可撤销；purge 先删 checkpoint 再删 task；备份恢复先重做 overdue purge。

## 3. 阶段 10 数据库增量

不修改已归档 `0001`/`0002`。阶段 10 获批后新增一个向前 migration，补 job lease/cancel/progress、SSE events、usage ledger、model 返回/价格证据、终态约束、最小权限和受控 checkpointer 初始化。它是后端运行支持，不推翻阶段 7/8 的领域模型。

## 4. 本阶段精确文档

- `docs/05-backend-design/STAGE-9-PLAN.md`
- `docs/05-backend-design/CASE-STUDY-RESEARCH.md`
- `docs/05-backend-design/BACKEND-ARCHITECTURE.md`
- `docs/05-backend-design/API-AND-OPENAPI-DESIGN.md`
- `docs/05-backend-design/AUTHORIZATION-TRANSACTIONS-LIFECYCLE.md`
- `docs/05-backend-design/WORKER-JOBS-SSE.md`
- `docs/05-backend-design/AI-RAG-AGENT.md`
- `docs/05-backend-design/LOCAL-RUNTIME-OBSERVABILITY.md`
- `docs/05-backend-design/BACKEND-TEST-PLAN.md`
- `docs/05-backend-design/IMPLEMENTATION-AND-ROLLBACK.md`
- `docs/05-backend-design/BACKEND-REVIEW.md`
- `docs/05-backend-design/LEARNING-CARD.md`
- `docs/05-backend-design/STAGE-9-REPORT.md`
- `docs/00-governance/PROJECT-STATE.md`
- `docs/README.md`

`docs/05-backend-design/BACKEND-REVIEW.template.md` 保持模板原样，不进入拟议归档清单。最终精确清单仍以归档前 `git diff --name-only` 为准。

## 5. 验证

- 逐项核对 PRD、前端数据契约、数据库不变量和阶段 9 用户确认方案。
- 按 `DESIGN-REVIEW-STANDARD.md` 完成结果/真相/失败重建、决定冻结、对抗性走查和跨层审查。
- 将 P0/P1 的修订同时落入架构、API、生命周期、Worker、AI 和测试文档，而非只记在评审表。
- 执行 Markdown 占位符、敏感模式、内部链接、Git diff、空白错误和禁止产物检查；最终结果见本次对话验证输出。

## 6. 明确未做

- 未创建后端代码、OpenAPI 文件、脚手架、SQL 或 migration。
- 未安装或升级依赖，未启动后端、数据库或容器。
- 未调用真实 GLM，未读取或暴露 `C:\Users\10342\Desktop\glm.txt`。
- 未使用真实个人/教师/学生数据，未联网搜索史料或摄取文件。
- 未执行 `git add`、commit、tag、push、部署或外发。

## 7. 风险和后续门禁

- `GLM-5.3-Flash` 国内 API 权限、实际返回型号、按量价格和数据政策仍待以后专门授权的合成 smoke；此前真实 AI 保持关闭。
- Hono/OpenAPI、LangGraph checkpointer 和 URL 抽取的已知边界必须用阶段 10 负向测试证明，不能只信文档。
- 阶段 9 获批归档不自动授权阶段 10；归档完成后仍需用户明确开始后端编码。

## 8. 拟议 Git 归档

- 建议暂存：第 4 节列出的 15 个精确路径，且只限这些路径。
- 排除：`output/`、模板、代码、migration、lockfile 和一切其他已有用户文件。
- 建议提交消息：`docs: archive backend design stage`
- 秘密/个人数据：设计文档只出现禁止读取的路径名称和变量类别，不含秘密值或真实个人/学生内容。

用户已于 2026-09-03 明确回复“批准归档”，仅授权第 4 节所列 15 个路径的一次本地提交；不含 `output/`、阶段 10、tag、push 或部署。
