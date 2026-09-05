# 阶段 13.2 验证记录

日期：2026-09-05。输入 Git HEAD 8de8f5c，原工作区仅未跟踪 output/。使用现役 13.1 方案第 7 节“不预装真实数据”路径；不新增批量导入器。

## 隔离和复验

- 最终项目 tracepbl-stage13-final2，有独立 PostgreSQL 与恢复卷；不 seed 目录史料。Web 127.0.0.1:52173、API 127.0.0.1:52787，PG 无宿主端口。fake provider、真实 AI 和 URL 抓取开关关闭。
- 复用阶段 12 已验证的 tracepbl-stage12-followup 镜像：目标 Node 24.20.0/npm 11.19.0，PG 18.6/pgvector 0.8.6；后端无变化。该镜像没有后续 DOCX keepNext 一行，本轮不验证导出排版，其最终证据继承 8de8f5c，不能把镜像称为当前全部前端源码。
- 测试驱动为宿主 Node 24.19.0、已有 Playwright 1.62.1/Chromium 151.0.7922.34。不安装新依赖，不连接付费模型。

在未占用测试端口、新 project 名和新卷上执行：

```powershell
wsl -d Ubuntu -- docker compose --env-file tests/stage12.synthetic.env -p tracepbl-stage13-final2 -f compose.yaml -f tests/stage13.synthetic.compose.yaml up -d --no-build
$env:TRACEPBL_PLAYWRIGHT_MODULE='C:/Users/10342/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright-core/index.mjs'
node tests/stage13.readiness.browser.mjs
```

Playwright 路径是本机已有工具，换机器应指向其已有安装；镜像需先按现役构建说明准备。脚本要求空任务列表/空材料目录，不能直接在已有预览库或已经执行过的同库重跑。证据目录每次独立，不覆盖历史；复验应换 project/端口并用 TRACEPBL_BROWSER_ORIGIN 指定新测试地址。

## 最终证据

- Compose 空库初始化 exit 0。
- 浏览器脚本 exit 0；`.tracepbl/stage13/run-1788616050334/result.json`：status passed、4 条材料、混合批次 202/422/422、externalRequests=0、pageErrors=0。来源页面截图 sources.png 已查看，成功保存仍显示待核验，不冒充可用或签发。
- API 与 DB 对照：`docker exec tracepbl-stage13-final2-postgres-1 psql -U postgres -d tracepbl -At -c "select job_kind,status,count(*) from ops.jobs group by job_kind,status order by job_kind,status; select count(*) from core.sources; select rights_state,verification_state,count(*) from core.source_versions group by rights_state,verification_state;"` exit 0。
- 查询结果：embedding/succeeded/1；model/succeeded/1；purge/cancelled/1；sources=4；restricted_metadata_only/pending=3，unknown/pending=1。没有打印正文、Cookie 或秘密。
- `node node_modules/eslint/bin/eslint.js tests/stage13.readiness.browser.mjs` exit 0；`git diff --check` exit 0。

脚本直接检查：空库首页建课、表单保存、fake 问题建议教师确认、未勾选拒绝、TXT 输入、正文与元数据权利差异、幂等重放/冲突、混合部分失败和单项修正、无会话一致拒绝、同工作区任务来源隔离、跨任务版本拒绝、旧锁拒绝、未审批导出拒绝、刷新持久化、删除隐藏和撤销保留、完整模式不写 IndexedDB。

首次上传的合成 TXT 正文在测试文件中公开、长度很小，明确“非真实史料”。后台仅 fake 处理。用于 URL 元数据的 example.invalid 不抓取；没有实际外发材料或真实试导入。

## 测试纠正与失败保留

1. 第一轮假设字段非法为 400，实际 422；核对 OpenAPIHono defaultHook 和公开 responses 明确 422，修正测试预期，不改服务。
2. 第二轮在已写入库重复空库断言，观察到 1 条任务；本地 runtime 会给不同浏览器窗口签发同一个本地工作区会话。因此新 profile 不代表空库或新用户。随后使用新独立项目；无会话测试检查 401，真正跨工作区 404 继承阶段 12 的服务端测试，不伪造本轮覆盖。
3. 第三轮错误地对读路径 /sources 发送 PUT，返回 404；核对现役写路由为 /source-selection，修正测试路径，保留所有权限与状态断言。
4. 最终在新空库 tracepbl-stage13-final2 完整重跑通过。旧项目 tracepbl-stage13-synthetic 与 tracepbl-stage13-final 的 Web/API/Worker 已停止，数据库卷和失败截图仍保留，未清理用户资源。

失败截图目录：run-1788615832869、run-1788615883816、run-1788615955233；完整异常输出见本任务命令记录。没有修改业务代码以迁就测试。

## 继承证据与未执行项

阶段 11/12 完整预生成教学流程、跨工作区 404、后台取消/恢复/过期拒绝与到期清理、Windows/Linux dump/restore 均沿用有效归档证据。本轮无恢复算法或 DB 变化，不重复全仓检查或再次备份恢复；实际执行的是新库初始化与任务删除/撤销。

未执行真实批次、真实模型、真实教师质量、公共网络/远端 CI、设备矩阵或发布操作。结构化来源写入缺口仍保留；材料仅 pending，不能以导入成功推断签发可用。下一阶段发布准备必须读取阶段 12 补验限制并明确各项适用性。本轮结果不授予部署权限。
