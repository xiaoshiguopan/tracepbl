# 本地运行、配置、秘密与可观测性

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档

## 1. 两种产品形态

| 形态 | 数据与 AI | 网络 |
|---|---|---|
| GitHub Pages Demo | IndexedDB、公开/合成 fixture、预生成结果 | 不连接秘密后端，不探测 localhost |
| 完整本地模式 | PostgreSQL、Hono API、Worker、可选真实 GLM | 默认只监听 `127.0.0.1` |

Web 构建时使用明确的公开运行模式和 API origin 配置；任何 `VITE_*` 都视为公开。模式不匹配时显示明确错误，不自动回退或搬运数据。

## 2. Docker Compose 标准环境

服务顺序：

```text
postgres healthy
→ migrate/checkpointer-init 完成
→ overdue-purge-once 完成
→ api + worker + local web
```

- PostgreSQL 18.6 + pgvector 0.8.6 使用固定镜像摘要策略，数据在命名卷。
- migration 使用 migrator 角色；API、Worker 各自使用最小角色。
- API/Web 端口显式绑定 `127.0.0.1`；数据库默认不 publish，开发 profile 如需访问也只绑 loopback。
- API readiness 必须等待 schema head、checkpoint 初始化和恢复后 purge 成功。
- 服务支持 SIGTERM：停止接收新请求/job、关闭 SSE、释放连接池；Worker 在宽限内续租/完成或安全放弃 lease。
- Compose 只用于本地/CI，不构成生产部署方案。

开发模式允许分别启动 Web、API、Worker 和 PostgreSQL，但复用同一配置 schema、角色和迁移，不能另造内存真相。

## 3. 配置类别

最终变量名在阶段 10 契约测试中冻结，类别和语义本阶段冻结：

| 类别 | 使用方 | 秘密 | 规则 |
|---|---|---|---|
| mode、host、port、allowed origin | Web/API | 否 | host 默认 127.0.0.1；不得宽泛 CORS |
| app/worker/migrator database URL | 对应进程 | 是 | 不共用 owner；不进入浏览器/日志 |
| local session secret/file | API | 是 | 首启生成、至少 256 位、可轮换，轮换使旧 Cookie 失效 |
| GLM API key/base URL | Worker | 是 | 只允许批准的智谱国内端点；禁止客户端覆盖 |
| model/profile/template | Worker | 否 | 固定目标和版本；不匹配 fail closed |
| timeout/retry/lease/poll | API/Worker | 否 | 有安全默认和最大值，客户端不能放宽 |
| calls/tokens/CNY budget | API/Worker | 否 | 启动校验；价格档案缺失则真实 AI 关闭 |
| delete grace | API/Worker | 否 | 固定 24 小时，不能由环境缩短 |
| kill switches | API/Worker | 否 | generation、embedding、URL fetch 分开关闭 |

配置在启动时一次 Zod 校验；未知变量不改变行为，非法值阻止 readiness。示例文件只含占位符，不含真实值。

## 4. 日志与审计

应用写 JSON 结构化日志，至少含 timestamp、level、event、traceId、correlationId、可选 task/job/modelRun 的不透明关联、duration、attempt、status 和稳定 error code。

禁止记录：Cookie、本地秘密、API key、数据库 URL、workspace ID、完整 URL query、正文/引文全文、完整 prompt、模型原始响应、SQL、堆栈对外回显、个人/学生数据。错误堆栈只允许本机开发 stderr，必须经过字段脱敏且不进入 API 响应/持久审计。

`audit_events` 记录教师采用/批准/撤销、任务删除/恢复、预算阻断、来源权利声明和关键运行终态。SSE `job_events` 服务短期状态回放，两者目的不同，不混用。

## 5. 健康与指标

- `/health/live`：进程事件循环可响应，不检查外部服务。
- `/health/ready`：配置有效、数据库可连、migration/checkpointer head 正确、恢复清理已完成；无 GLM Key仍可 ready。
- `/api/v1/runtime`：对前端公开 capabilities、无 Key状态和安全上限摘要，不公开内部健康细节。

最小指标从结构化日志和数据库状态计算：请求耗时/状态码、队列深度/最老等待、租约重领、job 终态、SSE 连接、provider 延迟/错误、Token/费用、stale、引用门禁失败和 purge 结果。v0.1 不新增远程 APM、遥测上传或管理后台。

## 6. 限流与熔断

- 请求体、JSON 深度、列表 limit、URL/text 和 SSE 连接有硬上限。
- 本地会话和进程级短窗口限流保护误操作；费用真相在 PostgreSQL ledger，不依赖内存计数。
- provider 连续明确失败达到阈值时短时熔断；半开只允许一个探测，但不能换模型。
- generation、embedding、URL fetch 均有独立 kill switch；关闭时保留手工工作流。

## 7. 无 Key 与 CI

无 Key 启动不是错误。`runtime.ai.available=false`，内置示例由 fake/precomputed adapter 提供，用户新任务 AI 动作返回可解释的 `AI_NOT_CONFIGURED`。CI 永不读取开发者本机文件，只注入 deterministic fake provider，覆盖成功、非法 JSON、超时、取消、429、引用错配和 stale。

真实 Key 验证必须在后续专门授权的后端联调阶段进行，只用合成内容；不得读取 `C:\Users\10342\Desktop\glm.txt`。
