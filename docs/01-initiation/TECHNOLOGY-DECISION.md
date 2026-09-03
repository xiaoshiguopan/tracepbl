# 史证工坊技术决策

> 文档版本：0.4
> 决策日期：2026-08-31；模型与数据边界修订：2026-09-03
> 资料访问截止：2026-09-03（Asia/Shanghai）
> 状态：0.4 已批准归档
> 决策范围：阶段 2，只确定覆盖完整产品生命周期的唯一技术栈；不授权安装、编码、购买、部署或提交

## 1. 决策修订与边界

本版吸收了 2026-08-31 的三项用户澄清：

1. 技术底座必须承接完整产品，而不是只满足 v0.1；未来可能加入 RAG、幕后 Agent、账号、分享或学生端，不能因此推倒重来。
2. 当前项目首先是求职作品集；公开体验只需可信、完整的 Demo，不要求后端和数据库长期在线。
3. 公开 Demo 使用 GitHub Pages 免费部署；真实后端和数据库仍要完整设计、实现和测试，以公开代码与可重复证据证明能力。

2026-09-03 用户进一步明确并取代本文件中冲突的旧结论：使用智谱国内 API 的可替换 provider adapter，目标生成模型为 `GLM-5.3-Flash`，向量模型为 `embedding-3` 1024 维 cosine；不启用模型联网搜索、rerank 或 OCR；无 key 时仍使用预生成结果/向量运行。完整本地工程只有一个内部 workspace、只绑定 localhost，任务持续保存到用户明确删除；删除后立即隐藏、24 小时内可撤销，之后彻底清除。下文保留的 2026-08-31 多厂商评分只是历史决策证据，不再是当前模型结论。

因此，本决策区分两个运行面：

- **公开展示面**：GitHub Pages 上的静态 Demo，使用公开/合成材料与预生成 AI 结果，不调用秘密后端，不声称数据已写入云数据库。
- **完整工程面**：同一公开仓库中的真实 API、worker、PostgreSQL、RAG 和 Agent；可在 Windows 本地完整运行，并在 GitHub Actions 中使用临时数据库验证。

未来若项目从作品集转为真实在线服务，完整工程面可以按相同容器、契约和数据模型部署到中国大陆云。该动作需要重新核价、隐私审查、备案和单独授权，不属于本阶段。

## 2. 唯一最终技术栈

史证工坊采用 **TypeScript 模块化单体 + React/Vite 静态展示面 + Hono API/worker + PostgreSQL/pgvector 数据底座 + 可插拔 RAG/Agent**：

- 仓库：单一 GitHub Public monorepo；
- 运行时：Node.js 24.20.0 LTS、npm 11.19.0、TypeScript 6.0.3 strict；
- Web：React 19.2.8 + Vite 8.2.2，静态 SPA；
- 公开部署：GitHub Actions 构建，GitHub Pages 免费托管；
- Demo 数据：版本化 JSON fixtures + 浏览器原生 IndexedDB；页面持续显示“演示模式”；
- API：Hono 4.13.5、`@hono/node-server` 2.1.1、REST/OpenAPI 3.1、SSE；
- 契约：Zod 4.5.4 + `@hono/zod-openapi` 1.6.1；Demo adapter 和真实 API adapter 共享同一契约；
- 数据库：PostgreSQL 18.6 + pgvector 0.8.6；
- 数据访问：Drizzle ORM 0.45.2 + postgres.js 3.4.9；迁移 SQL 可审查、数据可导出；
- 后台任务：同一仓库中的 Node worker + PostgreSQL job table；首期不引入 Redis、Kafka、RabbitMQ、Temporal 或微服务；
- Agent：LangGraph.js 1.4.13 + PostgreSQL checkpointer 1.0.5，只用于需要多步检索、交叉核验、审计和教师中断的幕后流程；
- RAG：结构感知切片 + PostgreSQL/pgvector 精确 cosine 检索，`embedding-3` 固定 1024 维；当前不启用 rerank；
- AI 主模型：可替换的智谱国内 API adapter，目标 `GLM-5.3-Flash`；国内 key 是否支持该型号待后端阶段最小非敏感 smoke test，不得静默降级；
- 材料输入：v0.1 仅 URL 与文本；不摄取 PDF/DOCX，不做视觉/OCR；
- 导出：浏览器使用 docx 9.7.1 与 pdfmake 0.3.11 即时生成；数据库只记 revision 与导出事件，不保存二进制；
- 测试：Vitest 4.1.11、Testing Library 16.3.3、MSW 2.15.0、Playwright 1.62.1、Testcontainers 12.1.0；
- 静态质量：ESLint 10.9.1、typescript-eslint 8.68.0；
- 未来正式部署路径：标准 OCI 容器部署 Hono API/worker，中国大陆 PostgreSQL 与 OSS 同地域；GitHub 继续承担仓库、CI 和前端构建。

这是模块化单体，不是微服务。Web、API 和 worker 可以分进程运行，但共享领域模型、契约、迁移、版本和测试。长期扩展通过启用模块完成，不通过更换主语言或重新设计数据语义完成。

以上 npm 包版本已于 2026-08-31 通过 npm registry 只读查询复核。TypeScript 没有直接选择 registry 最新的 7.0.2：当前 `typescript-eslint` 8.68.0 官方 peer range 为 `>=4.8.4 <6.1.0`，因此锁定双方兼容的 TypeScript 6.0.3；待静态分析工具明确支持 7.x 后再评估。

## 3. 需求提取

| 用户要求 | 来自已批准立项文档的约束 | 技术响应 |
|---|---|---|
| 目标用户 | 中国初高中历史教师；零基础维护者 | 中文优先、低运维、Windows/Codex 可操作 |
| 核心功能 | 问题—史料—主张—活动—量规—审计闭环 | 关系数据、确定性状态机、可回退版本 |
| RAG/Agent | 知识库位于底层；Agent 幕后检索、溯源、交叉核验和审计 | pgvector/全文混合检索；LangGraph 仅编排开放式流程 |
| 教师控制 | 编辑、否决、批准；未知不得通过 | human-in-the-loop checkpoint；领域门禁不可由模型绕过 |
| 当前权限 | v0.1 无账号、无分享；localhost 单用户、一个内部 workspace | 服务层逐资源归属检查；task ID 不授权；当前不启用 RLS |
| 未来权限 | 账号、团队、分享、学生端需变更控制 | 领域层预留 owner/subject，不提前绑定登录供应商 |
| 数据 | 当前只用公开或合成材料；真实数据不得进入公开仓库、日志和截图 | fixtures 仅用公开/合成数据；秘密和个人数据不进 Git |
| 预算 | 每月不超过 ¥200；12 周不超过 ¥600 | 当前公开运行成本为 ¥0；真实模型调用只手动、限额运行 |
| Windows/Codex | 用户为零经验；AI 代办优先 | 单语言、npm workspaces；本地 PostgreSQL 由容器承载 |
| 学习成本 | 每周约 8 小时 | 一个仓库、一个语言、一个主数据库；不引入编排平台集群 |
| 部署维护 | 求职 Demo 优先；未来可能真实上线 | Pages 静态 Demo；完整全栈本地/CI；未来容器化上线 |
| GitHub Public | 最终必须公开 | 源码、迁移、测试、架构和合成 fixtures 全部可审查 |
| 公开 URL | 无开发环境即可打开 | `https://<user>.github.io/tracepbl/`；可选自定义域名 |
| 敏感程度 | 当前只允许 G0/G1/G2；真实个人/学生数据禁止 | Demo 不上传；本地服务最小传输、最小日志，疑似敏感输入拒绝 |
| 退出迁移 | 不被单一 BaaS、模型或向量库锁死 | OpenAPI、PostgreSQL、S3 子集、provider adapters、标准 OCI |

## 4. 展示面与真实工程面

### 4.1 GitHub Pages 展示面

公开访问流程使用预先审核的公开/合成案例：选择材料、查看解析、形成证据卡、构建主张、生成活动与量规、执行审计、编辑并导出。

Demo 必须满足：

- 页面明显标注“作品集演示模式”；
- 不请求 AI Key，不直接调用付费模型；
- 不上传用户文件到服务器；
- fixtures 是版本化、可解释的预生成结果；
- IndexedDB 只保存访客自己浏览器中的编辑进度；可由现有任务菜单删除，不恢复 P11 独立页面；
- Demo 返回值与真实 API 使用同一 Zod/OpenAPI 契约；
- 不通过假网络延迟、伪造数据库状态或虚构在线用户来冒充真实后端。

### 4.2 真实工程面

公开仓库包含可运行的：

- Hono API 与 OpenAPI 文档；
- PostgreSQL schema、迁移和合成 seed；
- URL/文本材料处理、任务队列、删除宽限与彻底清除流程；
- RAG 检索与来源定位；
- AI provider adapter 和成本门禁；
- LangGraph checkpoint、人工中断和恢复；
- 单元、契约、数据库、Agent replay 和浏览器端到端测试。

招聘者可以查看 GitHub Actions 证据，也可以克隆后在自己的环境中运行完整系统。GitHub 仓库公开的是代码和合成数据，不是开发者本机数据库、API Key 或真实用户内容。

## 5. 模块与数据边界

| 模块 | 职责 | 禁止事项 |
|---|---|---|
| `apps/web` | 教师工作台、Demo/真实 API adapter、本地导出 | 不保存密钥；不作最终授权判断 |
| `apps/api` | 校验、本机 workspace 归属、资源授权、限流、作业提交、SSE | 不把 task ID 当授权；不在请求内执行不可恢复的长 Agent |
| `apps/worker` | URL/文本切片、向量化、检索、Agent、审计和重试 | 不自行批准或发布教学包 |
| `packages/domain` | 状态机、证据门禁、版本、成本和删除规则 | 不依赖 React、Hono、LangGraph 或云 SDK |
| `packages/contracts` | Zod/OpenAPI 契约、事件和错误码 | 不产生业务副作用 |
| `packages/ai` | GLM 生成和 embedding adapter；provider 接口可替换 | 不向领域层泄漏厂商对象；不在当前启用搜索/OCR/rerank |
| `packages/retrieval` | 结构感知切片、精确向量检索、来源/许可过滤 | 不把相似度当作史料真实性 |
| PostgreSQL | 关系、向量、job、checkpoint、删除宽限和审计 | 不保存密钥；私有材料不得自动进入公共库 |

从首版开始固定四类数据：

1. **本地任务**：单一内部 workspace 管辖，持续保存；显式删除后立即隐藏，24 小时内可撤销，之后彻底清除。
2. **公共来源目录**：公开材料的元数据、版本、许可、链接和校验状态。
3. **RAG 索引**：版本化切片、向量、检索字段和来源外键。
4. **去内容化运维数据**：请求 ID、状态、耗时、Token、费用和错误分类，不记录完整材料与提示词。

## 6. RAG 与 Agent 的唯一路线

### 6.1 RAG

1. 先登记来源、版本、许可和可用状态；
2. 按标题、段落、页码和可引用结构切片，不按固定字符数盲切；
3. `embedding-3` 以固定 profile 生成 1024 维向量，并记录模型、维度、距离与 chunker 版本；
4. 当前以小规模精确 cosine 检索为主；关键词只作可选候选召回，不预建无证据索引；
5. 先按 task 可选来源、许可、来源等级和有效版本过滤；当前不启用 rerank；
6. 每个结果携带来源 ID、版本、页码/段落与原文范围；
7. 引用文本与来源定位不匹配时，确定性校验阻断输出。

不采用 Pinecone、Milvus、Elasticsearch 或厂商托管知识库作为核心数据层。项目规模不足以证明第二套数据系统的维护成本；PostgreSQL + pgvector 可同时承载关系、全文和向量，并能完整导出。

### 6.2 Agent

LangGraph.js 只用于史料候选发现、出处补全、多源交叉核验、证据缺口检查和最终审计。普通 CRUD、权限、状态回退、引用一致性和删除规则由确定性领域代码实现。

每个 Agent tool 必须有独立输入契约、只读/写入权限、超时、重试和费用上限。教师批准节点使用 PostgreSQL checkpoint 暂停；恢复时不得重复已完成的付费或外部副作用。

## 7. 完整架构评分

评分 1–5，满分 100；公式为 `Σ(权重 × 评分 ÷ 5)`。

| 维度 | 权重 | 重点 |
|---|---:|---|
| 完整需求适配 | 20% | 当前教师闭环及未来 RAG、Agent、异步任务和身份扩展 |
| 演进时避免重写 | 16% | 能否启用模块而不换语言、数据模型或 API |
| 安全默认与数据治理 | 15% | 权限、删除、秘密、人工批准、来源审计 |
| 零基础可维护性 | 12% | 语言和服务数量、排障、备份、认知负担 |
| 免费或低成本 | 10% | 公开 Demo 成本、闲置成本、未来按量成本 |
| Windows 本地开发 | 7% | 官方工具、容器和 Codex 适配 |
| 测试和调试 | 7% | 领域、API、数据库、Agent replay、E2E |
| GitHub Public/公开部署 | 5% | 仓库审查、免费 CI 和 Pages URL |
| 社区和官方文档 | 5% | LTS、维护状态和案例 |
| 锁定与迁移成本 | 3% | 标准协议、导出和替换供应商成本 |
| **合计** | **100%** |  |

| 候选完整架构 | 需求 20 | 演进 16 | 安全 15 | 维护 12 | 成本 10 | Windows 7 | 测试 7 | GitHub 5 | 文档 5 | 迁移 3 | 总分 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **A. React/Vite + Hono + PostgreSQL/pgvector + LangGraph.js** | 5.0 | 4.8 | 4.7 | 4.4 | 4.8 | 5.0 | 4.8 | 5.0 | 4.6 | 4.7 | **95.8** |
| B. Next.js + NestJS + PostgreSQL/pgvector + BullMQ | 4.7 | 4.6 | 4.7 | 3.1 | 3.8 | 4.2 | 4.6 | 4.6 | 5.0 | 4.2 | **87.1** |
| C. React + FastAPI/Python + PostgreSQL/pgvector + LangGraph Python | 4.8 | 4.8 | 4.7 | 2.6 | 4.3 | 3.0 | 4.6 | 5.0 | 5.0 | 4.7 | **87.0** |
| D. React + Supabase Auth/DB/Storage/Functions/Vector | 4.4 | 4.0 | 4.1 | 4.2 | 4.6 | 4.5 | 4.2 | 5.0 | 4.7 | 2.5 | **85.4** |

淘汰理由：

- **B**：NestJS 与 BullMQ 带来更多框架、Redis 和部署服务；Next.js 的服务端价值在 Pages 静态部署中无法使用。
- **C**：Agent/RAG 生态成熟，但 TypeScript + Python 双语言、两套契约和 Windows 环境增加零基础维护；项目不依赖 Python 科学计算。
- **D**：上手快，但身份、存储、函数和数据库策略集中绑定一家 BaaS；中国大陆正式部署、长任务与退出迁移不如标准 PostgreSQL/OCI 清晰。
- **A**：一个语言覆盖浏览器、API、worker 和 Agent；Pages 展示最直接；PostgreSQL 统一关系、全文、向量和 checkpoint；完整工程仍可迁移到任意 Node/OCI 主机。

## 8. AI 公开资料选型

本项目按用户决定不做厂商 API 横评。以下评分只依据截至 2026-08-31 的官方公开能力、接口、价格和维护信息，**不是史料任务实测结果**。

| 维度 | 权重 | 千问/百炼 | DeepSeek | 豆包/方舟 | 智谱 GLM |
|---|---:|---:|---:|---:|---:|
| 中文史料、长文、多模态、Agent 综合适配 | 30% | 4.8 | 4.5 | 4.5 | 4.3 |
| 生成/OCR/embedding/rerank 完整度 | 20% | 5.0 | 2.8 | 4.6 | 4.4 |
| 中国大陆地域与服务可用性 | 15% | 5.0 | 4.8 | 5.0 | 4.8 |
| 公开价格与低量使用 | 10% | 4.2 | 5.0 | 4.7 | 4.6 |
| 结构化输出与工具调用 | 10% | 4.8 | 4.7 | 4.7 | 4.7 |
| 官方文档与维护可见性 | 10% | 4.8 | 4.2 | 4.4 | 4.1 |
| 标准接口与迁移 | 5% | 4.2 | 4.8 | 3.5 | 4.0 |
| **加权总分** | **100%** | **95.6** | **85.2** | **91.5** | **88.6** |

**历史结论（已于 2026-09-03 被本文件第 1 节的 GLM 决定取代）：阿里云百炼北京地域的 Qwen 模型族。**

选择依据：

- `qwen3.8-max` 同时支持文本、视觉、长上下文和 Function Calling，减少史料图片与文本分析之间的供应商切换；
- `qwen-vl-ocr` 针对文档、表格、试卷和手写内容提取；
- `text-embedding-v4`、`qwen3-rerank` 与多模态 embedding/rerank 形成完整 RAG 路径；
- 北京地域更符合未来面向中国用户的部署方向；
- Responses/OpenAI 兼容接口可以放在 provider adapter 后，降低更换主模型的改动范围。

未选择：

- **DeepSeek**：主生成、价格和标准接口有竞争力，但视觉型号当前带实验标记，且缺少同一官方产品内完整的 embedding/rerank 组合；
- **豆包**：国内运行与产品线完整，得分第二，但迁移边界和厂商平台耦合略高；
- **GLM**：Agent/工具能力完善，但官方型号更替提示增加了长期固定版本的维护风险。

Demo 不实时调用任何模型。完整本地工程无 GLM key 时使用预生成结果/向量；有 key 时真实调用仍需服务端最小传输、限额和显式失败。模型效果在产品验证阶段由教师反馈校验。

## 9. 安全、成本和锁定

### 9.1 安全默认

- Pages 构建不注入任何 API Key、数据库密码或私密 URL；
- `.env.example` 只列变量名，真实 `.env*`、数据库文件、上传目录和备份必须被 Git 排除；
- 公开 fixtures 只含公开许可或合成材料；
- GitHub Actions 默认只使用 fake AI，不在公开 PR 中触发付费模型；
- 真实 AI 调用只能由仓库所有者手动触发，并设置请求数、Token 与费用上限；
- PostgreSQL 本地任务、公共目录、RAG 派生数据、checkpoint 和运维数据分区；
- 当前不持久化上传/导出对象；任务彻底删除清理关系、私有切片/向量、job、checkpoint 与普通恢复副本；
- Agent tool 最小权限；分享、消息、发布和任何外部写入继续需要新授权。

### 9.2 成本

当前作品集运行面：

| 项目 | 预计持续成本 |
|---|---:|
| GitHub Public 仓库 | ¥0 |
| GitHub Pages | ¥0 |
| 公共仓库标准 GitHub Actions runner | ¥0 |
| 本地 API/PostgreSQL/worker | ¥0 云费用 |
| Demo 自定义域名 | 可选；不购买则 ¥0 |
| AI | Demo 不实时调用；预生成时按量且需单独批准 |

因此，当前公开 Demo 的必要持续基础设施成本为 **¥0**。GitHub 的免费承诺不包括大型 runner、超额存储、模型、数据库或长期服务器。

未来真实上线时，计算、PostgreSQL、对象存储、域名、备案和模型调用都需重新询价；不得把促销或免费试用当作长期成本。若最低可行方案超过章程上限，保持静态 Demo，不通过浏览器暴露密钥来制造“免费在线 AI”。

### 9.3 锁定与退出

- Web 是静态 HTML/CSS/JS，可迁任意静态主机；
- Hono 基于 Web Request/Response，领域层不依赖运行平台；
- API/worker 可构建标准 OCI 镜像；
- PostgreSQL 可用 `pg_dump`、SQL、CSV/JSON 导出；向量可由原文重建；
- 当前无 BlobStore 运行依赖；若未来批准文件摄取，再以独立设计决定对象抽象；
- 生成和 embedding 经 provider adapter；当前不启用 OCR/rerank；
- 模型别名、实际返回版本、提示模板和费用必须进入运行记录；
- LangGraph 只保存可版本化的内部 state，领域真相不进入厂商 Agent 平台。

## 10. 开发、测试和部署路径（只规划，不执行）

### 10.1 Windows 本地开发

- PowerShell + Node/npm；npm workspaces 管理 `apps/*` 与 `packages/*`；
- 不引入 Turborepo/Nx；先使用 npm scripts；
- Docker Desktop 仅承载 PostgreSQL/pgvector 与集成测试，安装前单独确认系统条件；
- 默认使用 fake/pre-generated AI；真实 GLM 调用只在后端阶段显式开启、使用非敏感最小输入并记录去内容化用量。

### 10.2 验证证据

1. 领域状态机、证据门禁、引用一致性、删除宽限和幂等单元测试；
2. React 键盘、焦点、窄屏、200% 缩放和教师批准交互；
3. Demo adapter 与真实 API adapter 的契约一致性；
4. Hono OpenAPI、权限、限流与错误恢复；
5. GitHub Actions 临时 PostgreSQL 中的迁移、隔离、级联删除和 pgvector 检索；
6. LangGraph interrupt、checkpoint resume 和失败重放；
7. Playwright 覆盖公开 Demo 全闭环和本地完整全栈；
8. README、架构图、ERD、OpenAPI 和测试结果共同证明后端/数据库能力；
9. CI 不调用付费模型，不上传真实材料。

### 10.3 当前公开部署

1. Pull Request 执行 lint、类型检查、测试和构建；
2. `main` 构建 `apps/web/dist`；
3. GitHub Actions 将静态 artifact 部署到 GitHub Pages；
4. 页面启用 Demo adapter，API 基址为空，不存在秘密后端；
5. 发布前从全新浏览器验证 URL、刷新路由、演示数据重置、无密钥和无第三方付费请求。

### 10.4 未来真实部署

当且仅当项目转为真实服务并获得新批准：API/worker 构建 OCI 镜像；重新选择 PostgreSQL 与模型服务地域；办理所需备案；配置认证、RLS、备份、限流、预算告警、删除任务和隐私说明。React/Vite 前端、OpenAPI、领域代码和数据库迁移是否可保持兼容必须以届时评审为准。

## 11. 重新评估条件

只有发生以下事件才允许重新选栈：

1. GitHub Pages 在求职目标网络中持续不可访问，公开体验目标失败；
2. 项目从作品集变为真实运营服务，引入账号、学生、团队分享或真实个人数据；
3. PostgreSQL + pgvector 经真实规模的质量和 `EXPLAIN` 证据证明不能满足检索；
4. LangGraph.js 无法满足已批准 Agent 的持久化、人工中断或工具控制，替代方案完整评分领先至少 15 分；
5. GLM 在最小 smoke test 或教师验证中不可用，或出现不可接受的引用、中文史料、结构化输出、数据政策/版本问题；
6. 关键依赖进入 EOL、出现无法修复的安全问题或 Windows 工具链不再受支持；
7. 中国大陆备案、数据处理或模型政策发生实质变化。

重新评估必须更新同一套评分、成本、数据流、迁移与回退证据，不能因为出现热门框架而换栈。

## 12. 优秀案例与边界

| 案例 | 可借鉴 | 不能照搬 |
|---|---|---|
| [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) | TypeScript Web、Agent 后台编排、公开测试 | 多 Agent/PPT 规模超出当前需求；Agent 数量不应成为 UI |
| [STORM](https://github.com/stanford-oval/storm) | 检索—规划—引用链可观察 | 自动写作不能替代教师批准；Python 架构不直接复制 |
| [Zotero](https://github.com/zotero/zotero) | 来源、版本、附件、笔记和引用分离 | 桌面同步和多年数据模型过重；代码许可需独立遵守 |
| [Tropy](https://github.com/tropy/tropy) | 史料原件与描述元数据分离 | 桌面产品不能替代 Pages 体验；代码不复制 |
| [LearnHouse](https://github.com/learnhouse/learnhouse) | 学习产品公开 E2E 和模块边界 | LMS、账户和协作范围不提前进入首版 |

## 13. 来源登记

以下资料访问日期均为 2026-08-31。

| 官方来源 | 支持的判断 | 不能据此推断 |
|---|---|---|
| [GitHub Pages 是什么](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) | Public + Free 可用；Pages 是静态托管 | 能运行 Node、数据库或保密 API |
| [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) | Actions 部署静态 artifact | runner 是 7×24 小时服务器 |
| [GitHub Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | 公共仓库标准 runner 免费；大型 runner 不免费 | 免费额度可被无成本滥用 |
| [Vite 静态部署](https://vite.dev/guide/static-deploy) 与 [Vite 8](https://vite.dev/guide/) | GitHub Pages 官方部署路径、静态构建和 Node 要求 | 自动解决状态、权限和路由设计 |
| [React 版本](https://react.dev/versions) | 当前稳定 19.2 | 永久免升级 |
| [Node v24.20.0](https://nodejs.org/en/download/archive/v24.20.0) | 当前 LTS、Windows 包与 npm 版本 | 后续小版本不需重查 |
| [npm registry](https://www.npmjs.com/) | 本表 npm 包的当前版本及 peer dependency 快照 | 最新版本之间必然兼容；兼容性仍需按 peer range 和构建验证 |
| [Hono](https://hono.dev/docs) 与 [Node adapter](https://hono.dev/docs/getting-started/nodejs) | Web Standards、多运行时与 Node 路径 | 所有运行时行为完全相同 |
| [PostgreSQL 版本政策](https://www.postgresql.org/support/versioning/) | 18.6 当前受支持、主版本支持周期 | 所有托管商同步提供相同小版本 |
| [pgvector](https://github.com/pgvector/pgvector) 与 [CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md) | PostgreSQL 18、Windows/Docker、向量索引 | 相似度等于史料可靠性 |
| [LangGraph.js](https://docs.langchain.com/oss/javascript/langgraph/overview)、[持久化](https://langchain-ai.github.io/langgraphjs/how-tos/cross-thread-persistence-functional/) 与 [interrupt](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/breakpoints/) | checkpoint、恢复和人工中断 | 所有业务逻辑都应做成 Agent |
| [百炼地域](https://help.aliyun.com/zh/model-studio/regions/)、[视觉理解](https://help.aliyun.com/zh/model-studio/vision-model/) 与 [Function Calling](https://help.aliyun.com/zh/model-studio/qwen-function-calling) | 北京地域、Qwen3.8-Max、视觉/长上下文/工具能力 | 对史证工坊的实际质量已经验证 |
| [百炼向量与重排序](https://help.aliyun.com/zh/model-studio/embedding-rerank-model) 与 [价格](https://help.aliyun.com/zh/model-studio/model-pricing) | embedding/rerank 能力、限制与按量价格 | 托管知识库比自有 PostgreSQL 更可迁移 |
| [DeepSeek 模型与价格](https://api-docs.deepseek.com/quick_start/pricing/) | 1M 上下文、JSON、工具调用、价格、实验视觉型号 | 历史教学任务效果必然优于或劣于 Qwen |
| [火山方舟](https://www.volcengine.com/docs/82379/) | 豆包、视觉、向量、Function Calling、知识库等产品面 | 厂商平台组件必须全部采用 |
| [智谱/Z.AI 模型概览](https://docs.z.ai/guides/overview/overview)、[API 说明](https://docs.z.ai/api-reference/introduction) 与 [embedding-3](https://docs.bigmodel.cn/cn/guide/models/embedding/embedding-3) | `GLM-5.3-Flash` 在官方型号列表；embedding 可选维度含 1024；API 采用 key 鉴权 | 国内 key 已实测可调用目标生成型号，或模型质量已验证 |
| [OSS S3 兼容](https://help.aliyun.com/zh/oss/developer-reference/compatibility-with-amazon-s3) | S3 API 子集与差异 | OSS 完全等同 AWS S3 或免费 |
| 上述五个开源案例 | 项目结构、维护状态和许可 | 可以直接复制范围、代码或产品承诺 |

## 14. 学习卡

### 静态 Demo 是否等于只有前端

不是。静态 Demo 是公开展示方式；真实后端、数据库和测试仍在仓库中。招聘者通过源码、迁移、OpenAPI、ERD、CI 数据库测试和本地运行验证工程能力，而不是通过一台长期付费服务器验证。

### 为什么 Demo 和真实 API 必须共享契约

如果页面直接散落假数据，将来接后端时容易重写。统一契约让 Demo adapter 和 API adapter 返回相同结构；切换运行模式不改变页面和领域规则。

### 为什么当前改为 GLM

这是用户基于已有国内 GLM key 做出的明确选择，不是 API 横评冠军结论。provider adapter 保持可替换；数据库只固定可追溯的 provider/model/profile 字段。`embedding-3` 采用 1024 维避开 pgvector `vector` ANN 的 2000 维上限，并与当前轻量规模匹配。目标生成型号是否能被国内 key 调用仍是后端验证项。

### GitHub 免费了什么

免费的是公开仓库、标准 CI 和静态网站。它不免费提供持续 API、数据库、模型 Token 或秘密管理运行时。当前方案通过真实代码和 CI 证明后端，而不是把密钥放进浏览器冒充在线 AI。

## 15. 阶段 2 验收

- [x] 阶段 1 已全部批准并归档后才开始技术选型；
- [x] 技术底座覆盖完整产品，而不以 v0.1 为永久上限；
- [x] 形成唯一、内部兼容的前端、API、领域、数据库、RAG、Agent、文件、测试和部署组合；
- [x] 当前公开体验唯一采用 GitHub Pages 静态 Demo；
- [x] 后端和数据库完整保留在公开仓库、本地与 CI，不伪装成线上服务；
- [x] 权重合计 100%，评估四套完整架构；
- [x] 2026-08-31 完成四候选公开资料评估；2026-09-03 用户明确改选 GLM，且保留“未做项目 API 实测”的真实边界；
- [x] 记录精确版本、来源、访问日期、适用性、不可照搬处、成本、安全和迁移风险；
- [x] 未安装依赖、未生成脚手架、未创建数据库、未写业务代码、未购买或部署；
- [x] 用户已于 2026-08-31 明确回复“批准归档”，只授权本地 Git 归档。
