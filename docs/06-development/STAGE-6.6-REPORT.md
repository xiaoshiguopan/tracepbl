# 阶段 6.6 报告：P03“查找史料”前端编码

> 日期：2026-09-02
> 状态：已获用户批准归档
> 需求：MUST-003、MUST-004；NFR-001—007、009—012
> 范围：仅 P03 与 P01/P02 相邻导航；不含 P05—P12、依赖、数据库或后端

## 1. 授权与边界

- P02 已由提交 `0a7c3cd feat(web): implement P02 inquiry question workflow` 批准归档。
- 用户认可“轻量知识库优先、外部权威来源补充、页内直接阅读、AI 理由、更多候选与推荐排序”，并取消独立 P04 教师核验页。
- 图片生成服务连续网络失败后，用户明确回复“这次不用生成图片了，直接改吧”，仅取消本次 P03 页面图前置门禁。后续页面仍需先讨论和确认页面图。
- 未实现真实 RAG、联网搜索、AI、模型微调、数据库、后端 API、上传或 P05。

## 2. 完成结果

1. 新增 P03 路由和史料阅览台，以 P01 的色彩、字体、纸张、细线和证据脉络为母版。
2. 10 条候选全部来自已登记官方来源；4 条优先推荐可页内阅读必要短引或馆方著录，其余 6 条在许可确认前只展示元数据与官方入口。
3. 每条推荐同屏显示来源定位、自动核验限制、推荐理由、可帮助判断、不能单独证明、权利边界与访问日。
4. 右侧目录支持切换、选入、排除和恢复；选择与排除互斥，组合摘要同时检查数量和类型互补。
5. 选择状态复用现有 IndexedDB 模式，升级到版本 3 并增加独立 store；未引入状态库、路由库或表单库。
6. 自有材料只录入题名与稳定来源地址，不伪造上传或在线核验成功；错误与字段关联并聚焦首错。
7. 移除独立“核验史料”步骤；MUST-004 结果嵌入 P03，前端没有权限假授权或未知状态假绿。
8. P02 成功动作现在进入 P03；已到达 P03 后可清洁往返，实际修改问题才需确认后返回。

## 3. 验证与原型结论

完整证据见 `P03-IMPLEMENTATION-VALIDATION.md`：21 项测试、TypeScript、ESLint、production build、生产依赖审计（0 漏洞）和差异格式检查通过。真实 Chromium 验证桌面、390px、320px、选择/排除/恢复、刷新持久化、相邻页往返和全部故障注入状态；控制台 0 warning/error。

视觉自评结论：阅览纸明显强于目录，标题和必要短引构成首要阅读路径；右栏是可操作索引而非卡片墙。移动端已在浏览器复核后改为正文先于目录。

## 4. 风险

- 当前只是静态 Demo；真实自动核验、权威授权、任务隔离、费用和外部失败必须由未来服务端实现。
- 6 条“更多可用史料”尚未复制史料内容，因为图片/长文许可未逐条确认；这是主动版权边界，不以合成内容填补。
- 国家图书馆页面本轮网络打开超时；必要短引沿用此前已批准逐字登记，发布前仍需再次复核。
- 推荐量与排序尚未经过 5 名教师任务测试。
- 读屏、200%/400% 缩放和 Safari/Firefox 设备矩阵尚未完成。

## 5. 精确归档路径

仅申请本次 P03 规划同步、实现与报告的以下路径：

1. `.gitignore`
2. `PROJECT-HANDBOOK.md`
3. `apps/web/src/App.tsx`
4. `apps/web/src/QuestionWorkspaceForm.tsx`
5. `apps/web/src/QuestionWorkspacePage.tsx`
6. `apps/web/src/SourceDiscoveryPage.tsx`
7. `apps/web/src/WorkbenchShell.tsx`
8. `apps/web/src/main.tsx`
9. `apps/web/src/question-workspace.test.tsx`
10. `apps/web/src/source-discovery.css`
11. `apps/web/src/source-discovery.test.tsx`
12. `apps/web/src/source-discovery.ts`
13. `apps/web/src/teaching-context-store.ts`
14. `apps/web/src/teaching-context.test.tsx`
15. `docs/00-governance/PROJECT-STATE.md`
16. `docs/01-initiation/GO-NO-GO.md`
17. `docs/01-initiation/PRD.md`
18. `docs/01-initiation/PROJECT-CHARTER.md`
19. `docs/02-planning/MASTER-PLAN.md`
20. `docs/02-planning/TEST-STRATEGY.md`
21. `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
22. `docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md`
23. `docs/03-frontend-design/FRONTEND-REVIEW.md`
24. `docs/03-frontend-design/INFORMATION-ARCHITECTURE.md`
25. `docs/03-frontend-design/MOCK-AND-FIXTURES.md`
26. `docs/03-frontend-design/P03-SOURCE-DISCOVERY-DESIGN.md`
27. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
28. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
29. `docs/03-frontend-design/SOURCE-FIXTURE-RESEARCH.md`
30. `docs/03-frontend-design/USER-FLOWS.md`
31. `docs/03-frontend-design/VIEW-MODEL-FIXTURE-SPEC.md`
32. `docs/03-frontend-design/VISUAL-DIRECTION.md`
33. `docs/03-frontend-design/assets/README.md`
34. `docs/06-development/LEARNING-CARD-6.6.md`
35. `docs/06-development/P03-IMPLEMENTATION-VALIDATION.md`
36. `docs/06-development/STAGE-6.6-REPORT.md`
37. `docs/README.md`

建议提交消息：`feat(web): implement P03 source discovery workspace`

## 6. 归档门禁

用户已于 2026-09-02 回复“批准归档”，仅授权第 5 节 37 个精确路径的一次本地提交；不授权 `git tag`、`git push`、部署或进入 P05。
