# REST API、OpenAPI 与错误契约设计

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档
> 注意：本文是设计，不是 OpenAPI 文件或接口实现

## 1. 公共约定

- 基础路径 `/api/v1`；资源用复数名词，JSON 字段用 `camelCase`。
- 成功响应使用明确资源或 view model，不建立无信息的通用 `{data:any}`。
- 列表使用不透明游标，稳定排序为 `(updatedAt DESC,id DESC)` 或资源声明顺序；默认 20、最大 100。
- 写请求必须是 `application/json`；缺失或错误 Content-Type 返回 415。
- 当前任务读取返回 `ETag: "task-lv-{lockVersion}"`；权威写入要求 `If-Match`，缺失为 428，失配为 412。
- 创建、异步动作、采用、决定、复制、删除、撤销和导出要求 `Idempotency-Key`。
- 每个响应包含或回显安全 `X-Trace-Id`；任何客户端 ID 都只定位，不授权。

## 2. 资源表

| 方法和路径 | 结果 | 同步/异步 | 关键门禁 |
|---|---|---|---|
| `GET /runtime` | 模式、fixture/契约版本、AI/RAG 可用性和限制摘要 | 同步 | 不返回秘密、内部 workspace ID |
| `GET /tasks` | 当前 workspace 活动任务列表 | 同步 | 删除中任务不返回 |
| `POST /tasks` | 新任务及初始 ETag | 同步 | 幂等；不接受 workspace ID |
| `GET /tasks/{taskId}` | 当前任务聚合摘要 | 同步 | workspace + 非删除条件 |
| `POST /tasks/{taskId}/copies` | 新任务 | 同步/必要派生异步 | 私有来源生成新身份，不能复用旧 task-scoped 行 |
| `DELETE /tasks/{taskId}` | 删除窗口和撤销截止时间 | 同步 | If-Match、幂等、影响确认 |
| `POST /tasks/{taskId}/restorations` | 恢复后的任务和 ETag | 同步 | 仅 `now < purgeAfter` 且 purge 未认领 |
| `GET/PUT /tasks/{taskId}/context` | P01 view/current resource | 同步 | 字段校验、影响传播 |
| `GET/PUT /tasks/{taskId}/question-set` | P02 中心问题和 1—3 子问题 | 同步 | 确认语义由教师动作产生 |
| `GET /tasks/{taskId}/sources` | P03 候选、筛选、选择、分项状态 | 同步 | 只返回当前 task 可见内容 |
| `POST /tasks/{taskId}/materials` | 私有 URL/文本材料及 operation | URL 异步，文本登记同步后再异步 | 权利/敏感信息确认、大小限制 |
| `PUT /tasks/{taskId}/source-selection` | 已选来源和影响 | 同步 | version 必须当前 task 可选；selectedBy 固定 teacher |
| `GET/PUT /tasks/{taskId}/evidence-map` | P05 | 同步 | source version、claim、citation 同 task |
| `GET/PUT /tasks/{taskId}/lesson-design` | P06 | 同步 | 活动来源必须已选择 |
| `GET/PUT /tasks/{taskId}/rubric` | P07 | 同步 | activity 映射同 task |
| `POST /tasks/{taskId}/proposals` | AI 建议 operation | 异步 | purpose 判别联合、披露确认、预算、If-Match |
| `GET /tasks/{taskId}/proposals/{revisionId}` | 已校验建议 | 同步 | 只读 generated revision；stale 不可采用 |
| `POST /tasks/{taskId}/proposals/{revisionId}/adoption` | 更新后的当前资源和 ETag | 同步 | 教师动作、版本和引用重验 |
| `POST /tasks/{taskId}/audits` | P08 run/operation | 异步 | 内容不变可复用，未知不算通过 |
| `POST /tasks/{taskId}/decisions` | 教师决定 | 同步 | 只允许 acceptRisk/requestChanges/approve/revoke 的合法目标 |
| `POST /tasks/{taskId}/exports` | P09 export operation | 异步 | 最终 revision、审计和权利门禁 |
| `GET /tasks/{taskId}/exports/{exportId}/manifest` | 不可变导出清单 | 同步 | 无下载 URL、无服务器路径；只含获准内容 |
| `GET /tasks/{taskId}/operations/{operationId}` | 统一 OperationStatus | 同步 | job 必须属于当前 workspace/task |
| `DELETE /tasks/{taskId}/operations/{operationId}` | 取消请求状态 | 同步 | 幂等；终态不复活 |
| `GET /tasks/{taskId}/events` | task-scoped SSE | 长连接 | Cookie 会话、task 授权、Last-Event-ID |

## 3. 关键请求契约

### 材料输入

请求只允许 `kind=url|text`、名称、URL/正文、`rightsAttestation=authorizedForCurrentTask|unknown`、敏感信息确认。`unknown` 不接受正文持久化；服务端忽略客户端提交的核验、权利升级、workspace 和派生状态。

### AI 建议

`purpose` 仅允许 `questionGuidance|sourceAnalysis|evidenceAnalysis|lesson|rubric|audit`。请求含 `baseLockVersion`、披露版本和可选局部对象 ID；不能提交 provider、模型名、Token 上限、prompt 或任意工具。

### 教师采用

请求含 generated revision ID、允许采用的分项和 `baseLockVersion`。采用是领域命令，不是把任意 JSON patch 写入任务。

### 导出 manifest

Worker 在门禁通过后创建 `reason='exported'` 的不可变 task revision，并让 export run 指向它；manifest 由该 snapshot 确定性投影。数据库不保存 DOCX/PDF、下载 URL 或本机路径，API 也不能把“manifest 已返回”冒充浏览器已保存文件。

## 4. OperationStatus

统一字段：`id`、`kind`、`status=queued|running|partial|succeeded|failed|cancelled`、可选 `phase=processing|waitingForTeacher`、`completedItems`、`totalItems`、`attempt`、`canCancel`、`startedAt`、`updatedAt`、安全错误和结果链接。

数据库 job 没有 `partial` 也不需要改成领域真相：`partial` 由一组子 job 聚合。数据库 `stale` 对外映射为 `status=failed` 和稳定 `RESULT_STALE` 原因；SSE 可发送 `operation.stale` 提醒立即刷新。LangGraph interrupt 对外仍是 `status=running, phase=waitingForTeacher`。这些映射不扩大已批准前端 `OperationStatus` 的主状态枚举。

## 5. Problem 契约

采用 RFC 9457 风格但增加稳定 `code`：

| HTTP | code | 含义 |
|---:|---|---|
| 400 | `MALFORMED_REQUEST` | JSON/游标/头格式错误 |
| 401 | `SESSION_REQUIRED` | 本机会话缺失或无效 |
| 404 | `RESOURCE_NOT_FOUND` | 不存在、跨 workspace、已删除或不可见；文案相同 |
| 409 | `INVALID_STATE` | 当前业务状态不允许 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 同 key 对应不同请求哈希 |
| 409 | `PURGE_ALREADY_STARTED` | 删除已进入不可撤销清理 |
| 412 | `VERSION_CONFLICT` | If-Match/baseLockVersion 过期 |
| 428 | `PRECONDITION_REQUIRED` | 权威写入缺少 If-Match |
| 413 | `INPUT_TOO_LARGE` | URL、文本、JSON 或外部响应超限 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 不是声明的 JSON/可接受网页类型 |
| 422 | `VALIDATION_FAILED` | 字段或领域校验失败 |
| 422 | `CITATION_GATE_FAILED` | 来源、版本、chunk、定位或引文不相符 |
| 429 | `BUDGET_EXCEEDED` | 调用/Token/人民币预算不足 |
| 429 | `RATE_LIMITED` | 本地保护限流 |
| 503 | `AI_NOT_CONFIGURED` | 无 Key、无价格档案或 kill switch 关闭 |
| 503 | `PROVIDER_UNAVAILABLE` | 明确的外部不可用 |
| 500 | `INTERNAL_ERROR` | 未预期错误，只返回 traceId |

Problem 禁止包含 SQL、堆栈、内部路径、第三方原始正文、秘密、workspace ID、完整 prompt 或其他任务内容。

## 6. OpenAPI 生成与验证

- `packages/contracts` 以 Zod 定义参数、请求、成功、Problem 和事件 schema，再由 Hono 路由 metadata 生成 OpenAPI 3.1。
- SSE 使用 `text/event-stream` 手工登记事件联合，不与普通 JSON response 类型耦合。
- spec 提供合成示例；不使用仓库史料以外的许可不明内容。
- 合同测试验证：所有路由都在 spec、所有已知错误已声明、operationId 唯一、无数据库内部字段、实现响应均通过 Zod。
- OpenAPI 的破坏性变化进入 `/api/v2` 或按变更控制处理；阶段 10 不生成 SDK，前端直接消费共享 TypeScript/Zod 契约。
