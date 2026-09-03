# 阶段 7 数据库设计报告

> 日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档；随本次本地提交归档
> 范围：数据库设计与必要的现役上游契约同步；不含实现

## 1. 阶段结果

阶段 7 已把用户确认的本地作品集形态转换为可实施的 PostgreSQL 18 + pgvector 设计：GitHub Pages 继续使用浏览器 IndexedDB 与预生成结果；完整工程在 localhost 使用一个内部 workspace 的 PostgreSQL，持久保存到用户明确删除；显式删除立即隐藏、24 小时可撤销、之后彻底清除。

设计覆盖领域实体、关系与基数、来源和任务版本、约束与索引、事务与乐观并发、租户/权限隔离与 RLS 取舍、审计追踪、删除/保留、备份恢复、pgvector 边界、迁移/回滚、测试与风险。没有从前端页面机械映射表。

## 2. 已确认的关键决定

- PostgreSQL 18 + pgvector 是唯一数据底座；Drizzle 只负责 schema/迁移表达，不取代数据库约束。
- 当前完整模式为 localhost 单用户、一个内部 workspace；无账户、无分享、无 RLS。未来出现第二用户或远程访问即重新设计。
- 公共版本化来源目录可跨同 workspace task 选择；私有 URL/文本只属于创建它的 task。
- 当前可编辑聚合与不可变 milestone revision 并存；写入采用 `lock_version` 乐观锁。
- GLM provider adapter 可替换；生成目标 `GLM-5.3-Flash`，embedding 为 `embedding-3`、1024 维、cosine。
- 无 API key 时完整工程仍用预生成结果/向量运行；Pages 永不调用模型。
- 不启用 GLM 联网搜索，不摄取 PDF/DOCX/OCR，不保存导出文件，不处理真实个人/学生/敏感数据。
- RAG 只辅助候选发现；确切来源版本、chunk locator、模型和 prompt template 形成追溯链。

## 3. 研究与评审

研究复核了 PostgreSQL 18 UUIDv7、约束、事务隔离、RLS、`pg_dump`，pgvector 0.8.6 维度/精确与近似检索，以及智谱官方模型/API/embedding 资料；并审阅 pgvector、Supabase、Open WebUI、Khoj、Vercel AI Chatbot 五个成熟 GitHub 仓库。案例只用于验证设计，没有克隆、复制代码或安装依赖。

设计后评审发现并关闭两个 P0 与五个 P1：旧 Qwen 决策冲突、旧 24 小时空闲 TTL、私有来源跨 task 防护、2048 维与 ANN 上限、过早 ANN、导出二进制生命周期，以及复合 FK/retrieval hit 作用域可实现性（相邻结构问题合并为一项）。保留两个带触发条件的 P2：未来多用户/RLS 重设计，以及国内 key 对目标生成型号的后端 smoke test。

## 4. 本阶段文档

新增：

- `docs/04-database-design/CASE-STUDY-RESEARCH.md`
- `docs/04-database-design/DOMAIN-MODEL.md`
- `docs/04-database-design/DATABASE-SCHEMA.md`
- `docs/04-database-design/ERD.md`
- `docs/04-database-design/ACCESS-CONTROL.md`
- `docs/04-database-design/MIGRATION-STRATEGY.md`
- `docs/04-database-design/QUERY-AND-PERFORMANCE.md`
- `docs/04-database-design/DATABASE-TEST-PLAN.md`
- `docs/04-database-design/DATABASE-REVIEW.md`
- `docs/04-database-design/LEARNING-CARD.md`
- `docs/04-database-design/STAGE-7-REPORT.md`

同步现役契约（最终精确清单以归档前 `git diff --name-only` 为准）：

- `AGENTS.md`
- `PROJECT-HANDBOOK.md`
- `docs/00-governance/PROJECT-STATE.md`
- `docs/01-initiation/PRD.md`
- `docs/01-initiation/TECHNOLOGY-DECISION.md`
- `docs/02-planning/MASTER-PLAN.md`
- `docs/02-planning/CODE-ARCHITECTURE-RULES.md`
- `docs/02-planning/SECURITY-BASELINE.md`
- `docs/02-planning/TEST-STRATEGY.md`
- `docs/02-planning/DATA-GOVERNANCE.md`
- `docs/03-frontend-design/INFORMATION-ARCHITECTURE.md`
- `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
- `docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md`

历史阶段评审、报告和验证记录保持原样，作为当时决策证据，不回写成今天的结论。

## 5. 明确未做

- 未读取 `C:\Users\10342\Desktop\glm.txt`，未输出、验证或存储其中的秘密。
- 未连接真实 PostgreSQL，未创建 database/schema/table/index。
- 未编写 SQL、Drizzle schema、迁移、seed、API、worker、RAG、Agent 或真实模型调用。
- 未安装或升级 Skill、插件、npm、Docker 或数据库依赖。
- 未使用真实个人、教师或学生数据；未接入生产数据库。
- 未执行 `git add`、commit、tag、push、部署、域名或外发操作。

## 6. 阶段门禁

用户已明确回复“批准归档”，允许将本报告所列 24 个文档做一次本地 Git 提交。该批准不授权 push、tag、部署或阶段 8。归档完成后，仍需用户明确开始阶段 8，才可实现迁移和数据库测试；阶段 9/10 的 API、业务后端与真实 GLM 调用继续禁止。
