# 史证工坊（TracePBL）

面向中学历史教师的可追溯证据探究工作台。教师可以从教学情境出发，逐步完成问题收束、史料选择、证据关系、课堂活动、量规、审校和导出；来源版本、引用、教师决定与后台运行均保留可追溯边界。

## 当前状态

- P00—P09 与 P12 已完成；P04 自动核验并入 P03，P10 导出并入 P09，P11 已取消且不得恢复。
- React/Vite 前端是长期公开的纯静态 Demo，只使用 IndexedDB、公开/合成 fixtures 与预生成结果。
- PostgreSQL 18.6 + pgvector 0.8.6 数据层，以及 Hono API、Worker、RAG、GLM adapter 与 LangGraph checkpointer 已实现。
- 阶段 10 后端编码已完成本地验证，当前准确进度与门禁以 [PROJECT-STATE.md](./docs/00-governance/PROJECT-STATE.md) 为准。

## 两种运行形态

| 形态 | 用途 | 数据与网络边界 |
|---|---|---|
| GitHub Pages Demo | 公开展示完整教师流程 | 只用浏览器本地数据，不连接秘密后端，不携带密钥 |
| 完整本地模式 | 验证真实 API、数据库、Worker、RAG/Agent 边界 | 默认只监听 localhost；无 Key 可运行，真实 GLM 与真实 URL 默认关闭 |

## 本地后端

目标工具链为 Node.js 24.20.0、npm 11.19.0、TypeScript 6.0.3；标准完整后端环境使用 Docker Compose。

1. 将根目录 `.env.example` 复制为不会提交的 `.env`，替换四个密码/秘密占位符。
2. 运行 `npm run local:up`。Compose 会启动 PostgreSQL、执行 migration、配置独立 API/Worker 角色、初始化 LangGraph checkpointer，再启动 API 与 Worker。
3. 打开 `http://127.0.0.1:8787/health/ready` 检查就绪状态；OpenAPI 3.1 契约位于 `http://127.0.0.1:8787/openapi.json`。
4. 运行 `npm run local:down` 停止服务。命名卷会保留本地数据库；删除卷属于数据删除，不会自动执行。

无 Key 是正常运行方式：AI、embedding 和 URL 抓取默认关闭，普通手工工作流仍可使用。不得把真实密钥写入 `.env.example`、Git、浏览器或日志；真实 GLM 联调必须另行授权。

## 开发与验证

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

需要真实临时 PostgreSQL 的集成、最小权限和 E2E 验证见 [阶段 10 验证记录](./docs/06-development/BACKEND-IMPLEMENTATION-VALIDATION.md)。测试只使用公开或合成数据，CI 使用 deterministic fake provider，不调用付费模型。

## 项目入口

- [AI 协作总手册](./VIBE-CODING-AI-GUIDE.md)
- [项目专属规范](./PROJECT-HANDBOOK.md)
- [当前阶段状态](./docs/00-governance/PROJECT-STATE.md)
- [产品需求](./docs/01-initiation/PRD.md)
- [唯一技术决策](./docs/01-initiation/TECHNOLOGY-DECISION.md)
- [文档索引](./docs/README.md)
- [阶段 10 完成报告](./docs/06-development/STAGE-10-REPORT.md)

未经明确授权，不得调用真实 GLM、读取本机密钥、导入真实个人/学生数据、push、部署或恢复已取消的 P11。
