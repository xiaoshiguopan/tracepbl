# 阶段 11 契约补齐提案 CP-11-01

> 日期：2026-09-05
> 状态：用户于 2026-09-05 明确回复“批准 CP-11-01 最小补齐方案”；不是阶段完成报告，也不是归档申请
> 等级：C2；已允许同步设计、契约、迁移、实现和相关验证

## 原因和可复现证据

阶段 11 已获开始授权。Git 基线为 `29d1591`；阶段 9 为 `d688524`，阶段 10 为 `927a90b`。开工工作区只有既有未跟踪 `output/`。

| 冲突 | 批准意图与当前证据 | 不改的后果 |
|---|---|---|
| 问题规模、可选课型 | 现役前端允许单问题和整课 2—4 个子问题，课型选填。`QuestionSetSchema` 要求 1—3 子问题，`TeachingContextSchema` 要求至少一个课型；直接调用 `safeParse`，空子问题和空课型均返回 false。`0001` 的问题 ordinal 两项 CHECK 最大为 3。 | 单问题无法保存；第 4 个子问题无法落库；前端不得偷偷补问题或课型。 |
| 任务恢复和终审 | `TaskSchema` 只有任务摘要；`WorkflowRepository.decide` 要求最新 teacher_confirmed revision ID，现有读取接口没有返回它。操作仅能按已知 ID 查询；审计结果缺少对象定位字段。 | 刷新后不能可靠恢复任务、定位检查结果或提交终审；不能让浏览器猜 UUID 或批准状态。 |
| 来源版本与展示 | 数据库已有 period/context/meaning/interpretation/limitation/rights_basis；source DTO 未投影这些字段。当前 sources 查询只列每个 source 最新版本，可能漏掉任务已绑定的旧版本。 | 页面无法显示既有来源依据；旧引用可能被前端错配到新版。 |
| 导出正文和历史 | `ExportManifestSchema` 只有章节名与引用目录，没有正文。repository 的引用目录读取当前 evidence_citations；`0003` 的快照只保存 sourceVersionIds，没有冻结来源标题和权利展示。 | 无法仅凭服务器批准快照生成文档；旧导出可能随当前任务编辑变化。 |

证据文件：`docs/03-frontend-design/FRONTEND-DEEP-OPTIMIZATION-SPEC.md`、`PAGE-SPECIFICATIONS.md`、`COMPONENT-ARCHITECTURE.md`；`apps/web/src/question-workspace.ts`；`packages/contracts/src/index.ts`；`packages/database/src/sources.ts`、`workflow.ts`；`database/migrations/0001_initial_schema.sql`、`0003_backend_runtime_support.sql`。

## 建议一次批准的最小范围

1. **以现役前端为准补齐问题契约。** 保留单问题 0 子问题、整课 2—4 子问题和可选课型。请求显式区分问题规模；兼容读取既有 1—3 子问题记录，不静默删改旧记录。通过新增 `0004_stage11_contract_alignment.sql` 扩展 ordinal CHECK；不修改 0001、0002、0003。
2. **补齐同 task 的只读恢复字段。** 任务摘要增加最新教师确认/批准 revision ID、最新审计 ID及各分项复核状态；审计增加 subjectKind/subjectId；增加分页 `GET /tasks/{taskId}/operations`，排除内部 purge 信息。所有字段由服务端同一读取事务投影，不接受客户端回写；列表继续执行 workspace、task、非删除门禁。
3. **补齐既有来源字段。** source DTO 增加上述数据库已有的依据与解读字段，未知保持 null；同时返回已选旧版本和可选新版，以 versionId 区分，不自动替换引用，不升级权利或核验状态。
4. **导出只消费冻结内容。** 在新增迁移中更新快照函数，冻结当前选中来源的标题、版本、定位、权利依据及允许输出的内容；manifest 增加经过 Zod 校验的课程/问题/证据/活动/量规/来源正文投影，并从同一不可变快照生成目录。权利受限内容沿用获批的安全替代，只显示允许的元数据/链接。旧快照不覆写；缺少必要冻结内容的旧导出明确不可重新生成，需教师复核后重新签发。

fake provider 接通、同源 localhost Web、SSE 重连、取消/重试、前端 API adapter 属于已经批准的阶段 11 实现范围。若需要在 runtime 增加执行方式展示字段，限于 `disabled|fake|real`，明确本轮为 fake；不改变 provider 型号、预算或真实模型开关。

## 影响与不变边界

- 需求：MUST-001/002/003/004/005/006/007/008/009/010 中对应的课程、问题、来源、证据、设计、评价、审计、终审、导出链；具体 ID 对照在阶段 11 追踪矩阵逐项核对，不以本提案代替验收。
- 最早退回点：阶段 7 数据库设计的 ordinal 和快照投影；阶段 9 API 设计同步修订。阶段 5 现役页面及用户意图保持，前端适配字段待复核。
- 受影响的数据库 CHECK/快照、API/OpenAPI、相关 adapter 和测试批准状态待复核；其余既有证据保留。
- 数据仍仅公开许可/合成 fixtures。workspace/task 授权、不可区分 404、乐观锁、幂等、24 小时删除窗口、不可变历史、教师采用门禁不放宽。
- 无新生产依赖、无新页面、无联网搜索、无真实模型、无秘密读取、无外发、无镜像源变化、无部署、无成本增加。

## 迁移、回滚与验收

- 新迁移只向前扩展 CHECK 和快照函数，不重写历史；需验证从 0003 升级及空库完整迁移。问题规模优先按问题数量派生，不为界面状态新增持久列。
- 新读取字段尽量兼容旧消费者；问题规模请求采用兼容旧请求的可选判别，新增模式要求 0 或 2—4，旧请求维持已有读取能力。完整模式必须校验契约版本，不能自动回退 Demo。
- 若新数据已有第 4 子问题，不能回滚到只支持 3 的旧服务；停用本地入口并前滚修复。禁止通过删问题回滚。旧导出缺字段时失败关闭，不能拼接当前正文。
- 验收覆盖：0/2/3/4 子问题、课型空数组、升级前旧记录、越权/已删除读取、任务刷新恢复、旧来源版本保留、上游修改使审计失效、导出后再编辑不改变旧 manifest、受限正文不会泄漏。
- 替代方案是把前端限制成 1—3 子问题并继续依赖浏览器草稿；会改变已冻结产品且不能证明批准快照一致性，不建议。延期则阶段 11 保持未完成。

## 预期受影响路径

设计：`docs/04-database-design/DATABASE-SCHEMA.md`、`MIGRATION-STRATEGY.md`、`docs/05-backend-design/API-AND-OPENAPI-DESIGN.md`、`docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md`。

实现：`database/migrations/0004_stage11_contract_alignment.sql`、`database/schema/index.ts`、`packages/contracts/src/index.ts`、`packages/database/src/{index,content,sources,workflow}.ts`、`apps/api/src/app.ts`、OpenAPI 生成产物，以及 `apps/web/src/` 对应 data adapter 和既有页面。

验证与记录：相关数据库/API/前端测试、`tests/` 跨层测试、阶段 11 验证/报告/学习卡/追踪矩阵、现役入口和状态文件。最终精确归档路径在阶段完成报告列出；本提案不授权暂存或提交任何路径。

最终批准者：用户；决定：接受以上最小补齐范围。归档仍须另行批准。
