# 测试映射

日期：2026-09-05；阶段 12 CP-12-01 复核。**不是全需求通过声明**。当前命令结果见 [验证记录](./STAGE-12-VALIDATION.md)。本地 CI 等价命令已运行；没有 push，远端 CI 状态均未验证。

## 1. 当前已存在且实际运行的覆盖

下表“拒绝”表示被测非法操作应安全失败，不表示每个 API 的完整组合矩阵均已穷尽。阶段 11 浏览器证据属于继承证据，非本轮重新执行。

| 需求 | 正常与规则 | 拒绝/失败结果 | 已运行证据文件 | CI |
|---|---|---|---|---|
| MUST-001 | 课程边界保存、修订 | 非法字段、过期 ETag 不覆盖 | apps/web/src/workflow.test.tsx；tests/stage11.integration.test.ts | unit + stage11 |
| MUST-002 | 问题收束、编辑后明确采用 | 旧建议、取消后采用、跨任务建议拒绝 | tests/stage11.integration.test.ts；apps/web/src/local-integration.test.ts | 同上 |
| MUST-003 | 合成文本/元数据与版本选择 | 未声明数据边界、非法类型、外部抓取关闭、他任务来源拒绝 | tests/stage11.integration.test.ts；apps/api/tests/api.integration.test.ts | integration + stage11 |
| MUST-004 | 来源版本、引用定位与导出冻结 | 错配引用不通过；元数据权利不输出正文 | packages/retrieval/tests/retrieval.test.ts；packages/database/tests/export-snapshot.test.ts；tests/stage11.integration.test.ts | unit + stage11 |
| MUST-005 | 关系与来源绑定、缺口标记 | 未选来源/非法引用拒绝 | database/tests/database.integration.test.ts；tests/stage11.integration.test.ts | integration + stage11 |
| MUST-006 | 活动与时间、来源关联 | 上游变化保留内容并待复核；非法关联拒绝 | database/tests/database.integration.test.ts；apps/web/src/workflow.test.tsx | unit + integration |
| MUST-007 | 量规与活动对齐 | 不存在活动与非法等级拒绝 | 同上；继承 tests/stage11.rubric-layout.browser.mjs | unit + integration；浏览器非 CI |
| MUST-008 | 当前修订审计、问题处理 | 未知/阻断/过期审计不能签发 | tests/stage11.integration.test.ts；tests/backend.e2e.test.ts | e2e + stage11 |
| MUST-009 | 教师修改后原子采用、不可变导出 | 未确认/版本变化/重放冲突拒绝 | tests/stage11.integration.test.ts；packages/database/tests/export-snapshot.test.ts | unit + stage11 |
| MUST-010 | workspace/task 隔离、删除与 24h 撤销 | 越权/不存在同 404；到期与 purge 认领后拒绝撤销 | database/tests/database.integration.test.ts；tests/stage11.integration.test.ts | integration + stage11 + stage12 |
| NFR-001/012 | 引用与导出来源可追踪 | 错来源、错误正文、伪造关系拒绝 | retrieval.test.ts；export-snapshot.test.ts；stage11.integration.test.ts | 已配置 |
| NFR-002/003 | 合成数据、会话签名、逐资源作用域 | 缺会话、坏 Host/Origin、篡改 Cookie 拒绝；私有文件不可读 | apps/api/tests/；tests/stage12.private-files.mjs；tests/stage12.supply-chain.mjs | API 已配置；新增脚本本地执行 |
| NFR-004/009 | lease、取消、stale、checkpoint resume、有限重试 | 结果未知不自动重试；取消不应用 | apps/worker/tests/；packages/ai/tests/workflow.test.ts；stage11.integration.test.ts | 已配置 + stage12 恢复门禁 |
| NFR-005 | SSE 与 REST 状态、连接上限 | 流缺口 reset、取消、断线恢复 | stage11.integration.test.ts；继承 stage11.inline-recovery.browser.mjs | 跨层已配置；浏览器非 CI |
| NFR-006/007 | 已确认桌面/窄屏布局和局部键盘操作 | 量规四列不被按钮挤错；窄屏无水平溢出 | 继承阶段 11 浏览器和布局报告 | 未接入 CI；完整辅助技术未验证 |
| NFR-008 | 数据库调用/Token/生成金额预留、fake 零费用、真实开关 | 超预算和关闭真实执行拒绝；请求突发 429 后可恢复 | domain.test.ts；database.integration.test.ts；apps/worker/tests/config.test.ts；apps/api/tests/app-contract.test.ts | 已配置 + stage12 合成价格并发验证 |
| NFR-010/011 | 合成示例标签、权利替代输出 | 无权正文不进入导出 | workflow.test.tsx；export-snapshot.test.ts；阶段 11 Demo 浏览器证据 | unit 已配置；专业/许可复核未穷尽 |

## 2. 本轮新增并已执行

- `tests/stage12.safety.test.ts`：13 类 GET/SSE 入口逐一对照他 workspace 与不存在资源；外部清单缺失/损坏/pending/写失败；删除撤销；旧快照恢复、checkpoint 清理失败不开放；合计金额并发、冻结价格、重复使用权拒绝、真实调用冷却和既有库显式基线。
- `tests/stage12.restore.sh` + restore-fixture：实际 custom pg_dump/pg_restore 与生产 reconcile/purge 核心；恢复后任务数 0，保护记录保留。
- `tests/stage12.runtime.mjs`：实际 HTTP/API 运行角色下删除、同键重放、隐藏、撤销与 no-store。
- 复用阶段 11 inline-ai/inline-recovery 浏览器步骤，证据另存 stage12：编辑后确认、原始历史、丢响应同键重试、取消/断线恢复、4 页 × 3 宽度，无横向溢出。
- `packages/ai/tests/glm-provider.test.ts`：重复向量序号和超大 chunked 响应先失败后修复；使用合成 fetcher，未联网模型。

## 3. 计划测试（未完成）

- 完整浏览器键盘闭环、200% 实际缩放、页面缓存与安全头、目标辅助技术和多浏览器复核。
- 继续扩大写入口组合、日志其他路径与 provider 故障矩阵；现有读取入口、异常日志哨兵和响应大小边界已执行。

## 4. 完全没有验证或尚不足的缺口

- Windows 原生 PowerShell + PostgreSQL 客户端整套备份/恢复尚未执行；Linux Docker 下实际 dump/restore 已执行。断电/存储介质损坏未模拟。
- 真实 GLM 质量、可调用性、价格和数据条款未验证，也未授权；fake 不能证明真实模型质量。
- 行/分支覆盖百分比未测量；无覆盖率报告，不能以通过数量声称达到。
- NVDA/VoiceOver、Safari/Firefox、真实教师专业复核、真实 Word 应用排版、目标网络 Pages 访问未验证。
- Webhook/支付/公网账号不存在，不适用，不能写成“安全测试通过”。
- 远端 GitHub Actions、全新机器无缓存安装/启动未验证；本轮 Docker Hub token 连接超时。
