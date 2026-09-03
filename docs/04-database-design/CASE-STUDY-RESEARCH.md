# 阶段 7 数据库案例与官方资料研究

> 文档版本：0.1
> 研究日期：2026-09-03（Asia/Shanghai）
> 状态：阶段 7 已批准归档
> 用途：验证数据库、版本、权限、迁移与轻量 RAG 设计；不授权复制、安装或运行第三方项目

## 1. 研究问题与方法

本研究回答五个问题：PostgreSQL 是否能同时承担领域数据和轻量向量检索；成熟项目怎样保存文档版本与检索来源；本地单用户模式如何保留未来隔离边界；哪些索引和基础设施在当前规模属于过度设计；迁移、删除与恢复应留下什么可复验证据。

仓库数据来自 2026-09-03 的 GitHub API/仓库页面快照。Star 只视为采用度信号，同时核对是否归档、最近推送、Release/Tag、CI、许可证和与本项目的直接相关性。研究没有克隆仓库、执行脚本、安装依赖或连接账号。

## 2. 官方技术依据

| 资料 | 当前依据 | 对 TracePBL 的结论 |
|---|---|---|
| [PostgreSQL 18 UUID functions](https://www.postgresql.org/docs/18/functions-uuid.html) | PostgreSQL 18 原生提供按时间有序的 `uuidv7()` | 对外领域 ID 使用 UUIDv7，不依赖额外扩展生成 UUID |
| [PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | `CHECK` 只适合当前行；跨行规则应使用唯一/外键/事务逻辑 | 45 分钟总和、恰好三个子问题等聚合门禁不伪装成 `CHECK` |
| [PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html) | 默认 Read Committed 不防止所有业务覆盖 | `tasks.lock_version` + 条件更新实现乐观并发 |
| [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) | 无策略默认拒绝，但表所有者和 `BYPASSRLS` 可绕过；复杂策略存在竞态风险 | 当前本地单用户不启用 RLS；仍分离 owner/migrator/app/worker，未来多用户重新设计并强制测试 |
| [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/backup-dump.html) | custom dump 可由 `pg_restore` 选择性恢复；dump 是一致性快照 | 本地备份采用 `pg_dump -Fc`，每次发布前演练恢复 |
| [pgvector](https://github.com/pgvector/pgvector) | v0.8.6；默认精确检索；HNSW/IVFFlat 用召回换速度；普通近似索引的 `vector` 上限为 2,000 维 | `embedding-3` 固定 1024 维；少于 10,000 chunks 先精确检索，不预建 ANN |
| [Drizzle migrations](https://orm.drizzle.team/docs/migrations) | TypeScript schema 可生成 SQL migration，但迁移仍需审查和部署顺序 | Drizzle schema 为结构来源，生成 SQL 必须入库审查；破坏性变更采用 expand/migrate/contract |
| [智谱 Embedding-3](https://docs.bigmodel.cn/cn/guide/models/embedding/embedding-3) | 支持 256/512/1024/2048 维，单条输入和批量请求有限额 | 使用 `embedding-3`、1024 维、cosine；模型变化新建 profile 并重建向量 |
| [Z.AI 模型概览](https://docs.z.ai/guides/overview/overview) | 官方列出 GLM-5.3-Flash | 生成目标采用 GLM-5.3-Flash；国内账户可用性须在后端联调期做无敏感内容冒烟验证 |

## 3. 成熟 GitHub 案例

### 3.1 pgvector/pgvector

- URL：<https://github.com/pgvector/pgvector>
- 快照：22,879 Stars；未归档；默认分支 HEAD `e48241b4dcc0`；最新 tag `v0.8.6`（`8ee86c96f0fd`）；2026-08-20 仍有推送。
- 维护/测试：仓库含 `build.yml`；README 给出 regression/TAP 测试、索引构建进度、过滤和多租户注意事项。
- 许可：PostgreSQL License 风格许可；设计只引用公开接口和行为，不复制实现。
- 借鉴：向量与关系数据同库；先精确后近似；embedding profile 必须记录维度和距离函数；过滤列先建普通索引。
- 不照搬：不因支持 HNSW/IVFFlat 就立即建索引；不按未来多租户假设提前分区或拆表。

### 3.2 supabase/supabase

- URL：<https://github.com/supabase/supabase>
- 快照：108,780 Stars；未归档；HEAD `6738dded80f0`；最新 Release `v1.26.08`（2026-08-07）；2026-09-03 仍有推送。
- 维护/测试：持续发布，仓库包含数据库、认证、存储和文档的多套 CI；公开文档说明 RLS 与 service role 的边界。
- 许可：Apache-2.0 为仓库主许可，部分组件另有各自许可；本项目不复制组件代码。
- 借鉴：迁移可审查、最小数据库角色、RLS 的 default-deny 思路、对象与元数据分离。
- 不照搬：TracePBL 不采用浏览器直连数据库、不引入 Supabase Auth/Storage/BaaS，也不把 service key 放到前端。

### 3.3 open-webui/open-webui

- URL：<https://github.com/open-webui/open-webui>
- 快照：150,787 Stars；未归档；HEAD `2a960a59fe1d`；最新 Release `v0.11.3`（2026-08-31）；2026-09-02 仍有推送。
- 维护/测试：包含前后端、Docker、发布等工作流；pgvector 适配器区分 collection、chunk text、metadata 与 embedding。
- 许可：Open WebUI License 含品牌保留限制，不能视为无条件 BSD；本项目只研究数据模式，不复制界面或代码。
- 借鉴：文档版本—文本块—embedding 的独立生命周期；记录 embedding 模型/维度；检索命中保留 document/chunk 定位。
- 不照搬：九种向量库、多模型聊天平台、加密配置和企业身份均超出当前需求；不引入向量数据库抽象层。

### 3.4 khoj-ai/khoj

- URL：<https://github.com/khoj-ai/khoj>
- 快照：37,032 Stars；未归档；HEAD `ae229ca894c0`；最新 Release `2.0.0-beta.28`（2026-03-26）；2026-08-02 仍有推送。
- 维护/测试：有持续 Release、文档和测试；开发文档明确以 PostgreSQL/pgvector 保存检索数据。
- 许可：AGPL-3.0；不复制其代码，避免把网络分发义务带入本项目。
- 借鉴：个人自托管模式、PostgreSQL 单库 RAG、内容更新后的重新索引与用户范围过滤。
- 不照搬：Python/Django/FastAPI、个人助理记忆、聊天和 Agent 产品模型与 TracePBL 不同。

### 3.5 vercel/chatbot

- URL：<https://github.com/vercel/chatbot>
- 快照：20,904 Stars；未归档；HEAD `c2f8235e1f3e`；2026-07-08 仍有推送；仓库未使用 GitHub Release。
- 维护/测试：含 lint 与 Playwright 工作流；Drizzle schema 使用文档复合键关联版本和建议。
- 许可：Apache-2.0。
- 借鉴：TypeScript + Drizzle 的可审查 schema；历史建议引用明确文档版本，而非可变的“当前文档”。
- 不照搬：聊天消息、Next.js、Neon、Blob 和 Auth.js 不是本项目领域或固定技术路线。

## 4. 研究到设计的映射

| 研究发现 | 本项目决定 | 进入的设计文件 |
|---|---|---|
| 当前规模下精确向量检索具有完整召回 | `<10,000` chunks 不建 ANN；性能证据触发 HNSW | `QUERY-AND-PERFORMANCE.md` |
| 文档、版本、chunk、embedding 生命周期不同 | `sources → source_versions → source_chunks → chunk_embeddings` | `DOMAIN-MODEL.md`、`DATABASE-SCHEMA.md` |
| 历史结果必须引用不可变版本 | task revision、citation、retrieval hit 均保存准确版本关系 | `ERD.md`、`DATABASE-SCHEMA.md` |
| RLS 不能替代应用授权，owner 可绕过 | 当前不开 RLS；角色分离和 workspace 复合约束先行 | `ACCESS-CONTROL.md` |
| 迁移生成不等于迁移安全 | 审查 SQL、空库重放、前向修复、恢复演练 | `MIGRATION-STRATEGY.md` |
| 完整 RAG 平台容易范围膨胀 | 不加入聊天记忆、多向量库、托管知识库、对象存储 | 全部设计 |

## 5. 工具能力记录

- 使用现有 `database-schema-designer` 与 `postgresql-table-design` Skill 约束实体、约束、索引、RLS、迁移和常见陷阱；均为 Codex 用户级已有能力，本轮未安装或修改 Skill。
- 使用只读网页/GitHub API 和本地 `rg`/Git 读取资料；未连接插件账号。
- 未使用推荐插件：当前官方文档、GitHub 和本地仓库已足够，连接 Airtable、云数据库或代码托管插件只会扩大权限。
- 未读取 `C:\Users\10342\Desktop\glm.txt`；设计不需要密钥，真实联调也不得输出密钥。

## 6. 未验证与边界

- Star、HEAD 与 Release 是访问日快照，会随时间变化；进入阶段 8 前无需据此追新版本。
- 尚未使用国内智谱 Key验证 GLM-5.3-Flash 是否对该账户开放；这是后端联调门，不是数据库结构阻断项。
- 未做真实中文史料 embedding、召回率或延迟测试；阶段 8 只用合成/许可明确公开 fixture 建立基线。
- 本研究不构成第三方项目许可意见，也不授权复制其代码。
