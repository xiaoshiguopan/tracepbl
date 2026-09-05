# 阶段 12 安全复核

日期：2026-09-05。状态：获批本地范围内发现已修复并复验，待用户验收；不是 ASVS 认证。基线 `97321fe`。范围为 localhost 单用户和纯静态 Demo；只用合成数据。

## 结论

CP-12-01 已批准实施。原删除恢复与费用两项已补齐；另修复模型响应大小和向量序号验证。当前已知发现无未解决 Critical/High。结论限于合成数据、本地/CI 的已测试路径，不授权真实模型、真实数据、公开服务或阶段 13。

## 发现

| ID / 严重度 | 精确证据与影响 | 修复/缓解与复验 | 误报核对 |
|---|---|---|---|
| S12-01 High，已修复 | database/scripts/restore.ps1:10 只验空库；apps/api/src/app.ts:74 只计 overdue；database/migrations/0003_backend_runtime_support.sql:254 删除任务审计。旧备份恢复后已 purge 任务重新可读 | 0005 + recovery.ts + recovery-maintenance.ts + restore.ps1；新独立清单与前缀门禁、checkpoint-first purge。真正旧 dump 恢复先被拒绝，合并后任务 0、保护记录保留；清理失败仍关闭。原失败证据保留 | 已用真正 pg_dump/pg_restore 复现，不是仅从代码推断；未动预览库 |
| S12-02 Medium，已修复 | apps/api/src/app.ts:34；原 API 无 Cache-Control，不能确保私有响应不进缓存 | 统一 no-store/nosniff；401 回归先失败后通过 | 前端 fetch 原已有 no-store，因此不是声称已观察到缓存泄露；修复服务端契约缺口 |
| S12-03 Medium，已修复；抓取启用前阻断 | packages/retrieval/src/url-fetch.ts:15；`::ffff:7f00:1` 等被当作 IPv4 点分文本检查而漏拦，可能接入 loopback/私网 | 使用标准 URL 规范化，再还原映射 IPv4；15 项 URL 测试通过 | 当前抓取关闭；没有调用真实网址，使用合成 resolver；公网映射地址仍可通过 |
| S12-04 High（真实模式条件下），已修复 | apps/worker/src/config.ts:18；Worker 原忽略 TRACEPBL_AI_ENABLED=false，已有真实配置时仍会实例化真实 provider | 关闭开关时 real 转 disabled，fake 保持可用；4 项配置测试通过 | 用合成 key 字符串测试配置，没有调用模型；不声称发生过真实费用 |
| S12-05 Medium，已修复 | .github/workflows/ci.yml:39；原 checkout/setup-node 使用可变 @v4 | 固定官方 v4 当前完整 SHA；2026-09-05 GitHub REST refs 实际查询 | 没有升级主版本、添加 Action 或触发远端工作流；SHA 固定不等于代码无漏洞 |
| S12-06 High（真实费用条件下），已修复 | apps/worker/src/handlers.ts:41/50；embedding 金额结算为 0。0003:174 生成日金额排除 embedding；apps/api/src/config.ts 默认生成金额预留 0 | 0005 + domain/pricing + API/Worker 配置和 handlers；合并金额并发门禁、冻结价格、started 使用权、实际 embedding 结算、恢复后真实调用 24h 关闭。合成价格测试通过；保持 fake/disabled | 静态代码证据；不宣称 fake 产生费用，也未做真实调用 |
| S12-07 Medium，已修复 | apps/api/src/app.ts:37；原只有 SSE 数量限制，无阶段 9 规定的短窗口请求保护 | 每进程 600 次/分钟、每签名 workspace 300 次/分钟；429 + Retry-After，窗口后恢复，新会话不能绕过 workspace 限额 | 只补既有设计内部阈值，不调整数据库费用上限；健康检查不计入；不会阻断正常几秒轮询 |
| S12-08 Medium，已修复 | apps/web/vite.config.ts:9；Vite 默认未禁止 .tracepbl，合成哨兵文件经普通 URL 实际返回原文 | 保留默认秘密拒绝模式并增加 .tracepbl/output/key；两种路径 403 | 只读取自行新建的合成哨兵并清理该文件，未探测现有密钥/日志/output；不是公网暴露结论 |
| S12-09 Medium，已修复 | packages/ai/src/glm-provider.ts post 原先 response.text() 全部读完才检查 1 MiB；无长度头时不能阻止大响应占用 | 按流累计字节并在越界时取消。原 20 块被读完，修复后在阈值停止；合成测试先失败后通过 | 当前未启用真实模型；没有上传测试数据或调用供应商 |
| S12-10 Medium，已修复 | packages/ai/src/glm-provider.ts embed 原只检查条数/维度，重复 index 可以把向量错配给文本，影响检索 | 校验 index 唯一完整、非零向量；重复 index 响应先被接受，修复后拒绝 | 错配影响检索，不声称已发生跨任务泄漏或引用伪造；测试仅合成 |

初始证据列中的旧行号指修复前版本；当前实现位置按表中模块/函数核对。

## 已核对的边界与剩余审查

- API Host 白名单、host-only HttpOnly/SameSite Strict 签名会话；写操作要求 Origin、Sec-Fetch-Site、JSON。无公网身份体系，不把 task ID 当授权。API/repository/数据库负向证据见 TESTS.md。
- 运行 app/worker 角色拒绝 DDL 和不可变历史写入；普通 CRUD、引用、删除、教师决定由确定性事务执行。0001—0004 未改。
- React 文本节点承载外部/模型内容；未发现生产代码使用 raw HTML/eval Sink。网址默认不由服务器抓取；TXT/Markdown 在浏览器转文本，服务端接收受限 JSON，PDF/DOCX/OCR 摄取不在范围。
- 日志代码默认输出事件/追踪 ID 和错误类别；本轮高置信模式扫描覆盖 30 个可达 Git 提交及跟踪工作树，0 命中。扫描规则不覆盖所有秘密类型，不能宣称穷尽无密钥。
- 流事件、引用、教师采用、租约/fencing、幂等、部分失败、到期清理由现有集成测试验证；新增 13 类读取/SSE 入口的 foreign/missing 对照，以及日志异常内容哨兵；全部写入口的任意组合和所有故障点未穷尽。
- 依赖全量 npm audit 当前 0 漏洞，不证明应用安全。420 锁文件依赖项有完整性哈希；四项缺省声明已定点核对，cpu-features 包含 MIT 与 Apache-2.0；许可登记见清单与验证记录。
- 未完成 CSP/浏览器安全头完整矩阵、真实辅助技术、供应链许可证全文逐项审查。生产发布不在当前授权。
- Webhook、支付、邮件、学生端、远程多用户不存在；不适用项不计通过。

## 依据与工具

依据项目安全基线、阶段 9 权限/生命周期/运行设计和现役 CP。使用 intended-vs-implemented、security-best-practices，以及已使用的 systematic-debugging/ponytail 做局部根因修复。没有新增第三方生产依赖、接账号或发出外部消息；Worker 仅补充对已有内部 domain workspace 的显式引用。

CI 固定提交核对来源：[checkout v4 ref](https://api.github.com/repos/actions/checkout/git/ref/tags/v4)、[setup-node v4 ref](https://api.github.com/repos/actions/setup-node/git/ref/tags/v4)。本机默认代理访问失败，随后直接 HTTPS 只读查询官方 API 成功，未改全局代理配置。
