# 阶段 6.11 报告：P09“最终确认与导出”前端编码

> 日期：2026-09-02
> 状态：等待用户确认归档
> 需求：MUST-009；NFR-001—010、012
> 范围：仅 P09、P08 相邻导航和已确认 P09 契约同步；不含 P11/P12、依赖、数据库或后端

## 1. 授权与边界

- P08 已由本地提交 `731e468` 归档。
- 用户认可“教学包装订清样 + 一次教师签发 + 同页导出”方案，确认效果图后要求缩小中心问题字号并明确授权编码。
- 没有实现 P11/P12、独立 P10、真实 AI/RAG/联网、提示词工程、模型微调、数据库、具体后端 API、真实学生/个人数据、音频或新增依赖。

## 2. 完成结果

1. 新增 `/tasks/:taskId/review`；P08 完成并保存后直接进入，P09 可清洁返回 P01—P08。
2. 使用一张连续装订清样汇总中心问题、4 条史料、3 段/45 分钟活动、4 个量规维度和 17 项通过检查；中心问题按用户反馈降为 19.44px 桌面正文重点。
3. 复用上游教师决定，不重复逐项勾选；只保留一次最终签发。上游快照变化后旧签发自动失效。
4. 权利预览明确只打印必要短引、事实元数据、稳定定位和官方链接，不包含馆藏图片、书影、全文或长篇馆方说明。
5. 签发后原位解锁文件名与浏览器打印；系统非法字符会清理，语义空文件名会阻断并聚焦。
6. IndexedDB 升至版本 8；P09 使用独立草稿 store，P10 没有 route/page/store。
7. 开发状态覆盖正常、加载、空、校验失败、系统失败、不可用、超时、离线、缺上游和成功；打印反馈不冒充文件已生成。
8. 页面持续说明“可试教候选”不是已试教、认证或公开再分发许可，前端显示不是真实安全授权。

## 3. 验证结论

完整浏览器与恢复证据见 `P09-IMPLEMENTATION-VALIDATION.md`。阶段收尾时 TypeScript、ESLint、Vitest（9 文件、44 项）、production build（47 模块）、生产依赖审计（0 漏洞）和 `git diff --check` 通过。当前构建 P09 chunk 为 13.77kB/5.07kB gzip，初始 JS 为 200.76kB/63.23kB gzip，CSS 为 72.97kB/12.63kB gzip。

本地页面已验证 HTTP 200：`http://127.0.0.1:5173/tracepbl/tasks/demo-tang-45m/review`。

## 4. 风险

- 浏览器只能确认打印窗口已打开，不能证明用户完成另存为 PDF；页面已按这一边界写反馈。
- 当前确认、任务隔离和导出权限只是前端 Demo；真实授权仍依赖未来服务端。
- NVDA/VoiceOver、200%/400% 缩放、高对比及 Safari/Firefox 尚待发布前设备矩阵。
- DOCX、应用内 PDF 生成和其他格式未实现，也没有出现在界面；未来需要时须单独评估依赖和版式验收。

## 5. 精确归档路径

仅申请以下 20 个路径：

1. `apps/web/src/App.tsx`
2. `apps/web/src/DesignAuditPage.tsx`
3. `apps/web/src/FinalReviewPage.tsx`
4. `apps/web/src/final-review.css`
5. `apps/web/src/final-review.test.tsx`
6. `apps/web/src/final-review.ts`
7. `apps/web/src/main.tsx`
8. `apps/web/src/teaching-context-store.ts`
9. `docs/00-governance/PROJECT-STATE.md`
10. `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
11. `docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md`
12. `docs/03-frontend-design/FRONTEND-REVIEW.md`
13. `docs/03-frontend-design/INFORMATION-ARCHITECTURE.md`
14. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
15. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
16. `docs/03-frontend-design/USER-FLOWS.md`
17. `docs/03-frontend-design/VIEW-MODEL-FIXTURE-SPEC.md`
18. `docs/06-development/P09-IMPLEMENTATION-VALIDATION.md`
19. `docs/06-development/LEARNING-CARD-6.11.md`
20. `docs/06-development/STAGE-6.11-REPORT.md`

建议提交消息：`feat(web): implement P09 final review and export`

## 6. 归档门禁

当前只申请用户审阅。用户回复“批准归档”前，不执行 `git add`、`git commit`、`git tag`、`git push`、部署或进入 P11/P12。
