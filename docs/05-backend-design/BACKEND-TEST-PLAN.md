# 后端测试与故障注入计划

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档
> 数据：只使用公开许可或合成 fixture；CI 不调用真实 GLM

## 1. 测试层级

| 层 | 重点 | 最低证据 |
|---|---|---|
| 单元 | domain 状态机、影响传播、权限结果、预算、切片、引用、错误映射 | 正常、边界、失败和性质测试 |
| 契约 | Zod、Hono、OpenAPI、SSE、fake provider | spec 与实现双向校验；每个已知错误有样例 |
| 数据库集成 | repository、角色、事务、队列、恢复、purge | PostgreSQL 18.6 + pgvector 0.8.6 真容器 |
| Agent replay | checkpoint、interrupt、崩溃恢复、版本不兼容 | 重放不重复应用；任务删除无残留 |
| 安全负向 | workspace、CSRF、Content-Type、SSRF、注入、秘密 | 全部拒绝且响应不可区分/不泄露 |
| E2E | 浏览器完整本地工作流 | fake provider、双窗口、SSE 断线、删除恢复 |
| 运维演练 | 空库、升级、备份恢复、overdue purge | 可重复命令、计数与残留查询 |

## 2. 单元与领域用例

- P01—P09 输入边界与前端字段映射；P04/P10 不产生独立流程，P11 不存在。
- 上游变化只使正确下游 `needs_review`，旧 revision 不修改。
- 未选/跨 task source version、错 chunk、错引文、权利未知导出均被门禁拒绝。
- lock version、If-Match、相同/不同幂等请求、重复取消和终态不可复活。
- 24 小时边界前后、夏令时无关 UTC 计算、purge 已认领撤销失败。
- Token/CNY reservation 的并发求和、释放、超限和价格档案缺失。
- chunk 边界、Unicode、超长段落、稳定 hash、相同输入确定性输出。

## 3. 契约与 OpenAPI

- 每个 Hono 路由、方法、Content-Type、参数、成功和 Problem 都在 OpenAPI 3.1。
- 省略/伪造 Content-Type、未知字段、超深 JSON、超大 body 均不能绕过 Zod。
- response 和 SSE payload 经 schema 验证；数据库字段、workspace ID、堆栈和 SQL 不得出现。
- 404 对“不存在/跨 workspace/已删除”保持相同 status、code 和文案形状。
- OpenAPI examples 全部合成；operationId 唯一；breaking diff 阻断。

## 4. 数据库与并发集成

- 使用 app/worker 非 owner 角色证明最小授权；app 不能改不可变 revision/source version 或 Agent 表，Worker 不能写 teacher decision。
- 两个 Worker 同时抢一个 job 只有一个成功；租约过期可被另一 Worker 认领，旧 lease 无法提交。
- 取消与完成竞态、编辑与模型完成竞态、删除与 job 完成竞态都以取消/stale/删除为优先，不写旧结果。
- command receipt 唯一冲突、处理恢复、事务死锁重试和外部调用不在事务中的检查。
- exact cosine 查询只命中当前 task 已选、权利允许、profile 匹配的 source version。
- `job_events` Last-Event-ID 回放不跨 workspace/task；gap 生成 reset。
- migration 从 `0002` 向前成功，重复运行安全；旧程序可在保留新增结构时回退。

## 5. Provider、RAG 与 Agent 故障注入

Fake provider 场景：成功、空响应、非 JSON、schema 缺字段/多字段、恶意 HTML、伪造引用、超长输出、返回不同模型、usage 缺失、429、5xx、慢响应、连接中断、取消忽略和结果不明。

Agent replay 场景：

- 检索后崩溃并恢复；
- 模型响应后、数据库结算前崩溃；
- interrupt 前后恢复；
- paused 时教师修改 task；
- graph/prompt/schema 版本变化；
- task 删除及 checkpoint `deleteThread()`；
- unrelated thread 不受清理影响。

验证目标是“不重复应用、不越权、不假成功、不突破预算”，不是强行让每次生成成功。

## 6. 安全负向矩阵

- 猜测 task/source/revision/job/event ID；客户端提交 workspace ID；跨 task 私有来源。
- 跨站表单、恶意 Origin/Host、无 Cookie、Cookie 篡改、JSON Content-Type 绕过。
- URL 的十进制/十六进制/IPv4-mapped IPv6、localhost 别名、私网、链路本地、DNS rebinding、重定向转内网、超大/慢/压缩炸弹、证书错误。
- 网页/教师文本含“忽略指令”、伪 system prompt、HTML/Markdown 注入、外链像素和 SQL/Shell 指令。
- 模型返回另一个 task 的 ID、未检索来源、相似题名假引用或截断拼接引文。
- 日志、Problem、SSE、OpenAPI 和导出 manifest 的秘密/正文/内部路径扫描。

## 7. E2E 场景

1. 无 Key 启动，内置示例可看、用户任务 AI 明确不可用、手工 P01—P09 可完成。
2. fake provider：主动生成建议 → 未采用不改当前状态 → 教师采用 → 下游正确失效。
3. P03 一个 URL 成功、一个失败，页面显示 partial，成功项保留。
4. SSE 运行中断网/刷新后从 Last-Event-ID 恢复；事件缺口走 reset + REST。
5. 两窗口编辑同任务，后提交者收到 412，不能静默覆盖。
6. 删除立即落 P12/隐藏，24 小时内撤销；到期后 task、私有 RAG、job、checkpoint 无残留。
7. 审计有 blocker/unknown 时无法签发和导出；修复后重新审计才开放。
8. 导出只取得当前批准 revision 的 manifest，不含服务器路径、内部 ID 或未授权全文。

## 8. 非功能门槛

- 普通本地 GET 的目标 P95 < 300ms，写入 P95 < 500ms（不含异步外部调用）；这些是阶段 10 测量目标，不是当前通过声明。
- 100 个 task、每 task 100 个 source version/1000 chunks 的合成规模下，任务读取、queue claim 和 exact retrieval 用 EXPLAIN 验证无非预期全表扫描。
- SSE 连接断开后资源释放；API/Worker 优雅停机；连接池不泄漏。
- lint、typecheck、unit、contract、integration、Agent replay、security negative、E2E、build 和 audit 均有标准命令。

## 9. 真实 GLM 的后置验证

只有另行授权后，用专门合成输入做最小 smoke：确认国内端点可调用目标模型、返回 model ID、JSON/usage、超时/取消和数据政策。不得读取既有本机秘密文件；价格和账号权限以当时官方/账号事实更新 price profile。smoke 失败不降级，记录阻断供用户决定。
