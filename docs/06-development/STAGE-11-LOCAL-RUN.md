# 阶段 11 本地运行与复验

日期：2026-09-05。范围：本地/CI、合成数据、fake provider。真实模型、联网搜索和发布均未授权。

## 1. 两种入口

| 入口 | 启动 | 数据边界 |
|---|---|---|
| 静态 Demo | `npm run dev`；发布构建为 `npm run build` | 浏览器 IndexedDB，公开 fixtures 和预生成结果，无 API 会话、无秘密后端 |
| 完整本地 | 下述 Compose；浏览器打开 `http://127.0.0.1:5173` | HTTP 同源代理 → API → PostgreSQL/Worker；任务不写 IndexedDB |

`complete` 是 Vite 的完整模式名称。`local` 是 Vite 保留的环境文件名称，因此没有使用 `--mode local`。不要把完整模式的开发服务器发布到公网。容器内部监听 `0.0.0.0`，宿主端口只发布到 `127.0.0.1`；数据库没有宿主发布端口。

## 2. 从干净环境启动

需要已有 Docker Engine/Compose；主机开发目标为 Node.js 24.20.0、npm 11.19.0。Windows 本轮使用已安装的 WSL Ubuntu Docker Engine。没有修改镜像源，也没有安装系统软件。

1. 复制 `.env.example` 为 `.env`，用四个独立随机值替换占位符。不要覆盖已有 `.env`，不要把内容贴入日志或 Git。
2. 本轮将 `TRACEPBL_PROVIDER_MODE` 设为 `fake`，保持 `TRACEPBL_AI_ENABLED=false`、`TRACEPBL_URL_FETCH_ENABLED=false`。`disabled` 仍为仓库默认值；无需真实 API key。
3. 执行：

```powershell
docker compose up --build -d
docker compose run --rm -e TRACEPBL_SYNTHETIC_FIXTURES=true runtime-init node --experimental-strip-types database/scripts/seed-integration.ts
curl.exe --noproxy "*" --fail http://127.0.0.1:8787/health/ready
```

首次启动依次执行空库迁移、运行角色配置和 checkpointer 初始化。seed 是明确选用的六条“非真实史料”合成记录；可重复运行，不覆写历史来源。fake 生成内容用于测试操作链，不能作为历史知识或模型质量证据。合成向量为固定 1024 维单位向量，只用于可重复检索测试；不得把这批向量当成真实 embedding-3 结果混用。

打开 `http://127.0.0.1:5173`：填写合成课程 → 确认问题 → 查看全部目录并选六条合成材料 → 组织证据 → 活动 → 量规 → 运行服务器设计检查 → 载入最新内容 → 最终确认和下载。在问题、证据、活动和量规的具体栏目旁点击“模拟 AI”按钮；生成直接填入可编辑草稿，可撤销、修改或替换一项。用页底“确认…并…”一次保存；不自动确认下一步。

OpenAPI 3.1 由当前 API 代码生成，地址为 `http://127.0.0.1:8787/openapi.json`。避免拿旧后端搭配新前端；当前 HTTP 合同版本为 1.1.0，数据库组件为 0004。

停止：`docker compose down`。该命令保留数据卷。不要使用 `down -v` 清理已有用户数据库。未删除任务持续保存；产品中的任务删除立即隐藏，24 小时内可撤销，到期由 Worker 清理。

## 3. 自动验证

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

数据库测试必须使用独立临时数据库，不得连接正在编辑的工作库。测试会建立合成任务，并配置测试用运行角色密码。正常工作 API/Worker 不得同时运行，以免竞争测试队列。

CI 顺序为 `npm run test:integration`、`npm run test:e2e`、`npm run test:stage11`。所需 `TRACEPBL_TEST_DATABASE_URL`、运行角色测试 URL 和 migrator URL 见 `.github/workflows/ci.yml`。`test:integration` 包含 checkpointer 初始化；遗漏这一项会出现 `agent.checkpoints does not exist`，不算测试通过。

本轮真实浏览器测试复用已有 Playwright，不自动安装依赖或浏览器：

```powershell
$env:TRACEPBL_PLAYWRIGHT_MODULE = '已有 Playwright 安装的绝对路径/index.mjs'
npm run test:browser:local
```

该测试要求 localhost:5173 已运行且 runtime 为 fake，使用全新浏览器上下文，拦截所有外部请求，测试四类建议的教师采用、Word/PDF 下载、连续刷新、断线恢复、三种屏宽及无 IndexedDB 任务数据。输出在忽略目录 `.tracepbl/stage11-browser-verification/`。重复完整测试仍遵守每天 20 次生成上限；达到上限时等待窗口或另用新的独立测试数据库，不能调大预算制造通过。

## 4. 失败时如何恢复

- 保存失败：当前页面保留草稿；版本冲突时先保存自己的文字，再载入服务器最新内容比较。不要把刷新当作保存。
- 网络中断：进度会断开，恢复网络后重连并查询持久任务列表；浏览器关闭不取消后台任务。
- 生成失败或取消：已确认内容保留；使用当前步骤的生成按钮，按当前保存修订重新发起。不是恢复一个已终止 job。
- 过期建议：服务器拒绝采用；先载入当前任务，再重新生成。取消了待教师审阅的任务也不能继续采用。
- 导出失败：未成功生成文件不显示下载成功；同一文件名/格式的重试沿用操作键。正文来自签发时冻结修订，当前编辑不会改写旧教学包。
- Docker 拉取失败：保留明确失败输出，排查官方镜像连接；不得擅自换镜像源或上传数据绕过。

## 5. 本轮环境证据

独立 Compose 项目 `tracepbl-stage11-final-20260905`；临时配置 `.tracepbl/stage11-20260905-1224.env` 仅为本轮生成的合成凭据，不归档。前一轮独立项目 `tracepbl-stage11-20260905-1224` 的 API/Worker/Web 已停止，测试卷保留。`output/` 未触碰。

CP-11-02 教师理由字段已批准并验证。理由恢复/编辑/失败重试的独立浏览器验证：`node tests/stage11.reason.browser.mjs`，沿用已有 Playwright 模块设置及 fake 本地服务；不调用模型。

静态构建边界复验：先 `npm run build`，在 `apps/web` 执行 `npm exec -- vite preview --host 127.0.0.1 --port 5174 --strictPort`，再从根目录执行 `node tests/stage11.demo.browser.mjs`（沿用同一已有 Playwright 模块环境变量）。测试验证 Demo 不访问后端，不能用完整模式的截图替代。

Windows/WSL 预览时，保持一个前台终端运行 `wsl -d Ubuntu --exec bash --noprofile --norc`，避免 WSL 因没有前台进程而退出。关闭该终端或休眠可能中断本地预览；这不是公网或开机常驻服务。Compose 长期服务（含 PostgreSQL）使用 `unless-stopped`，WSL/Docker 再次启动后恢复；主动 `compose down` 仍可停止并保留卷。入口失败应显示提示，可同页重试，不必连续点击。

栏目标题下的简短状态和“使用说明”解释当前 fake 模式及真实 AI 的后续启用条件；本轮不启用真实模型。运行检查后用“更新内容”查看结果；失效提示可以定位运行按钮，具体检查项可返回对应工作页。三条本地批注可复验：设置与上文相同的 `TRACEPBL_PLAYWRIGHT_MODULE` 后运行 `node tests/stage11.local-ui.browser.mjs`，会新建独立合成任务，不修改已有备课。

## CP-11-03 当前预览与复验

本轮独立合成预览为 `http://127.0.0.1:25173/`（Compose project `tracepbl-cp1103-preview`，API 仅 127.0.0.1:28787）。原本地 5173 的已有任务、数据库与已用额度保留，web/worker 已更新；5174 静态 Demo 未重建。独立测试/预览数据库不重置原工作区额度，也不提高固定每日预算。

通用 Compose 按本文前面的标准步骤仍默认 5173/8787。若同机多实例，只覆写 web/API 的 localhost 映射及 API 的 `TRACEPBL_ALLOWED_ORIGIN`，每实例使用独立 Compose project/卷；不改变 Vite 内部 api:8787 代理。当前本机忽略文件 `.tracepbl/cp1103-preview.compose.yaml` 保存上述端口覆写，与 `.tracepbl/stage11-20260905-1224.env` 配合启动；该环境文件不归档、不展示内容。

设置已有 Playwright 路径后，可分别运行（均只操作新建合成任务）：

```powershell
$env:TRACEPBL_BROWSER_ORIGIN = 'http://127.0.0.1:25173'
node tests/stage11.inline-ai.browser.mjs
node tests/stage11.inline-recovery.browser.mjs
node tests/stage11.local-ui.browser.mjs
node tests/stage11.browser.mjs
```

第一项验证按栏填入/撤销/单项替换/教师编辑及保存丢响应同键恢复；第二项验证断网、取消、刷新恢复与过期拒绝；第三项验证材料声明、检查定位及布局；第四项完整跑通导出。顺序复验会消耗 fake 的本地计数预算，仍按每日上限处理，不把限额失败说成通过。

生成依据当前已保存的课程/材料。当前窗口可保留待确认草稿；刷新或关闭前先确认保存手工编辑。刷新只能重新取回服务器原始建议。模拟结果可能相同，不代表真实模型质量。教材、学情、原文、授权、核验和最终签发都由教师确认。

Demo 已按用户后续授权同步栏目布局：预生成示例直接可见，按钮恢复示例并可撤销；初次演示检查理由已预填且标注演示边界。静态预览仍为 http://127.0.0.1:5174/tracepbl/，刷新加载新构建即可，不需清空本机数据。tests/stage11.demo.browser.mjs 现在包含全流程、Word/PDF、恢复/撤销与四页三宽度检查，保持 0 API/外部请求。
