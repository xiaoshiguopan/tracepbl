# 阶段 6.9 报告：P07“评价量规”前端编码

> 日期：2026-09-02
> 状态：等待用户确认归档
> 需求：MUST-007；NFR-002—010、012
> 范围：仅 P07、P06 相邻导航和已确认视觉的设计文档同步；不含 P08—P12、依赖、数据库或后端

## 1. 授权与边界

- P06 已由本地提交 `3b5db5c` 归档。
- 用户认可“从摘抄到历史解释的评阅标尺”方案，确认桌面效果图后明确授权编码。
- 没有实现 P08、真实 AI、提示词工程、模型微调、数据库、后端 API、学生评分、音频或新增依赖。

## 2. 完成结果

1. 新增 `/tasks/:taskId/rubric`；P06 校验并保存后进入，P07 可清洁返回 P01—P06。
2. 一张连续评阅标尺承接三项课堂成果，沿“只摘抄材料 → 形成历史解释”呈现四个证据推理维度和三个行为阶段。
3. 右侧/窄屏置前的对齐校样显示 `4 个评价维度 / 3 项课堂成果 / 4/4 已对齐 / 0 项课堂未要求能力`，明确“不计算总分”。
4. 每维可编辑名称与三段行为锚点；空泛、重复、空白、映射失效或待复核时阻断确认并聚焦首错。
5. 局部替代只使用合成 fixture，先展示差异再应用；维度删除可撤销并说明对 MUST-007 四维覆盖的影响。
6. IndexedDB 新增版本化 P07 store；活动变化只标记映射到该活动的量规维度，不静默覆盖教师编辑。
7. 开发状态覆盖加载、空量规、缺上游、校验失败、系统失败、不可用、超时、离线和成功；权限展示继续明确不代表安全授权。
8. P07 与 P08 在证据脉络中拆为独立步骤，但 P08 仍只显示下一步且没有页面或业务实现。

## 3. 验证结论

完整浏览器与恢复证据见 `P07-IMPLEMENTATION-VALIDATION.md`。阶段收尾时 TypeScript、ESLint、Vitest（7 文件、35 项）、production build、生产依赖审计（0 漏洞）和 `git diff --check` 通过；production build 转换 41 个模块，P07 独立 chunk 为 16.51kB/6.11kB gzip，初始 JS 为 199.07kB/62.98kB gzip。真实 Chromium 覆盖正常、加载、空、缺上游、校验失败、系统失败、不可用、超时、离线、成功、P06 往返、局部差异、删除/撤销、390px、320px、键盘和焦点。

## 4. 风险

- 四维行为描述仍是合成演示，尚未经 5 名教师任务测试，也不是实时 AI 或提示词质量证据。
- 当前只验证本机 IndexedDB；真实任务隔离、访问和修改授权必须由未来服务端完成。
- NVDA/VoiceOver、200%/400% 缩放及 Safari/Firefox 尚待发布前设备矩阵。
- P08 尚未实现，P07 成功反馈不会伪造设计检查已可用。

## 5. 精确归档路径

仅申请以下 17 个路径：

1. `apps/web/src/App.tsx`
2. `apps/web/src/LessonDesignPage.tsx`
3. `apps/web/src/RubricDesignPage.tsx`
4. `apps/web/src/WorkbenchShell.tsx`
5. `apps/web/src/main.tsx`
6. `apps/web/src/rubric-design.css`
7. `apps/web/src/rubric-design.test.tsx`
8. `apps/web/src/rubric-design.ts`
9. `apps/web/src/teaching-context-store.ts`
10. `apps/web/src/teaching-context.test.tsx`
11. `docs/00-governance/PROJECT-STATE.md`
12. `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
13. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
14. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
15. `docs/06-development/P07-IMPLEMENTATION-VALIDATION.md`
16. `docs/06-development/LEARNING-CARD-6.9.md`
17. `docs/06-development/STAGE-6.9-REPORT.md`

建议提交消息：`feat(web): implement P07 evidence-aligned rubric`

## 6. 归档门禁

当前只申请用户审阅。用户回复“批准归档”前，不执行 `git add`、`git commit`、`git tag`、`git push`、部署或进入 P08。
