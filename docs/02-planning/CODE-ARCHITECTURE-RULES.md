# 史证工坊代码与架构规则

> 文档版本：0.1
> 更新日期：2026-08-31
> 状态：已批准归档
> 适用范围：后续工程设计与实现；目录尚未创建

## 1. 唯一架构基线

采用 npm workspaces 单仓库：React/Vite Web、Hono API、Node Worker、PostgreSQL/pgvector，领域契约以 TypeScript/Zod 为唯一可执行定义。Demo 适配器与真实 API 适配器共享领域模型和契约，但存储和运行边界明确分离。

```text
apps/web ──> packages/contracts ──> packages/domain
apps/api ──> packages/contracts ──> packages/domain
apps/worker ─> packages/ai + packages/retrieval ─> packages/domain
packages/database ───────────────────────────────> packages/domain
packages/fixtures ─> contracts/domain（仅测试和 Demo）
```

拟建目录：`apps/web`、`apps/api`、`apps/worker`、`packages/domain`、`packages/contracts`、`packages/ai`、`packages/retrieval`、`packages/database`、`packages/fixtures`、`tests`、`scripts`。创建时间服从总体阶段顺序。

## 2. 分层职责与依赖方向

| 层 | 可以做 | 不可以做 |
|---|---|---|
| `domain` | 状态机、证据门禁、权限/费用/TTL策略的纯逻辑 | 导入 React、Hono、LangGraph、数据库或云 SDK |
| `contracts` | Zod 输入输出、事件和错误结构，派生 OpenAPI | 含数据库实体或 UI 状态 |
| `web` | 展示、表单、客户端路由、Demo/API 适配 | 直连数据库、对象存储或模型；持有服务端密钥 |
| `api` | HTTP边界、身份/资源授权、校验、用例编排 | 绕过 domain 复制规则；直接渲染 UI |
| `worker` | 可重试异步任务、模型/RAG/Agent 编排 | 决定教师批准、越权调用工具、绕过费用/删除规则 |
| `database` | Schema、迁移、仓储实现、事务 | 把 ORM 类型暴露为公共 API |
| `ai/retrieval` | 模型适配、检索、结构化输出与引用候选 | 成为事实或权限真相源 |

依赖只能沿箭头进入稳定内层；禁止循环依赖。跨层只通过已批准接口、领域值对象和契约。任何临时反向导入都必须按变更控制审批，不能用路径别名隐藏。

## 3. 契约与公共边界

- 浏览器、API、Worker、数据库和模型输出均视为不可信边界；入口用 Zod 运行时校验，内部 TypeScript 类型不能替代校验。
- 公共 HTTP 契约由 `packages/contracts` 定义并生成 OpenAPI；实现、测试 fixture 和前端客户端必须消费同一版本。
- 错误统一为稳定机器码、用户安全文案、可选字段错误和追踪 ID；响应不得泄露堆栈、SQL、密钥或他人资源存在性。
- 领域 ID 使用不透明值；任务 ID 不是授权凭证。资源授权必须在服务端每次验证。
- 事件/任务包含契约版本、幂等键、关联 ID、尝试次数和时间；消费者拒绝未知破坏性版本。
- 破坏性公共契约变更必须版本化、提供迁移路径，并按 `CHANGE-CONTROL.md` 重新批准。

## 4. 服务端、客户端与状态

- PostgreSQL 是完整模式唯一数据真相；IndexedDB 仅保存当前浏览器 Demo 状态，页面显式提供清除。
- 服务端拥有权限、证据/许可门禁、任务生命周期、删除和费用限制；客户端只能预校验和呈现。
- 服务端派生字段不能信任客户端回传；模型生成内容在进入领域状态前必须结构化校验并标记来源。
- 共享可变全局状态禁止用于请求/任务数据；缓存必须有键空间、TTL、失效和敏感性规则。
- 多对象写入必须在用例层声明事务边界；外部调用不放在长数据库事务中。

## 5. 命名、错误、日志与配置

- 文件/目录用 `kebab-case`，React 组件和类型用 `PascalCase`，函数/变量用 `camelCase`，环境变量用 `UPPER_SNAKE_CASE`。
- 名称使用领域词汇（source、claim、evidence、audit、approval），不以 `data`、`manager`、`utils` 承载混杂职责。
- 可预期失败返回类型化结果；不可预期错误在边界捕获、记录追踪 ID 后转换。禁止空 `catch` 和仅 `console.log` 后继续。
- 结构化日志至少含时间、级别、事件名、追踪/任务关联 ID；不得记录 capability、Token、原文全文、个人数据或模型密钥。
- 配置在启动时一次校验，缺失即失败；测试显式注入。任何 `VITE_` 变量都视为公开，绝不存秘密。

### 5.1 预期配置类别（名称在相应设计阶段确认）

| 类别 | 使用方 | 秘密 | 规则 |
|---|---|---|---|
| 运行模式、公开站点/API Origin | Web/API | 否 | Demo 与完整模式不可自动混淆 |
| `DATABASE_URL` | API/Worker/迁移 | 是 | 最小权限、不得进入浏览器或日志 |
| 模型提供商 API Key | Worker | 是 | 仅服务端密钥库/CI secret，支持轮换和熔断 |
| 对象存储凭据 | API/Worker | 是 | 独立最小权限身份；公开 Demo 不需要 |
| TTL、限额、超时 | API/Worker | 否 | 有安全默认和上限，不能由客户端放宽 |

## 6. 可维护性门槛

- 一个模块只服务一个明确职责；生产 TS/TSX 文件超过 300 行进入拆分审查，超过 500 行除生成文件外必须拆分或书面例外。
- 单函数超过 50 行或参数超过 5 个进入设计审查；优先提取领域概念，不为达数字机械切碎。
- 同一业务规则只在 domain 定义，UI、API、SQL 与 Agent 不得复制“近似版本”。
- 禁止循环、巨型组件、万能 service、隐式单例、跨层相对路径穿透和未说明的全局状态。
- 重构只服务当前批准范围；不得顺手格式化、改名或迁移无关文件。

## 7. 依赖准入和供应链

新增生产依赖前必须记录：解决的问题、现有能力为何不足、维护/许可/体积/安全状态、替代与退出方式、锁文件变化和用户批准。优先标准库与现有依赖；不得仅为一个小工具引入大型框架。

- 固定 lockfile；CI 使用干净、可重复安装。
- GitHub Actions 第三方 action 固定完整提交 SHA；自动化 token 只给所需权限。
- 不执行来源不明脚本；依赖升级单独成变更，先窄后广验证。

## 8. Worker 与 Agent 规则

- v0.1 没有定时任务/cron；Worker 只处理用户触发的异步任务。任务必须幂等、有限重试、可取消、可观测，失败进入明确终态。
- Agent 工具采用显式允许清单和最小参数；检索文本和网页内容始终是不可信数据，不是系统指令。
- 提示词只能引导行为；权限、删除、费用、引用完整性、教师批准和副作用由应用代码硬性执行。
- Agent 结构化输出经契约校验；任何写入或导出副作用由应用层重验权限和门禁，并保存审计记录。
- 必须存在任务级停止、提供商级熔断、调用/Token 上限和人工接管路径。

## 9. 标准验证命令契约

脚手架获批后应实现：`npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:integration`、`npm run test:e2e`、`npm run build`。当前仓库尚无这些脚本，因此本文件不声称其已通过。
