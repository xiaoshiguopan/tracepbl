# 阶段 6.8 报告：P06“设计活动”前端编码

> 日期：2026-09-02
> 状态：等待用户确认归档
> 需求：MUST-006；NFR-002—010、012
> 范围：仅 P06、P05 相邻导航和已确认视觉的设计文档同步；不含 P07—P12、依赖、数据库或后端

## 1. 授权与边界

- P05 已由本地提交 `0704061` 归档。
- 用户认可“45 分钟课堂排演稿”方案，确认桌面效果图后明确授权编码。
- 没有实现 P07、真实 AI/RAG、模型微调、数据库、后端 API、拖拽、音频或新增依赖。

## 2. 完成结果

1. 新增 `/tasks/:taskId/lesson`；P05 关系满足门禁并保存后直接进入，P06 可清洁返回 P01—P05。
2. 默认三段流程把 39 分钟学生任务和 6 分钟转换完整排入 45 分钟；时间变化实时汇总，超限改变主动作并阻断确认。
3. 连续排演稿用真实分钟刻度和“学生动作—史料—成果”链替代卡片墙；桌面右侧为时间账簿，窄屏账簿置前。
4. 每段可编辑名称、任务/转换时间、史料、动作、成果、困难和支架；支持上移、下移、移除、撤销及教师编辑标记。
5. 局部替代建议仅使用合成 fixture，先展示差异再应用，不覆盖其他段落或冒充在线 AI。
6. 证据未绑定、动作可脱离证据、成果/困难/支架为空、上游待复核和总时长超限均有明确阻断与首错焦点。
7. IndexedDB 新增版本化 P06 store；问题变化标记全部活动，史料/关系变化只标记受影响活动。
8. 已确认视觉同步回页面规格、状态矩阵和组件职责；步骤状态继续明确“不代表安全授权”。

## 3. 验证结论

完整浏览器与恢复证据见 `P06-IMPLEMENTATION-VALIDATION.md`。阶段收尾时 TypeScript、ESLint、Vitest（6 文件、30 项）、production build、生产依赖审计（0 漏洞）和 `git diff --check` 通过；production build 转换 38 个模块，P06 独立 chunk 为 19.23kB/6.91kB gzip，初始 JS 为 198.30kB/62.87kB gzip。真实 Chromium 覆盖正常、加载、空、无史料、校验失败、系统失败、不可用、超时、离线、成功、P05 往返、局部差异、排序/撤销、390px、320px、键盘和焦点。

## 4. 风险

- 课堂方案与支架仍是合成演示，尚未经 5 名教师任务测试，也不是实时 AI 质量证据。
- 当前只验证本机 IndexedDB；真实任务隔离、访问和修改授权必须由未来服务端完成。
- NVDA/VoiceOver、200%/400% 缩放及 Safari/Firefox 尚待发布前设备矩阵。
- P07 尚未实现，P06 成功反馈不会伪造下一页面已可用。

## 5. 精确归档路径

仅申请以下 15 个路径：

1. `apps/web/src/App.tsx`
2. `apps/web/src/EvidenceMapPage.tsx`
3. `apps/web/src/LessonDesignPage.tsx`
4. `apps/web/src/lesson-design.css`
5. `apps/web/src/lesson-design.test.tsx`
6. `apps/web/src/lesson-design.ts`
7. `apps/web/src/main.tsx`
8. `apps/web/src/teaching-context-store.ts`
9. `docs/00-governance/PROJECT-STATE.md`
10. `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
11. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
12. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
13. `docs/06-development/P06-IMPLEMENTATION-VALIDATION.md`
14. `docs/06-development/LEARNING-CARD-6.8.md`
15. `docs/06-development/STAGE-6.8-REPORT.md`

建议提交消息：`feat(web): implement P06 lesson design workspace`

## 6. 归档门禁

当前只申请用户审阅。用户回复“批准归档”前，不执行 `git add`、`git commit`、`git tag`、`git push`、部署或进入 P07。
