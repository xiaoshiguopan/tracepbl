# AI、轻量 RAG、引用与 LangGraph 设计

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档

## 1. 固定模型边界

- 生成 provider：智谱国内 API 的可替换 adapter；请求目标严格为 `GLM-5.3-Flash`。
- embedding：`embedding-3`、1024 维、cosine；profile 同时记录 chunker version。
- 目标模型不可用、无权限、下线或返回其他型号时明确失败；不改用旧 GLM、其他厂商或本地模型。
- 无 Key、无已确认价格档案、kill switch 关闭时，用户任务 AI 不可用；内置预生成示例和全部手工功能继续运行。
- 不启用模型联网搜索、rerank、图片、OCR、文件摄取、托管知识库或厂商长期 Agent。

## 2. Provider adapter

adapter 只提供 `generateStructured`、`embed`、健康能力描述和 AbortSignal；领域层看不到 SDK/HTTP 类型。每次运行记录输入 milestone、输出 generated revision、requested model、实际返回 model、provider、prompt template version、input fingerprint、用量、价格档案版本、估算费用、状态和去内容化错误。

HTTP 响应先校验外层状态、智谱业务码、finish reason 和大小，再解析 JSON。JSON mode 不构成可信 schema；结果必须通过 purpose 对应的 Zod schema、字段上限和未知字段策略。

## 3. 提示模板

- 模板以代码资产版本化，例如 `question-guidance.v1`；运行表只记录版本，不记录完整 system prompt。
- system 指令、教师输入和来源正文使用结构化分区；正文明确标为不可信待分析数据。
- 模型不得输出 SQL、Shell、HTML、外部写入或工具权限；任何看似指令的网页内容都作为引用数据。
- purpose 分别定义输出 schema，不建立一个无界通用 Agent prompt。
- 自动格式修复最多一次，计入两次调用和预算；引用/权利/权限失败不能通过“让模型再解释”修复。

## 4. Token、费用、超时和重试

初始安全默认：

| 限制 | 值 |
|---|---:|
| 单次生成输入 | 24,000 tokens |
| 单次生成输出 | 4,000 tokens |
| 单用户动作模型调用 | 最多 2 次 |
| workspace 每日生成调用 | 20 次 |
| workspace 每日生成 Token（已结算 + 预留） | 200,000 |
| workspace 每日 embedding Token | 200,000 |
| workspace 每日人民币预算 | ¥2.00 |
| 生成总超时 | 120 秒 |
| embedding 总超时 | 30 秒 |

每日边界使用配置的 `Asia/Shanghai` 自然日并在数据库按 UTC 时间计算。阶段 10 新 `ops.usage_ledger` 在调用前原子预留最大额度，完成后结算实际值、释放剩余；并发 Worker 不能共同突破上限。官方价格未确认时没有合法 price profile，真实调用 fail closed。

只重试明确 429/可重试 5xx 且未获得结果的调用，并受“最多两次”约束；已发送后结果不明的超时不自动重试。取消可能无法追回已发生费用，UI 必须诚实显示。

## 5. 来源进入 RAG 的门

只有同时满足以下条件的 `source_version` 才能切片：

- 属于 catalog，或属于当前 task_private；
- 已被当前 task 选择或正为当前 task 处理；
- `content_text` 非空；
- rights 不为 `restricted_metadata_only`/`not_allowed`；
- 教师对私有正文已确认当前任务处理授权；
- 内容 hash 和版本已冻结。

公共来源更新创建新 version；旧 task 不静默换到新版。Embedding 是可重建派生物，永远不能反过来改变来源版本。

## 6. Chunk v1

1. 规范 Unicode、换行和空白，但不改写正文意义；
2. 优先按标题、段落、句子切分；
3. 目标 800 Unicode code points、重叠约 120、硬上限 1600；
4. 每块保存 ordinal、heading、charStart/charEnd、locator 和 SHA-256；
5. provider 前再按 token 计数验证每项不超过 3072，批次不超过 64；超限继续确定性细分；
6. 相同 source version + content hash + profile 重复请求返回已有结果。

## 7. 检索

- 查询只 join 当前 `workspace_id/task_id` 的 `task_sources`、可处理 source version、对应 profile embedding。
- 使用 pgvector 精确 cosine；先取最多 24 个候选，不建 HNSW/IVFFlat。
- 可在应用内计算简单关键词重合，只作为透明的次级排序，不新增隐式 rerank 模型。
- 最终上下文最多 8 块、同一来源最多 3 块；记录所有 `retrieval_hits` 的 rank、distance、keyword score 和 selectedForContext。
- 低相关或无结果时返回证据不足，不能让模型凭记忆补史料。

## 8. 引用门禁

模型只能引用本次传入的稳定 hit reference。服务端逐条重建引用：

- hit 属于本次 model run 和当前 task；
- source version 是当前 task 已选版本；
- chunk 与 source version 复合匹配；
- quoted text 经相同规范化后是 chunk 的精确子串；
- locator、题名、机构、URL 从数据库读取，不信任模型复述；
- rights/verification 状态允许当前动作；
- 最终写入时 task lock version 未变化。

任一必需引用失败则 `CITATION_GATE_FAILED` 或 stale，不能创建可采用 revision。未知、模型推断和网页自述不得升级为 verified。

## 9. LangGraph 边界

允许的短图：冻结输入 → 检索 → 生成 → 结构校验 → 引用校验 → 形成建议 → `interrupt` 等教师。普通保存、授权、预算预留、引用门禁、采用、批准、删除和导出门禁都在图外由确定性应用代码执行。

- 每个 run 使用服务端随机 thread ID，保存到当前 task 的 model run；客户端永不提交。
- 使用固定 LangGraph.js 1.4.13 + PostgreSQL checkpointer 1.0.5 的 `PostgresSaver`，schema 固定 `agent`。
- 禁用 `PostgresStore`、跨线程记忆、time-travel 产品入口和任意工具发现。
- 节点恢复会从节点开头执行：检索可重复，模型节点必须先检查已落盘 run/attempt；不把重复付费藏在 replay 中。
- graph state 只保存必要 ID、版本、结构化中间状态和中断载荷；不复制秘密、完整日志或其他任务内容。
- graph/prompt/schema 版本不兼容时，旧 paused run 明确失败并要求重新生成，不用新代码静默解释旧 checkpoint。
- task purge 使用官方 `deleteThread()` 整线程删除；不自行裁剪官方 checkpoint 表。

到达 interrupt 时 job 释放租约并进入教师等待；公开 OperationStatus 仍使用现役 `running`，另以 `phase=waitingForTeacher` 说明。教师决定先由 API 领域事务生效，再只把 decision ID 作为 LangGraph resume 输入重新排队；恢复节点不得重复模型调用。

## 10. 人工门禁

AI 按钮第一次使用显示 provider、发送内容类别、最多调用次数、预算和不包含的外部动作；每次按钮显示本次范围。建议页明确“未采用”。教师采用、否决、修改、接受审计风险和最终签发分别记录真实教师动作；Agent 不能代签，也不能根据自然语言猜测批准。
