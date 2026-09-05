# 项目文档目录

本目录只放需求、决策、设计、验证、发布和运营文档，不放应用源代码。以下结构由 AI 在对应阶段创建；不得提前用猜测填满。

```text
docs/
├─ 00-governance/        # 状态、阶段报告、决定、风险、变更
├─ 01-initiation/        # 问题验证、章程、PRD、案例、技术决策
├─ 02-planning/          # 总计划、规范、安全、测试、数据治理、DoR/DoD
├─ 03-frontend-design/   # 前端设计；获批后完成前端编码
├─ 04-database-design/   # 前端完成后才设计；获批后完成数据库编码
├─ 05-backend-design/    # 数据库完成后才设计；获批后完成后端编码
├─ 06-development/       # 各层开发任务、进度、合成数据和实现决策
├─ 07-quality-security/  # 测试证据、安全审查、发布验收
├─ 08-release/           # 真实数据就绪、GitHub Public、部署、迁移、回滚
└─ 09-operations/        # 监控、事故、备份、维护、退役
```

目录编号表达强制顺序。每个文档都应写状态、版本、更新时间、依据、未知和批准记录。模板字段必须依据事实填写；不适用项应写明理由，不能静默删除。

当前 P03“查找史料”以及原 P04 能力的现役产品边界见 [`03-frontend-design/P03-SOURCE-DISCOVERY-DESIGN.md`](./03-frontend-design/P03-SOURCE-DISCOVERY-DESIGN.md)：教师直接阅读和选择已完成基础自动核验的史料，P04 不再是独立教师页面。旧阶段报告和原型图只保留历史证据，不覆盖该现役说明。

阶段 9 后端设计入口为 [`05-backend-design/STAGE-9-PLAN.md`](./05-backend-design/STAGE-9-PLAN.md)，最终设计与编码就绪证据见 [`05-backend-design/STAGE-9-REPORT.md`](./05-backend-design/STAGE-9-REPORT.md) 和 [`05-backend-design/BACKEND-REVIEW.md`](./05-backend-design/BACKEND-REVIEW.md)。阶段 10 的实现结论、学习卡与当前验证证据分别见 [`06-development/STAGE-10-REPORT.md`](./06-development/STAGE-10-REPORT.md)、[`06-development/LEARNING-CARD-10.md`](./06-development/LEARNING-CARD-10.md) 和 [`06-development/BACKEND-IMPLEMENTATION-VALIDATION.md`](./06-development/BACKEND-IMPLEMENTATION-VALIDATION.md)。阶段 10 获批归档前不得进入前后端集成与总审查。

阶段 11 已获开始与 CP-11-01 授权，当前入口为 [阶段报告](./06-development/STAGE-11-REPORT.md)、[运行说明](./06-development/STAGE-11-LOCAL-RUN.md)、[验证记录](./06-development/STAGE-11-IMPLEMENTATION-VALIDATION.md)、[学习卡](./06-development/LEARNING-CARD-11.md)。CP-11-02 与 [CP-11-03 栏目内 AI](./06-development/STAGE-11-INLINE-AI-PROPOSAL.md) 已批准并实现；阶段 11 本地及 Demo 已确认，最终 96 路径本地归档已获批准；阶段 12 未开始。
