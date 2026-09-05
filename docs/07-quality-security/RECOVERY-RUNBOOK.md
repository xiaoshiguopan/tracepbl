# 恢复保护与本地复验

日期：2026-09-05；CP-12-01 已批准。只处理本地和 CI；示例测试使用合成数据，不调用真实模型。

## 新环境与既有环境

新空库执行 `docker compose up --build -d`：migration → 运行角色 → checkpointer → 外部删除清单初始化 → API/Worker。清单存于独立 `tracepbl_recovery` volume，数据库存于 `tracepbl_postgres` volume。不能删除 recovery volume 来解决启动失败；仍有可恢复备份时必须保留清单。

已有阶段 11 数据库不会自动假装具备完整删除历史。升级时先停止 API/Worker 写入，核实这是当前活动库，而不是某份旧备份；运行 0005、运行角色与 checkpointer 初始化后，由维护者显式建立新基线：

```text
node --experimental-transform-types apps/worker/src/recovery-maintenance.ts establish-baseline --legacy-backups-unrestorable
```

该命令要求维护连接 `TRACEPBL_MIGRATOR_DATABASE_URL` 和仓库外 `TRACEPBL_RECOVERY_JOURNAL`；不删除任何任务或旧备份。**新基线之前的备份不再允许通过此恢复流程开放**，必须新做备份。它不是自动推定历史完整的开关，也不能用于把不明来源的恢复库标记成活动库。本次没有在用户原预览数据库上执行升级或建立基线。

建立既有库基线或执行恢复后，真实 AI 在数据库层至少关闭 24 小时，避免落后的费用记录重置当天预算。fake 不受影响。等待结束也不构成真实调用授权，真实模型仍需另行授权、完整价格配置与显式开关。

## 备份与恢复

备份脚本要求仓库外 OutputPath、JournalPath 和已有 PostgreSQL 18 客户端。恢复脚本要求空数据库、dump 对应 manifest、独立最新清单和从可信维护记录核对的 `ExpectedJournalSha256`。不能拿旧备份 manifest 中的清单指纹代替“最新”指纹。

```powershell
./database/scripts/backup.ps1 -OutputPath <仓库外文件> -JournalPath <独立清单> -DatabaseUrl <备份连接>
./database/scripts/restore.ps1 -DumpPath <仓库外文件> -JournalPath <独立最新清单> -ExpectedJournalSha256 <可信当前指纹> -DatabaseUrl <隔离空库维护连接>
```

维护时停止同一数据库的 API/Worker。脚本校验 dump 后恢复，执行 migration/checkpointer 初始化、删除清单核对和到期清理；先删除 checkpoint，再删除正文。旧队列全部取消，不能重放旧模型请求。恢复失败时保留数据库、清单和错误类别，服务保持关闭；只对已核实原因做向前修复，然后用同一可信清单重试。不要清空保护表、删除清单、解除维护标记或修改旧 migration 来放行。

当 pending 清单与 DB 事件完全一致时，服务可以完成确认；不一致则停止。哈希用于发现损坏/错文件，不对抗控制本机并能同时篡改清单和可信指纹的维护者。Windows 文件已 fsync，但目录 rename 无同等目录 fsync 保证；完整断电/存储故障未模拟。本次端到端持久化在 Linux Docker volume 验证。

清单仅含 epoch、序号、任务摘要、delete/restore 与到期时间，不含正文、标题或明文任务 ID。它随所有仍可恢复的备份保留；只有对应旧备份均已销毁，维护者才能另行批准清理。本次不执行此类清理。

## 可重复的隔离测试

```text
docker build -f Dockerfile.backend -t tracepbl-stage12-review .
docker compose -f tests/stage12.compose.yaml -p tracepbl-stage12-new-run run --rm verify
```

使用每次不同的 project 名运行全量测试，避免固定合成 ID 冲突；测试不得指向用户预览库。`test:stage12` 在这个专用 PG 服务中新建随机测试数据库，保留失败现场。`tests/stage12.verify.mjs` 按时间创建证据子目录，避免覆盖旧日志。

真正 custom dump/restore 演练（已有同标签测试镜像与 WSL/Docker，不安装系统工具）：

```text
docker compose -f tests/stage12.compose.yaml -p tracepbl-stage12-cp12 up -d postgres
sh tests/stage12.restore.sh
```

演练只新建 `stage12_dump_*` 合成库和独立测试清单卷：删除前 dump → 当前库到期删除 → 恢复旧 dump → 先证明拒绝开放 → 合并最新清单 → checkpoint-first purge → 任务数 0、保护记录保留。可用 `TRACEPBL_SAFETY_PROJECT` 指定同一专用测试 project。

完整独立运行环境：

```text
docker compose --env-file tests/stage12.synthetic.env -f compose.yaml -f tests/stage12.runtime.compose.yaml -p tracepbl-stage12-runtime up -d --no-build
node tests/stage12.runtime.mjs
```

这里的公开合成密码仅适用于隔离测试。Web 为 localhost:38173，API 为 localhost:38787，PG 无宿主端口；这组端口不替换用户 5173/25173 预览。真实网络、真实模型、生产和外部发布不在范围。

Windows 原生 backup/restore PowerShell 已做语法检查；本机没有 PostgreSQL 客户端，原生命令未端到端执行。相同恢复核心及真正 pg_dump/pg_restore 已在 PostgreSQL 18.6 Docker 实测，不能把两者混称为 Windows 原生通过。
