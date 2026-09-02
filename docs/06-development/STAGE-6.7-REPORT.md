# 阶段 6.7 报告：P05“组织证据”前端编码

> 日期：2026-09-02
> 状态：已获用户批准归档
> 需求：MUST-005；NFR-001—007、009—012
> 范围：仅 P05 与 P03 相邻导航；不含 P06—P12、依赖、数据库或后端

## 1. 授权与边界

- 阶段 6.6 已由本地提交 `4465263` 归档。
- 用户认可“史家论证批注桌”方案，确认生成的桌面效果图后明确回复“确认动工”。
- 没有实现 P06、真实 AI、数据库、后端 API、图形库、拖拽或新增依赖。

## 2. 完成结果

1. 新增 `/tasks/:taskId/evidence-map`，P03 达到 4 条且 3 种类型后可直接进入。
2. 默认提供 3 个待判断命题、4 条可追到 P03 史料的关系和 1 处证据缺口；不生成陈述式默认历史结论。
3. 教师可修改、添加或移除命题，调整、添加、删除或撤销关系，并明确保留证据缺口。
4. 右侧证据账簿显示命题、关系、缺口和未连接史料数量；Compact 改为正文后的单列摘要。
5. 重复关系、空理由、未关联命题和待复核关系有明确错误；自动建议失败不阻塞手工编辑。
6. P02 问题或 P03 史料集合变化会把既有关系降为待复核；本机草稿 fixture 版本化迁移。
7. P03↔P05 可清洁往返；证据脉络只改善导航体验，不冒充服务端授权。
8. 共享焦点样式补齐 `summary`，所有渐进展开控件获得一致可见焦点。

## 3. 验证结论

完整浏览器与恢复证据见 `P05-IMPLEMENTATION-VALIDATION.md`。TypeScript、ESLint、Vitest（5 文件、25 项）、production build、生产依赖审计（0 漏洞）和 `git diff --check` 通过；production build 转换 35 个模块，P05 独立 chunk 为 15.02kB/5.28kB gzip，初始 JS 为 197.58kB/62.74kB gzip。真实 Chromium 走查覆盖正常、加载、空、无史料、校验、系统失败、不可用、超时、离线、成功、P03 往返、390px、320px、键盘和焦点，控制台无 warning/error。

## 4. 风险

- 合成关系与理由未经过 5 名教师任务测试，也不等于模型质量评测。
- 当前只验证本机 IndexedDB 状态；真实任务隔离和授权必须由未来服务端完成。
- 读屏、200%/400% 缩放及 Safari/Firefox 尚待发布前设备矩阵。
- P06 未实现；确认成功不会伪造已进入下一页面。

## 5. 精确归档路径

仅申请以下 14 个路径：

1. `apps/web/src/App.tsx`
2. `apps/web/src/EvidenceMapPage.tsx`
3. `apps/web/src/SourceDiscoveryPage.tsx`
4. `apps/web/src/evidence-map.css`
5. `apps/web/src/evidence-map.test.tsx`
6. `apps/web/src/evidence-map.ts`
7. `apps/web/src/main.tsx`
8. `apps/web/src/source-discovery.test.tsx`
9. `apps/web/src/teaching-context-store.ts`
10. `apps/web/src/workbench.css`
11. `docs/00-governance/PROJECT-STATE.md`
12. `docs/06-development/P05-IMPLEMENTATION-VALIDATION.md`
13. `docs/06-development/LEARNING-CARD-6.7.md`
14. `docs/06-development/STAGE-6.7-REPORT.md`

建议提交消息：`feat(web): implement P05 evidence mapping workspace`

## 6. 归档门禁

用户已于 2026-09-02 回复“批准归档”，仅授权第 5 节 14 个精确路径的一次本地提交；不授权 `git tag`、`git push`、部署或进入 P06。
