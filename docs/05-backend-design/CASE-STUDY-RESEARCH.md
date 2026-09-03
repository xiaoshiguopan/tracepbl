# 阶段 9 官方资料与成熟案例研究

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档
> 方法：优先官方文档、官方源码和活跃成熟仓库；第三方案例只验证模式，不换栈、不复制代码

## 1. 官方资料结论

| 主题 | 一手来源 | 设计结论 |
|---|---|---|
| Hono/Node | [Hono](https://github.com/honojs/hono)、[Node adapter](https://github.com/honojs/node-server) | 保留批准版本；Web Request/Response 只在适配层出现，领域层不依赖 Hono |
| SSE | [Hono streaming](https://hono.dev/docs/helpers/streaming) | 使用 `streamSSE` 的 event/id/retry/abort；只发送去内容化状态 |
| OpenAPI | [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)、[Zod JSON Schema](https://zod.dev/json-schema) | Zod 是运行时契约源；已知成功和失败响应都进入 OpenAPI；不使用 Zod 无法可靠表示的转换生成公共 schema |
| Hono 校验风险 | [缺少 Content-Type 时校验绕过 #891](https://github.com/honojs/middleware/issues/891)、[SSE 类型兼容 #735](https://github.com/honojs/middleware/issues/735) | 所有 JSON 写请求额外强制 Content-Type；SSE 在 OpenAPI 中单独描述，不强行套普通 JSON handler |
| PostgreSQL queue | [SELECT / SKIP LOCKED](https://www.postgresql.org/docs/18/sql-select.html)、[LISTEN](https://www.postgresql.org/docs/18/sql-listen.html)、[NOTIFY](https://www.postgresql.org/docs/18/sql-notify.html) | `SKIP LOCKED` 只用于队列认领；表是事实源，NOTIFY 只是提交后的唤醒信号，轮询兜底 |
| LangGraph 持久化 | [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) | checkpoint 按 super-step 保存；interrupt 恢复可能重跑当前节点，节点必须幂等且付费副作用受应用控制 |
| JS PostgresSaver | [官方 README](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/README.md)、[源码](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/src/index.ts) | 使用独立 `agent` schema、受控 `.setup()`；`deleteThread()` 可整线程删除；不自行猜官方表结构 |
| Checkpoint 风险 | [namespace 搜索问题 #2721](https://github.com/langchain-ai/langgraphjs/issues/2721)、[prune 风险 #8531](https://github.com/langchain-ai/langgraph/issues/8531) | 禁止用 `PostgresStore` 做权限/租户/RAG；只做短线程并整线程删除，不做 keep-latest 裁剪 |
| embedding | [智谱 embedding-3](https://docs.bigmodel.cn/cn/guide/models/embedding/embedding-3)、[文本嵌入 API](https://docs.bigmodel.cn/api-reference/模型-api/文本嵌入) | 固定 1024 维 cosine；每项输入不超过 3072 tokens，每批不超过 64 |
| GLM 输出 | [对话补全](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)、[结构化输出](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)、[错误码](https://docs.bigmodel.cn/cn/api/api-code) | JSON 模式不代替 Zod；转换双层错误码；有限重试，不把流式错误误判为成功 |
| GLM-5.3-Flash | [官方连接说明](https://zcode.z.ai/cn/docs/configuration)、[官方发布说明](https://autoclaw.z.ai/blog/model/glm-5.3-flash/) | 目标型号已公开，但国内通用 API 权限和按量价格未完成项目 smoke；缺价格档案时真实调用 fail closed |
| URL/SSRF | [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) | 每次跳转重验协议、端口、DNS A/AAAA 和最终连接目标；阻止私网、loopback、链路本地和元数据地址 |
| Prompt injection | [OWASP LLM Prompt Injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | 外部正文始终是数据；无高风险工具；输入隔离、结构验证、最小权限和教师确认共同防御 |
| 容器本地边界 | [Compose ports](https://docs.docker.com/reference/compose-file/services/#ports)、[startup order](https://docs.docker.com/compose/how-tos/startup-order/) | 端口显式绑定 `127.0.0.1`；依赖以健康状态而非“进程已启动”判断 |

## 2. 成熟 GitHub 案例快照

快照时间均为 2026-09-03；Star 是研究当时读数，不是质量保证。commit 为默认分支短 SHA。GitHub API 显示这些默认分支最近推送均在 2026-08-02 至 2026-09-03 之间，作为本次活跃维护证据；它不替代安全审计。

| 仓库 | Star | commit | 许可快照 | 适用层 | 借鉴 | 不照搬 |
|---|---:|---|---|---|---|---|
| [honojs/hono](https://github.com/honojs/hono) | 32,072 | `e2740d5a1bd0` | MIT | API | Web 标准路由、中间件组合、SSE | 不升级批准版本，不把业务规则写进 handler |
| [honojs/middleware](https://github.com/honojs/middleware) | 980 | `b125de5baec9` | GitHub API 未返回 SPDX，实施前复核 | 契约/API | Zod/OpenAPI 集成和已知边界 | 不假设省略 Content-Type 仍会校验 |
| [honojs/node-server](https://github.com/honojs/node-server) | 674 | `64dc09e0c37e` | MIT | 本地运行 | 标准 Node 适配 | 不引入 Edge/Serverless 路径 |
| [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) | 3,249 | `ac72c3d270bc` | MIT | Agent | checkpoint、interrupt、恢复和整线程清理 | 不采用 Agent Server、跨线程 Store 或长期记忆 |
| [graphile/worker](https://github.com/graphile/worker) | 2,384 | `cea9d60e0341` | MIT | Worker | PostgreSQL 队列、重试和故障恢复思路 | 不新增该依赖，不替换现有 `ops.jobs` |
| [timgit/pg-boss](https://github.com/timgit/pg-boss) | 3,923 | `20fdc8aeed2f` | MIT | Worker | `SKIP LOCKED`、退避、单例/幂等经验 | 不宣称 exactly-once execution，不新增队列框架 |
| [pgvector/pgvector](https://github.com/pgvector/pgvector) | 22,882 | `e48241b4dcc0` | GitHub API 为 NOASSERTION，仓库许可证另复核 | RAG | 精确 cosine 与过滤 | 小数据阶段不建 ANN，不引入第二向量库 |
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | 150,797 | `2a960a59fe1d` | GitHub API 为 NOASSERTION，仓库许可证另复核 | RAG/引用 | RAG 结果应带 source/url/chunk/score | 不复制大平台、账号、文件摄取或模型管理架构 |
| [khoj-ai/khoj](https://github.com/khoj-ai/khoj) | 37,036 | `ae229ca894c0` | AGPL-3.0 | RAG | chunk/embed/search 的完整链路案例 | 不复制 AGPL 代码，不引入个人助理、同步或联网搜索 |

## 3. 对项目设计的修订证据

- 当前 28 表足以承载领域真相，但可靠租约、取消、SSE 回放和并发预算预留需要阶段 10 新增向前 migration。
- `@hono/zod-openapi` 的公开边界使“Content-Type 中间件 + 契约测试”成为安全硬门，而非编码偏好。
- LangGraph checkpoint 可能增长且裁剪仍有恢复风险，因此采用短工作流、整线程删除和 graph/prompt 版本记录。
- GLM-5.3-Flash 发布极新，真实可用性、返回型号和价格不能从型号名称推断；无已确认价格档案时真实调用关闭。
- 案例只验证模式，没有安装、克隆或复制第三方实现，也没有改变批准版本。

## 4. 工具能力记录

- 使用已存在的 `api-design-principles`：约束资源命名、HTTP 语义、版本和一致错误；未安装新 Skill。
- 使用已存在的 `nodejs-backend-patterns`：复核分层、输入校验、连接池、健康检查和优雅停机；未引入其示例依赖。
- 使用已存在的 `openapi-spec-generation`：复核 OpenAPI 3.1、可复用 schema、错误响应和契约验证；本阶段没有生成 OpenAPI 文件。
- 未连接插件账号，未读取秘密，未执行第三方脚本。
