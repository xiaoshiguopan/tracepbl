# 阶段 10 后端实现验证记录

> 日期：2026-09-04
> 状态：实现与验证完成，用户已于 2026-09-04 批准随阶段 10 本地归档
> 数据与外部调用：仅公开/合成 fixture 和本地临时数据库；未读取密钥，未调用真实 GLM，未抓取真实网页

## 1. 运行环境

- Windows 本机实测 Node.js `v24.19.0`、npm `11.17.0`；它们保留为向下一个补丁版本的兼容性证据。Dockerfile、GitHub Actions 与根 `engines` 已对齐批准目标 Node.js `24.20.0`、npm `11.19.0`。
- WSL2 Docker Engine `29.7.2`；因本机 WSL 会在命令结束后自动停止，本轮用隐藏 keepalive 仅维持验证时段，结束后删除临时容器。
- 数据库镜像：`pgvector/pgvector:0.8.6-pg18-bookworm`，本机已有镜像 digest `sha256:2ba9ca5f2e7daa0f0e7723cba1ee9167bab54efd3640516a44ac1a928dd67e7a`。
- 实测数据库：PostgreSQL `18.6`、pgvector `0.8.6`。

## 2. 当前验证证据

| 验证 | 实际结果 | 结论 |
|---|---:|---|
| `npm run typecheck` | 9 个 TypeScript workspace 全部通过 | 通过 |
| `npm run lint` | 9 个 workspace 全部通过 | 通过 |
| `npm test` | 14 个测试文件、65 项通过；2 个需数据库环境的文件按条件跳过 | 通过 |
| 真实数据库集成 | `database.integration.test.ts` 18/18 | 通过 |
| 最小权限 API 集成 | `api.integration.test.ts` 6/6 | 通过 |
| PostgreSQL checkpointer replay | 1/1；interrupt 恢复后 generation 调用仍为 1 次 | 通过 |
| `npm run test:e2e` | HTTP → job table → Worker → HTTP 审计闭环 1/1 | 通过 |
| `npm run build` | TypeScript 全仓检查 + Vite production build | 通过 |
| `npm audit --omit=dev` | 0 vulnerabilities | 通过 |
| `npm run format:check` | 无 whitespace error；仅 Windows CRLF 提示 | 通过 |
| `docker compose --env-file .env.example config --quiet` | 退出码 0 | 通过 |
| GitHub Actions workflow 静态校验 | YAML 可解析，命令和路径均存在；未 push/PR | 本地通过，远端 run 未执行 |
| 后端 OCI 镜像构建 | 累计三次均在拉取 Node base image 前因 Docker Hub token endpoint 超时 | 外部环境阻断，pending |

最终一轮命令输出以本轮终端记录为准。临时数据库、容器、镜像标签和测试密码均未写入项目数据或 Git。

## 3. 行为覆盖

- 契约/API：全部批准路由进入 OpenAPI 3.1；Zod 严格字段；安全 Problem；会话 Cookie；Host/Origin/Sec-Fetch-Site/Content-Type/body limit；不可区分 404；ETag/If-Match；幂等；取消；SSE 回放、heartbeat、断线 cursor 与连接上限。
- 数据与事务：workspace/task 双重作用域；完整不可变 task snapshot；私有来源复制换身份；上游变更回退 review；审计、采用、批准、导出和 purge 门禁；app/worker 最小角色。
- Worker：`SKIP LOCKED` 认领、lease token fencing、续租、取消、有限重试、stale、失败时子 run 同步终态、checkpoint-first purge。
- RAG/AI：确定性 chunk、1024 维 exact cosine、task-scoped hits、引用原文校验、独立 embedding/generation 预算、固定 `GLM-5.3-Flash`/`embedding-3`、结构化输出、模型不匹配拒绝、未知结果超时不重试。
- Agent：短 LangGraph 流程只负责建议；教师采用前 interrupt；PostgresSaver 恢复不重复生成；普通 CRUD、权限、删除和批准不交给 Agent。
- 本地运行：API/Worker/PostgreSQL Compose 顺序、独立角色、localhost 端口发布、无 Key 默认、健康检查和合成 fake provider 测试路径。

## 4. 故障注入与修复证据

- 真实日期越过固定夹具日期时，删除窗口测试暴露时间依赖；已改为相对当前时间。
- E2E 首次运行暴露 Worker 缺少“仅审计 findings 重试清理”的权限；新增该表的窄 DELETE，同时撤销 Worker 对 task 的直接 DELETE。
- Worker 不能为审计 fence 获取 task 行更新锁；新增 `ops.lock_audit_commit` 受控函数，在不授予 task UPDATE 的情况下锁定 job/task/run 并验证 lease 与 lock version。
- 外部 Docker Hub 认证端点累计三次超时；最新一次已使用对齐后的 `node:24.20.0-bookworm-slim`，仍未进入 Dockerfile 步骤。未以换镜像、降低固定版本或忽略失败绕过。

## 5. 未验证与后续边界

- 未调用真实 GLM，也未验证国内账户对 `GLM-5.3-Flash`、`embedding-3` 的实际权限、价格、数据政策或中文质量；必须另行授权。
- 未做真实 URL 抓取；kill switch 默认关闭。SSRF 只用可控 resolver/合成地址做负向测试。
- 后端镜像内容构建受 Docker Hub 网络阻断；Compose 结构已解析，仍需网络恢复后重跑镜像构建和完整 `compose up` 冒烟。
- GitHub Actions workflow 尚无远端 run；执行需要未来单独取得 push 或 PR 授权，本记录只声称本地静态校验。
- 当前 E2E 是 HTTP 测试客户端，不是浏览器前端 API 接入；前端仍是静态 Demo。真实 API adapter、双窗口浏览器和完整 P01—P09 本地浏览器闭环属于下一集成阶段。
- 未使用真实/个人/学生数据，未联网搜索、部署、push 或创建生产服务。
