# 阶段 6.10 报告：P08“设计检查”前端编码

> 日期：2026-09-02
> 状态：等待用户确认归档
> 需求：MUST-008；NFR-002—010、012
> 范围：仅 P08、P07 相邻导航和已确认的后续流程规划同步；不含 P09—P12、依赖、数据库或后端

## 1. 授权与边界

- P07 已由本地提交 `f796989` 归档。
- 用户认可“异常优先的审校长卷 + 检查校样”方案，确认桌面效果图后明确授权编码。
- 用户确认最终确认和导出放在一个页面；本轮只把现役规划和 8 步导航改为该结论，没有提前实现合并页。
- 没有实现真实 AI/RAG/联网检查、提示词工程、模型微调、数据库、后端 API、真实学生/个人数据、音频或新增依赖。

## 2. 完成结果

1. 新增 `/tasks/:taskId/audit`；P07 保存并确认后直接进入，P08 可清洁返回 P01—P07。
2. 页面直接展示 18 项确定性检查结果，不设置机械的“运行审计”前置动作；16 项通过默认收起，只把 1 项教师确认和 1 项建议放在审校长卷中。
3. 检查校样显示总数、阻断、待确认、建议、通过和未知；阻断、未知、失败、超时与离线均不能完成或假绿。
4. 首选处理一键生成可编辑教师确认理由；10—500 字校验失败时给出准确动作并聚焦字段。
5. IndexedDB 新增版本化 P08 store；上游变化以六类快照精确标记失效范围，不静默覆盖未受影响处理。
6. 开发状态覆盖正常、加载、空、缺上游、校验失败、系统失败、不可用、超时、离线、阻断、失效和成功。
7. 主流程合并为 8 步：`评价量规 → 设计检查 → 最终确认与导出`；原 P10 不再是独立页面、路由或状态容器。
8. 页面持续声明前端状态只改善体验，不代表安全授权；fixture 不冒充实时 AI、外部来源核验或正式审计。

## 3. 验证结论

完整浏览器与恢复证据见 `P08-IMPLEMENTATION-VALIDATION.md`。阶段收尾时 TypeScript、ESLint、Vitest（8 文件、40 项）、production build、生产依赖审计（0 漏洞）和 `git diff --check` 通过；production build 转换 44 个模块，P08 独立 chunk 为 19.87kB/6.82kB gzip，初始 JS 为 199.88kB/63.10kB gzip，CSS 为 65.69kB/11.60kB gzip。真实 Edge Chromium 覆盖全部设计状态、P07 往返、1440px、390px、320px、键盘首焦点、校验焦点和交互目标；控制台 0 error、0 warning。

本地页面已重新验证 HTTP 200：`http://127.0.0.1:5173/tracepbl/tasks/demo-tang-45m/audit`。

## 4. 风险

- 当前规则与建议是确定性合成演示，尚未经 5 名教师任务测试，也不是未来 AI、提示词或模型质量证据。
- 外部来源可用性、真实检查权威性、任务隔离和授权仍依赖未来后端；前端不得放行。
- NVDA/VoiceOver、200%/400% 缩放、高对比及 Safari/Firefox 尚待发布前设备矩阵。
- P09 合并页尚未讨论、出图和编码；不得从当前“检查完成”推断教学包已经确认或导出。

## 5. 精确归档路径

仅申请以下 21 个路径：

1. `apps/web/src/App.tsx`
2. `apps/web/src/DesignAuditPage.tsx`
3. `apps/web/src/RubricDesignPage.tsx`
4. `apps/web/src/WorkbenchShell.tsx`
5. `apps/web/src/design-audit.css`
6. `apps/web/src/design-audit.test.tsx`
7. `apps/web/src/design-audit.ts`
8. `apps/web/src/main.tsx`
9. `apps/web/src/teaching-context-store.ts`
10. `apps/web/src/teaching-context.test.tsx`
11. `docs/00-governance/PROJECT-STATE.md`
12. `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
13. `docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md`
14. `docs/03-frontend-design/INFORMATION-ARCHITECTURE.md`
15. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
16. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
17. `docs/03-frontend-design/USER-FLOWS.md`
18. `docs/03-frontend-design/VIEW-MODEL-FIXTURE-SPEC.md`
19. `docs/06-development/P08-IMPLEMENTATION-VALIDATION.md`
20. `docs/06-development/LEARNING-CARD-6.10.md`
21. `docs/06-development/STAGE-6.10-REPORT.md`

建议提交消息：`feat(web): implement P08 design audit`

## 6. 归档门禁

当前只申请用户审阅。用户回复“批准归档”前，不执行 `git add`、`git commit`、`git tag`、`git push`、部署或进入 P09。
