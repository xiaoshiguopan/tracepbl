# 阶段 11 契约补充 CP-11-02

日期：2026-09-05。状态：用户于 2026-09-05 回复“批准，完成后把链接给我，我要预览”，已批准实施。等级：C2，只涉及只读 API 字段。

浏览器集成发现：现役设计允许教师修改风险确认理由，数据库已在不可变 `teacher_decisions.reason` 中保存理由；但审计读取接口仅返回 `resolutionState`，刷新后无法恢复真实理由。用占位文字冒充教师理由不符合现役产品契约。

建议在审计 finding DTO 增加一个 `teacherReason: string | null` 字段：仅对同 workspace、同 task、同 finding 读取最新教师决定理由；没有记录时为 null。前端原样恢复，编辑后追加新的教师决定，不修改历史。过期审计理由不能用于当前签发；阻断和未知项仍不可通过确认绕过。

不增加数据库列或迁移，不改变权限、产品流程、费用、模型、部署或数据范围。涉及 `packages/contracts/src/index.ts`、`packages/database/src/workflow.ts`、`apps/api/src/app.ts`、对应前端 adapter、OpenAPI 与测试，并同步现役数据契约。

验收：确认理由刷新后相同；编辑追加历史；跨任务和已删除读取仍为统一不可用；旧审计决定被拒绝。最早返回阶段 9 API 字段投影；其他 CP-11-01 工作继续。

依据：`docs/02-planning/CHANGE-CONTROL.md` 第 3 节要求公共契约变化先批准。本项不授权 Git 暂存、提交或发布。
