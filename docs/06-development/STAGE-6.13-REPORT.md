# 阶段 6.13 报告：前端全流程深度优化

> 日期：2026-09-03
> 状态：实现完成，等待用户批准归档
> 范围：P00—P09、P12、游客本机任务、统一交互系统与 Word/PDF 教学包

## 1. 授权与边界

- 基线为本地提交 `b36e02c`；P00—P09 与 P12 已实现，P04 并入 P03，P10 并入 P09，P11 已取消且本轮未补做。
- 用户完成两批建议和收口方案讨论，最终回复“确认方案，直接开工”，授权一次性完成已确认的前端优化。
- 获准使用 `@dnd-kit/core`、`@dnd-kit/sortable`、`docx`、`pdfmake` 与 OFL 中文字体；未引入其他生产依赖。
- 未进入数据库或后端，未设计具体 API，未实现真实 RAG、联网搜索、AI、模型微调、上传服务或真实个人/学生数据。

## 2. 完成结果

1. P00 视频改为每次进入或刷新均从开头单次播放，结束后定格最后一帧并可重播；移除旧版海报残帧，鼠标微光改用逐帧更新，标题统一楷体。
2. 建立统一按钮、图标、圆润选择器、拖拽把手、页面底部动作栏、间距和响应式规则；桌面“我的备课”为右上锚定菜单，窄屏为底部抽屉。
3. P01 使用白色纸面和低输入学情预设；P02 使用“唐朝为何由盛转衰？”及三个递进子问题，并支持拖拽排序。
4. P03 目录顺序固定，独立的整块阅读按钮与复选框分别承担查看和选用，消除嵌套控件导致的点击失效；每条材料依次提供课堂节选、材料释义和可论证内容；换一批保留已选，自有材料入口与换批拆分。
5. P05 使用史料架和问题区：拖入添加、拖回移除、空白取消，同一史料可服务多个问题；关系只保留下拉选择、系统解读和减号。
6. P06 改为七张可排序活动卡，显示 0—45 分钟累计区间，首尾可新增，整卡统一修改/保存/取消，学生卡点和教师支架常显。
7. P07 改为五个可观察的历史学习评价维度，新增维度会自动定位并进入编辑；P08 改为异常优先和可执行引导；上游变化统一为不阻断推进的提示，真实内容缺失或核验失败仍阻断；P09 提供宽松清样、明确累计时间及单一导出入口。
8. Word/PDF 均输出课程情境、探究问题、完整史料节选与来源、教学解读、活动、卡点、教师引导和五维量规；活动史料使用可读标题而非内部 ID。
9. 增加旧草稿迁移，旧问题、空选择和旧文件名不会重新污染当前“高一第 6 课／唐朝由盛转衰”口径。

## 3. 当前验证结论

完整证据见 `FRONTEND-DEEP-OPTIMIZATION-VALIDATION.md`。TypeScript、ESLint、Vitest（19/19）、Vite production build（56 模块）、生产依赖审计（0 漏洞）和 `git diff --check` 均已使用最终代码通过。

真实 Chromium 已验证首页、P01、P02、P03、P05、P06、P07、P08、P09 的桌面和 390px 窄屏关键布局；已验证刷新从视频开头播放且不出现旧版海报、视频末帧、微光坐标更新、史料独立点击/勾选不跳序、活动整卡编辑、统一撤销提示、量规新增自动定位、上游变化不阻断推进、设计检查到导出、桌面/移动备课菜单与点击外部关闭。

Word 与 PDF 已从最终页面实际下载。修正后的 PDF 为 5 页并逐页渲染，无截断、重叠或缺字；DOCX OOXML 可解析，包含材料释义、可论证内容、可读史料标题和累计活动时间，且不含内部史料 ID。当前机器没有 Word/LibreOffice，不能虚报 DOCX 目标应用渲染通过。

## 4. 剩余风险

- `pdfmake` 与 17.77MB Noto Sans SC 仅在 PDF 导出时加载；弱设备首次导出可能等待。
- 游客历史只在当前浏览器，不能跨设备同步；前端页面状态不是真实安全授权。
- 史料换批只使用内置公开来源，自有网址/文本不冒充联网抓取或 AI 解析。
- Word/LibreOffice、Safari/Firefox、读屏、强制高对比和 200%/400% 缩放仍属于发布前设备矩阵。

## 5. 精确归档路径

仅申请以下当前变更路径；`output/` 与浏览器下载、QA 临时文件不归档：

1. `apps/web/package.json`
2. `package-lock.json`
3. `apps/web/public/assets/export/NotoSansSC-Variable.ttf`
4. `apps/web/public/assets/export/OFL.txt`
5. `apps/web/public/assets/p00/p00-cinematic-h3-v2.mp4`
6. `apps/web/src/App.test.tsx`（删除）
7. `apps/web/src/App.tsx`
8. `apps/web/src/DesignAuditPage.tsx`
9. `apps/web/src/EvidenceMapPage.tsx`
10. `apps/web/src/FinalReviewPage.tsx`
11. `apps/web/src/LessonDesignPage.tsx`
12. `apps/web/src/P00Experience.tsx`
13. `apps/web/src/QuestionWorkspaceForm.tsx`
14. `apps/web/src/QuestionWorkspacePage.tsx`
15. `apps/web/src/RubricDesignPage.tsx`
16. `apps/web/src/SourceDiscoveryPage.tsx`
17. `apps/web/src/TeachingContextForm.tsx`
18. `apps/web/src/TeachingContextPage.tsx`
19. `apps/web/src/UiControls.tsx`
20. `apps/web/src/WorkbenchShell.tsx`
21. `apps/web/src/design-audit.test.tsx`（删除）
22. `apps/web/src/evidence-map.test.tsx`（删除）
23. `apps/web/src/evidence-map.ts`
24. `apps/web/src/final-review.test.tsx`（删除）
25. `apps/web/src/final-review.ts`
26. `apps/web/src/lesson-design.test.tsx`（删除）
27. `apps/web/src/lesson-design.ts`
28. `apps/web/src/main.tsx`
29. `apps/web/src/optimization.css`
30. `apps/web/src/pdfmake.d.ts`
31. `apps/web/src/question-workspace.test.tsx`（删除）
32. `apps/web/src/question-workspace.ts`
33. `apps/web/src/rubric-design.test.tsx`（删除）
34. `apps/web/src/rubric-design.ts`
35. `apps/web/src/source-discovery.test.tsx`（删除）
36. `apps/web/src/source-discovery.ts`
37. `apps/web/src/styles.css`
38. `apps/web/src/teaching-context-store.ts`
39. `apps/web/src/teaching-context.test.tsx`（删除）
40. `apps/web/src/teaching-context.ts`
41. `apps/web/src/teaching-pack-export.ts`
42. `apps/web/src/workflow.test.tsx`
43. `docs/00-governance/PROJECT-STATE.md`
44. `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
45. `docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md`
46. `docs/03-frontend-design/FRONTEND-DEEP-OPTIMIZATION-SPEC.md`
47. `docs/03-frontend-design/FRONTEND-REVIEW.md`
48. `docs/03-frontend-design/INFORMATION-ARCHITECTURE.md`
49. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
50. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
51. `docs/03-frontend-design/USER-FLOWS.md`
52. `docs/06-development/FRONTEND-DEEP-OPTIMIZATION-VALIDATION.md`
53. `docs/06-development/LEARNING-CARD-6.13.md`
54. `docs/06-development/STAGE-6.13-REPORT.md`
55. `apps/web/src/design-audit.ts`

建议提交消息：`feat(web): unify the complete teaching workflow`

## 6. 归档门禁

当前未执行 `git add`、`git commit`、`git tag`、`git push` 或部署。只有用户明确回复“批准归档”后，才允许按第 5 节范围执行一次本地提交；该批准不包含 push、tag 或部署。
