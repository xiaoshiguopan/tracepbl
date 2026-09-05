# 阶段 12 验证记录

> 2026-09-05 补验更新：以下保留归档历史；当前已验证范围和剩余限制以 [补充验证报告](./STAGE-12-FOLLOWUP-REPORT.md) 为准。

日期：2026-09-05。状态：首轮记录，整体未通过，CP-12-01 待批准。

## 环境与隔离

- 输入提交 `97321fe`；未提交工作树为本阶段最小修复。
- Node 24.20.0 / npm 11.19.0，PostgreSQL 18.6 / pgvector 0.8.6；Docker 位于 WSL Ubuntu。
- `tracepbl-stage12-review` 与后续 `tracepbl-stage12-final` 是独立测试项目，无数据库宿主端口，不使用既有预览卷。后者从新空库执行最后一轮标准门禁。
- 原用户预览任务和 `output/` 保留。恢复探针只用新建合成任务，备份在测试容器 `/tmp`；未恢复用户备份、未读现有秘密。

## 当前命令结果

最后一轮容器记录时间约 18:21—18:22 CST。下列命令逐项 exit 0；完整本地日志在忽略目录 `.tracepbl/stage12-evidence/`，不进入归档。

| 命令 | 当前结果 | 说明 |
|---|---|---|
| npm run lint | exit 0 | root tests 与所有 workspace |
| npm run typecheck | exit 0 | root tests 与所有 workspace |
| npm run test | exit 0：92 passed、7 skipped、0 failed | 7 项为 API DB 6 与 checkpoint 1；随后真实集成各自通过，不计作单元通过 |
| npm run test:integration | exit 0：18 + 6 + 1 passed | migration、运行角色 provision、checkpointer 初始化都成功 |
| npm run test:e2e | exit 0：1 passed | HTTP → Worker → HTTP |
| npm run test:stage11 | exit 0：13 passed | workspace/来源/修订/教师采用/幂等/失败/删除跨层 |
| npm run build | exit 0 | 162 模块；保留 pdfmake 大块和 LocalTaskBoundary 混合导入警告，没有关闭警告 |
| npm audit --json --fetch-retries=0 --fetch-timeout=20000 | exit 0：0 漏洞 | 包括开发依赖；报告 total 440，计数含 workspace/平台项，非清单 420 个包条目 |
| node tests/stage12.supply-chain.mjs | exit 0 | 420 锁文件依赖、0 缺完整性哈希、0 高置信秘密模式命中；30 个可达提交 |

后续只增加 workspace 限流回归及 Vite 私有目录保护：API `app-contract.test.ts` 5/5；私有文件真实 HTTP 探针 2/2 拒绝；相关 ESLint 与 Web typecheck 通过。前一完整门禁未被这些局部测试冒充重新全跑，未变化的数据库/Worker 证据保留。

`npm run format:check` 在本轮文档写入后单独运行，exit 0。Git 仅提示现有 Windows LF/CRLF 转换规则，没有空白错误；新增文档另做尾随空白检查。

## 先失败后通过

- 缓存：401 响应 Cache-Control 为 null → no-store，测试先 1 fail 后通过。
- IPv6 映射：3 个私网映射原返回 false；修复并扩展展开写法、公网映射和 DNS 拒绝后 URL 15/15。
- Worker 真实 AI 关闭：完整合成配置原返回 real，修复后 disabled，fake 保持可用；配置 4/4。
- 限流：第 601 次请求原仍 401；修复后 429/Retry-After，60 秒后恢复；另证实更换 session 不绕过 workspace 阈值。
- Vite 文件：自行新建哨兵实际原文返回 200，排除 SPA fallback；修复后相对与 `/@fs/` 两种路径均 403。测试 finally 只移除自己创建的单文件。

## 恢复失败证据

只针对 `tracepbl-stage12-review-postgres-1` 的合成任务 `01991200-0000-7000-8000-000000000001`：

1. 新建任务，`pg_dump -U postgres -d tracepbl -Fc -f /tmp/stage12-before-deletion.dump`。
2. 将该合成任务时间设为已删除 25 小时；创建受租约保护 purge，切换 worker role 调用现役 `ops.purge_task`。
3. `original_purged=t`，原库任务数 `original_remaining=0`。
4. `createdb -U postgres stage12_restore_audit`，`pg_restore -U postgres -d stage12_restore_audit --exit-on-error /tmp/stage12-before-deletion.dump`。
5. 恢复库查询该 ID 且 `deleted_at is null`，`restored_active_deleted_task=1`。

第一次 shell 包装末尾 here-document 换行错误使总命令 exit 1；dump/restore 和计数已执行。随后单独 psql 查询 exit 0，再次确认 active=1。此处是缺陷复现，**不是恢复测试通过**。精确探针脚本保留于忽略的 `.tracepbl/stage12-recovery.sh`，复验应使用新隔离库，不在已有预览上执行。

## Docker 与复验入口

正式 `docker build -f Dockerfile.backend -t tracepbl-stage12-review .` 本次 exit 1：官方 `auth.docker.io/token` 连接超时。没有更换镜像源。阶段 11 的正式构建/启动成功证据保留，但不能写成本轮无缓存构建通过。

继续检查使用本机既有的阶段 11 官方依赖镜像：临时 Dockerfile `FROM tracepbl-stage11-final-20260905-api:latest`，仅 `COPY . .` 当前代码（沿用 `.dockerignore`，排除秘密/output），重新生成测试镜像。父镜像 digest `sha256:19edbda997309c6cb271c22ab5b0663ccabc6472c8148c93157c43866035f5e4`，最终本轮镜像索引 digest `sha256:34af5bf3bbf246c0eac98dab07befc50fb9aa5a8247698e0a19ac3d52d3f878a`。这是缓存依赖验证，不是官方 Hub 重新拉取成功。

常规可复验入口（有可用官方网络时）：

```text
docker build -f Dockerfile.backend -t tracepbl-stage12-review .
docker compose -f tests/stage12.compose.yaml -p tracepbl-stage12-new-run run --rm verify
npm run format:check
node tests/stage12.supply-chain.mjs
```

每次全量 DB suite 使用新的独立 project 名，不能重用预览库；测试会调整独立库运行角色密码。重跑同一 DB suite 可能遇到固定合成 ID 已存在，不能删除用户数据来让测试通过。

Vite 私有文件验证：一个终端执行 `npm run dev:local -- --host 127.0.0.1 --port 35173`，另一个执行 `node tests/stage12.private-files.mjs`；无需访问或修改 API 数据。本轮此窄探针运行于宿主 Node 24.19.0，标准门禁使用容器目标 Node 24.20.0，二者不能混称。

## 许可与保留证据

锁文件 420 项：MIT 310、Apache-2.0 34、ISC 29、BSD-3-Clause 14、BSD-2-Clause 6、BlueOak 6、MPL-2.0 12、MIT OR GPL 1、MIT AND Zlib 1、Unlicense 2、0BSD 1、未声明 4。`png-js` 本机 LICENSE 为 MIT；`ssh2` legacy licenses 字段和 LICENSE 为 MIT。`buildcheck`、`cpu-features` 当前平台未安装，其许可证正文仍待核对，不能只靠传递依赖推断。

现役媒体和字体权利证据沿用 P00 最终资产登记；本阶段未改影片/字体。阶段 11 的 Demo、local 主链、断线恢复、教师草稿采用、响应式/量规布局证据保留，未重新改变 UI 视觉。真实模型、真实数据、辅助技术全矩阵、专业教师、远端 CI、部署均未执行。

## CP-12-01 获批后的最终复验（2026-09-05）

上文首轮失败/待批准是历史记录。CP-12-01 后完成 0005、独立清单、维护 CLI/Compose、冻结价格和执行权；补充真实调用恢复冷却、模型响应大小/向量序号验证。本阶段始终只用合成数据。

| 命令/场景 | 最终结果 | 证据与范围 |
|---|---|---|
| npm run lint | exit 0 | 最后候选镜像，包含新增 scripts/tests |
| npm run typecheck / npm run build | exit 0 | 最后候选镜像 Node 24.20.0/npm 11.19.0，162 modules |
| npm test | exit 0，100 passed + 7 DB skipped | 11:42 UTC 最后候选；API 8、Web 32、Worker 9、DB 静态 5、AI 9、contracts 6、repositories 5、domain 8、retrieval 18 |
| npm run test:integration | exit 0，25 passed | 11:32 UTC 独立 release-candidate PG；DB18/API6/checkpoint1 |
| npm run test:e2e / test:stage11 | exit 0，1 + 13 passed | 同轮独立 PG；后续只改测试类型和日志回归，不改这些被测业务 |
| npm run test:stage12 | exit 0，8 passed | 新随机数据库；含 13 类入口对照、磁盘写失败、恢复失败、预算并发/价格/重复执行/冷却/显式基线 |
| npm audit --json --fetch-retries=0 --fetch-timeout=20000 | exit 0，0 vulnerabilities | 全量（含开发），不是仅生产依赖 |
| node tests/stage12.supply-chain.mjs --scan-only | exit 0，0 findings | 420 依赖完整性无缺失；30 个可达提交和跟踪/获批目录未跟踪文件；不读取 output/ 或忽略秘密 |
| sh tests/stage12.restore.sh | exit 0 | 真正 pg_dump -Fc / pg_restore 至新空库；先 blocked，后 task count 0、history retained |
| node tests/stage12.runtime.mjs | exit 0 | 最新独立 runtime-final，新 PG + 新 recovery 卷，真实 HTTP 删除/同键重放/隐藏/撤销/no-store |
| /health/ready | 200 ready | 11:43 UTC，API 38787 经合法 Host 8787；Web 38173，PG 没有宿主发布端口 |
| PowerShell Parser backup.ps1 / restore.ps1 | 0 syntax errors | 只语法；宿主无 pg_dump/pg_restore/psql，不声称 Windows 原生整套执行 |
| Chromium inline-ai / inline-recovery | passed | 四页三宽度；离线/取消/迟到结果/重载/过期确认保留草稿；测试脚本复用阶段11，只改证据输出目录 |

最终缓存依赖镜像索引 digest：`sha256:cd10d9667bc8f3ec929fbfefd24d1d30eccff316345697aa3e80be9ade8eb944`。沿用官方阶段 11 依赖层，仅 COPY 当前源码并创建 node 所有的 /recovery；没有更换 npm/镜像源。完整启动 project 为 `tracepbl-stage12-runtime-final`；此前本阶段独立 runtime 的 API/Worker/Web 已停止，保留卷。用户原 5173/25173 等预览未停止或升级。

全量循环保留目录 `.tracepbl/stage12-evidence/2026-09-05T11-08-16.014Z`、`2026-09-05T11-13-04.410Z`、`2026-09-05T11-32-33.229Z`。最后一轮中测试新增响应类型导致 typecheck/build 暂时 exit 2；修正 unknown/数组非空类型后，仅再次运行受影响的 typecheck/build/lint 和新增 unit，最终 exit 0。不把循环中的旧失败改写成通过。

恢复演练原先使用相同快照的 PostgreSQL template 克隆做自动化负向测试，之后额外使用真正 custom dump/restore 和生产维护 CLI。`tests/stage12.restore.sh` 固定只在专用测试服务中新建 stage12_dump_* 数据库，不触碰预览任务，不清理既有输出。

浏览器证据另存 `.tracepbl/stage12-inline-ai-verification/` 与 `.tracepbl/stage12-inline-recovery-verification/`；没有覆盖阶段 11。宿主窄验证为 Node 24.19.0/npm 11.17.0，目标命令在 Node 24.20.0/npm 11.19.0 容器执行。Chromium 测试期间有一次宿主 Node 退出断言，独立脚本已输出通过；不把宿主稳定性推断为跨平台保证。

额外适配器回归：重复 embedding index 原来被接受；无 Content-Length 的 20 块响应原来全部读取后才拒绝。修复后两项拒绝测试通过（5/5 adapter tests）；所有 fetcher 为合成响应，无真实网络模型调用。

许可证核对：buildcheck 0.0.7、cpu-features 0.0.10 官方 npm tarball SHA-512 与锁文件相同；只在内存读取 LICENSE，未安装/执行脚本。前者 MIT，后者顶层 MIT + 内嵌 cpu_features Apache-2.0。不是逐条法律审查。
