# 阶段 6.12 报告：P12“任务不可用”前端编码

> 日期：2026-09-03
> 状态：已获用户批准归档
> 需求：MUST-010（安全终态部分）、NFR-002、NFR-003、NFR-006、NFR-007
> 范围：仅 P12、P11 取消决策和必要现役前端契约同步；不含依赖、数据库或后端

## 1. 授权与边界

- P09 已由本地提交 `f330f7a` 归档。
- 用户明确要求不做 P11、直接做 P12；随后确认“冷石色留白封存页”效果图并授权编码。
- P11 本机数据查看/清除入口明确未实现；P12 不读取、清除或声称清除任务数据。
- 没有新增依赖、数据库表、具体后端 API、真实授权、真实 AI/RAG/联网、模型微调、个人/学生数据、史料、音频或外部动作。

## 2. 完成结果

1. 新增 `/task-unavailable` 公共安全路由；未知查询参数安全忽略，不进入文案。
2. 统一显示“此任务不可使用”，不区分过期、已清除、不存在或无权访问，不显示任务标题、所有者、ID 或证据脉络。
3. 页面按确认图实现冷石色双栏纸面：左侧留白封存，右侧只提供重新开始动作。
4. “新建演示任务”进入公开合成任务的 P01；“返回演示说明”回到 P00。
5. P12 不读取 IndexedDB 或任务对象；所有现役页面的不可用 fixture 继续复用同一安全组件。
6. 标题加载后获得程序焦点，首次 Tab 进入唯一主动作；窄屏改单列并保持 44px 触控目标。
7. 前端安全展示不冒充真正授权；完整模式仍需服务端统一强制不可用结果。

## 3. 验证结论

完整证据见 `P12-IMPLEMENTATION-VALIDATION.md`。阶段收尾时 TypeScript、ESLint、Vitest（9 文件、46 项）、production build（47 模块）、生产依赖审计（0 漏洞）和 `git diff --check` 通过。当前初始 JS 为 205.23kB/64.58kB gzip，CSS 为 75.39kB/13.05kB gzip。

本地页面已验证 HTTP 200：`http://127.0.0.1:5173/tracepbl/task-unavailable`。

## 4. 风险

- P11 已取消，MUST-010 的应用内主动查看/清除本机任务数据部分未满足；P12 不能补偿该缺口。
- 当前只是前端 Demo 的等价展示，不能证明对象真的不存在、已过期或不属于当前访问；真实隔离必须由未来服务端授权实现。
- NVDA/VoiceOver、200%/400% 缩放、高对比及 Safari/Firefox 尚待发布前设备矩阵。
- 初始 JS 为 64.58kB gzip，已接近 65kB 预算上限；后续总审查不得再向入口静态加入非必要代码。

## 5. 精确归档路径

仅申请以下 15 个路径：

1. `apps/web/src/App.test.tsx`
2. `apps/web/src/App.tsx`
3. `apps/web/src/WorkbenchShell.tsx`
4. `apps/web/src/workbench.css`
5. `docs/00-governance/PROJECT-STATE.md`
6. `docs/03-frontend-design/COMPONENT-ARCHITECTURE.md`
7. `docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md`
8. `docs/03-frontend-design/FRONTEND-REVIEW.md`
9. `docs/03-frontend-design/INFORMATION-ARCHITECTURE.md`
10. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
11. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
12. `docs/03-frontend-design/USER-FLOWS.md`
13. `docs/06-development/P12-IMPLEMENTATION-VALIDATION.md`
14. `docs/06-development/LEARNING-CARD-6.12.md`
15. `docs/06-development/STAGE-6.12-REPORT.md`

建议提交消息：`feat(web): implement P12 safe unavailable page`

## 6. 归档门禁与下一阶段预告

用户已于 2026-09-03 回复“批准归档”，仅授权第 5 节 15 个路径的一次本地提交；不授权 `git tag`、`git push` 或部署。

归档后不再进入其他页面编码；用户将在新对话启动“前端全方位深度优化与阶段 6 总审查”，核对现役需求、全流程、视觉一致性、状态覆盖、性能、安全边界与遗留风险。P11 保持取消，不在优化中偷偷补做。
