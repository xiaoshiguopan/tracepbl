# 发布变量与秘密边界

| 名称 | 使用处 | 来源与轮换/风险 |
|---|---|---|
| github.token | Pages 作业读取同 SHA CI、上传制品、部署 | GitHub 自动短期令牌；按 job 最小权限，不打印、不放入 Vite 环境 |
| github.repository / github.sha | 发布目标与候选身份 | GitHub 上下文，非秘密；以已批准目标与主分支提交为准 |
| TRACEPBL_POSTGRES_PASSWORD / APP_DB_PASSWORD / WORKER_DB_PASSWORD | 本地 Compose | 用户本机随机值；只在忽略 .env，不能复制到 Pages |
| TRACEPBL_SESSION_SECRET | 本地会话签名 | 本机随机值；轮换会使旧会话失效，需协调本地服务 |
| TRACEPBL_PROVIDER_MODE / AI_ENABLED / URL_FETCH_ENABLED | 本地/CI 模式 | Pages 不需要；真实模式开关需专门批准；测试 fake |
| TRACEPBL_RECOVERY_JOURNAL | 本地/CI 恢复保护 | 独立清单位置，非公开材料；不能随仍可恢复备份一起丢弃 |
| TRACEPBL_PRICE_PROFILE_VERSION / GENERATION_INPUT_CNY_PER_MILLION / GENERATION_OUTPUT_CNY_PER_MILLION / EMBEDDING_CNY_PER_MILLION | 未来真实调用 | 本轮不配置；需核价、预算与专门授权 |
| TRACEPBL_PLAYWRIGHT_MODULE / PAGES_BUILD | 本地验证工具 | 已安装模块/静态产物路径；不是产品配置或秘密 |

没有为 Pages 配置任何用户提供的 secret；尤其不设置 VITE_* 模型密钥、数据库地址或 Cookie。完整变量定义沿用 .env.example 及已归档后端配置说明，本表只强调发布边界。未读取本机密钥文件。
