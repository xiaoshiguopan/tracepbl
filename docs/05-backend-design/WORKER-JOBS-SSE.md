# Worker、Job、恢复与 SSE 设计

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档

## 1. Job 模型

PostgreSQL `ops.jobs` 是唯一队列真相。阶段 10 新 migration 为其增加 `lease_token`、`lease_expires_at`、`cancel_requested_at`、`wait_state`、`progress_current`、`progress_total` 和必要约束；不修改 `0001`/`0002`。

支持现有 kind：`source_check`、`embedding`、`model`、`audit`、`export`、`purge`。前端的 `partial` 是同一用户动作下多个子 job 的聚合，不新增可变终态；LangGraph interrupt 映射为 `running + wait_state=teacher`，API 对外为 `running + phase=waitingForTeacher`。

## 2. 认领与租约

一个认领事务执行：

1. 选择 `queued AND available_at<=now()`，或 `running AND lease_expires_at<now()` 的候选；
2. 使用 `FOR UPDATE SKIP LOCKED`，按 priority、available_at、ID 稳定排序；
3. 写 `running`、attempts+1、新随机 lease token、worker ID 和租约到期；
4. 插入 `operation.running` 事件；
5. 提交后再执行工作。

运行时间超过租约一半时续租。所有进度和最终更新同时匹配 job ID、workspace、status=running 和 lease token；失去租约的旧 Worker 不能写结果。

`LISTEN/NOTIFY` 只发送“有新 job”的提示，不放内容；Worker 同时以约 2 秒可抖动轮询兜底。通知丢失不影响正确性。

## 3. 重试矩阵

| 失败 | 自动重试 | 规则 |
|---|---|---|
| 数据库短暂连接/死锁 | 是 | 2s/10s/30s 加 jitter，受 max_attempts 限制 |
| Provider 明确 429/可重试 5xx 且未产生结果 | 是 | 遵守 Retry-After；同一用户动作总模型调用最多 2 次 |
| 请求已经发出但结果不明的超时 | 否 | 防止不透明重复收费；标记 failed，教师可主动重试 |
| Zod/引用/权利/状态校验失败 | 否 | 永久失败或 stale |
| 输入 lock version 改变 | 否 | `stale`，不应用旧结果 |
| 取消 | 否 | `cancelled`，终态不可复活 |
| Worker 崩溃 | 是 | 租约到期后新 Worker 认领；已完成副作用必须由幂等记录保护 |

成熟队列也只能做到至少一次执行；史证工坊只承诺“领域结果最多应用一次”，不虚报模型调用一定只发生一次。

## 4. 取消和 kill switch

- queued job：API 条件更新为 cancelled，并写终态事件。
- running job：API 只写 `cancel_requested_at`；Worker 轮询并触发 AbortSignal。等待教师的 job 没有活动 lease，可直接安全取消。
- 外部提供商可能已计费或忽略取消，但取消提交后最终事务必须拒绝应用结果。
- provider kill switch 关闭新模型/embedding job；已运行任务请求取消，普通保存和无 Key 路径不受影响。
- purge 一旦取得 lease 不能由普通取消接口停止；宽限期撤销必须在此之前完成。

## 5. stale 与部分失败

Worker 在外部调用前、调用后和最终写入事务中分别检查 task 未删除、输入 lock version、目标 source version 和预算 reservation。任一变化都把 job/run 标为 stale；输出正文不进入当前状态，也不生成可采用 revision。

批量来源处理拆为独立子 job。聚合 operation 可以是 partial，并列出成功、失败、未知和可重试项；成功项保留，失败项不会清空已有史料。

## 6. Job 事件表

阶段 10 新增 `ops.job_events`：全局 bigint identity ID、workspace/task/job、schema version、event type、去内容化 payload、occurred_at。它是短期回放事实，不代替 job 当前状态，也不复用内容最小化目的不同的 `audit_events`。

持久事件仅包括：

- `operation.queued`
- `operation.running`
- `operation.progress`
- `operation.paused`（事件提示进入教师等待；REST 主状态仍为 running）
- `operation.succeeded`
- `operation.failed`
- `operation.cancelled`
- `operation.stale`
- `task.deleted`
- `stream.reset`

payload 只含 operation ID、kind、计数、尝试、可取消、结果资源链接和安全错误码；不含 prompt、网页/模型正文、引文、秘密或 workspace ID。

## 7. SSE 协议

`GET /api/v1/tasks/{taskId}/events` 使用 Cookie 会话。建立连接前执行与普通 task GET 相同的 workspace/删除授权；一个连接只服务一个 task。

- SSE `id` 使用 job_events 的单调 ID；`event` 使用上述事件名；`retry` 建议 3000ms。
- 浏览器重连自动发送 `Last-Event-ID`；服务端只查询当前 workspace/task 且 ID 更大的事件。
- 若 ID 不存在、已清理或超出允许窗口，发送 `stream.reset` 和当前 operation 快照，客户端重新 GET；不跨任务猜测缺口。
- 15 秒发送 SSE comment heartbeat，不持久化。
- 设置 `Content-Type: text/event-stream`、`Cache-Control: no-store`，禁用代理缓冲；本地模式不允许中间缓存。
- 每会话最多 3 个 SSE 连接，每 task 最多 2 个；超过返回 429，普通轮询仍可用。
- 终态后 SSE 不承载完整结果；客户端回到 REST 读取数据库真相。

LangGraph 到达 interrupt 后，Worker 写 `wait_state=teacher`、释放 lease 并发送 paused 事件，不会被普通过期租约查询再次认领。教师 adoption/拒绝由 API 领域事务先执行，再把同一 job 以只含 decision ID 的 resume 命令重新排队；Worker 使用 checkpoint 恢复并进入终态，不能重跑已完成的模型调用。

## 8. 事件保留

v0.1 每个 job 只记录状态转移和有界进度，不流式保存 token。终态事件至少保留 24 小时；之后可在普通 Worker 启动/完成时机会式清理，但当前 job 状态和审计仍保留到 task 删除。清理失败只影响回放深度，不能影响 operation 真相，重连走 reset。
