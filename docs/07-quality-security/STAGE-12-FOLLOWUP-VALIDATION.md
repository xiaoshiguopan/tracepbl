# 阶段 12 补验验证记录

日期：2026-09-05。基线 2952c53；本轮 17 路径清单见 [报告](./STAGE-12-FOLLOWUP-REPORT.md)。所有相对证据路径均位于本机忽略目录 `.tracepbl/stage12-followup/`，不包含秘密或用户资料，不纳入 Git。

## 环境与实际命令

宿主 Node 24.19.0/npm 11.17.0，WSL Node 22.22.1 用于 Firefox 驱动；生产构建在官方 Node 24.20.0/npm 11.19.0 容器完成。PostgreSQL 18.6/pgvector 0.8.6。Playwright 1.62.1，Chromium 151.0.7922.34、Firefox 153.0（Linux）、WebKit 26.5（Windows）。未改全局安装、镜像源、生产依赖、密钥或数据库契约。

### 官方下载、无缓存构建和启动

`docker build --pull --no-cache -f Dockerfile.backend -t tracepbl-stage12-followup .` 首次失败：WSL 到 auth.docker.io 超时，未进入构建。日志 `docker-cold-build.log` 保留。Windows 同一官方端点可连接，使用只读匿名 registry API 下载 library/node:24.20.0-bookworm-slim 的 amd64 清单/config/五层；下载内容逐项核验 SHA256，解压层 diffid 也核对，再制作 docker load tar。没有换源或上传项目数据。

- 官方多架构 index：`sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e`
- amd64 manifest：`sha256:6642ef280aebc09c4541bee0b15c9f89f0f3f3c247ddee79ae1d37eddfdcbbaa`
- `official-node/provenance.json`、`official-pull.log`、`docker-load.log` 保存来源/完整性和结果；本机辅助脚本 `pull-official.py` 在忽略目录保留，只作此次环境取证，不变成产品安装器。
- 导入后 `docker build --no-cache -f Dockerfile.backend -t tracepbl-stage12-followup .` exit 0，npm 安装实际重新执行；日志 `docker-fresh-build.log`。最终镜像 index `sha256:1cc3196fe311a26ffb566b089b0424caa9eaabd7f9af42dccfb66383ed1c1737`。
- `docker compose --env-file tests/stage12.synthetic.env -p tracepbl-stage12-followup -f compose.yaml -f tests/stage12.followup.compose.yaml up -d --no-build` 在新卷运行 runtime-init/API/Worker/Web/PG，通过；日志 `fresh-start.log`。Web 48173、API 48787 均仅绑定 127.0.0.1，PG 无宿主端口。
- 对该 Web 运行 `TRACEPBL_BROWSER_ORIGIN=http://127.0.0.1:48173 node tests/stage12.runtime.mjs` exit 0：外部清单删除、相同键重放、删除后不可见、撤销可见、no-store 均通过（执行输出留于本任务工具记录）。

复验时用全新的 project 名，禁止挂载现有预览卷。标准网络可用时可直接官方拉取后执行无缓存构建；本轮没有证明 WSL 的标准冷拉取已修复。

### Windows 原生备份/恢复

官方 PostgreSQL Windows 下载页链接 EDB binaries，使用 [EDB 官方 ZIP](https://get.enterprisedb.com/postgresql/postgresql-18.6-3-windows-x64-binaries.zip)，SHA256 `59f8ce701c63c2ed623c665a5e51b3ef6f2e37ccf837b68ffeed0742d0ae6abd`。下载超时后用 Range 从已有精确字节续传，最终长度 344414106 字节。只解出用户工具缓存 bin 文件，不执行系统安装。

隔离容器 `tracepbl-stage12-win-drill` 使用 pgvector/pgvector:0.8.6-pg18-bookworm，绑定 127.0.0.1:45432，密码为脚本中明示的合成专用值；未连接预览库。命令：

```powershell
./tests/stage12.windows-restore.ps1 `
  -ClientBin C:/Users/10342/.cache/tracepbl-stage12-tools/pgsql/bin `
  -EvidenceDirectory C:/Users/10342/.cache/tracepbl-stage12-tools/win-drill-20260905-1
```

本次 exit 0；脚本为新 DB 生成合成数据，调用生产 backup.ps1、restore.ps1，恢复后任务数 0、独立删除历史保留；重复恢复至非空目标明确拒绝。`windows-restore.log` 保留成功和原生客户端警告。复验必须换一个不存在的 EvidenceDirectory；dump/manifest/最新清单保留在仓库之外。Windows 客户端与 PowerShell 已实测，Linux PG 服务端不能冒充 Windows 服务端或物理断电测试。

### 多浏览器主链和失败恢复

三个现有浏览器脚本增加 `TRACEPBL_BROWSER_ENGINE`（默认 chromium）、`TRACEPBL_BROWSER_ORIGIN`（仅 loopback）和 `TRACEPBL_BROWSER_EVIDENCE`。`TRACEPBL_PLAYWRIGHT_MODULE` 指向已有 playwright-core/index.mjs，不新增项目依赖。

```powershell
$env:TRACEPBL_BROWSER_ENGINE='webkit'
$env:TRACEPBL_BROWSER_ORIGIN='http://127.0.0.1:50173'
$env:TRACEPBL_BROWSER_EVIDENCE='.tracepbl/stage12-followup/webkit-recovery'
node tests/stage11.inline-recovery.browser.mjs
```

Linux Firefox 同样运行三个脚本，使用官方 Playwright Firefox；缺少的 libasound2t64 只从 Ubuntu apt 下载并 dpkg-deb 解到用户缓存，通过进程级 LD_LIBRARY_PATH 使用，不系统安装。Windows Firefox 两次启动遇到 SideBySide/mozglue，保留 `firefox-demo.log` 和 retry 日志。

| 脚本/对象 | 最终结果 | 证据 |
|---|---|---|
| Demo / WebKit | 全流程、2 下载、4 页×3宽度、无 API/外部请求/页面异常 | webkit-demo.log |
| Demo / Firefox Linux | 同上；浏览器结果 passed | firefox-demo-final-3.log、firefox-demo-final-3/；外层 shell 退出清理 kill 参数错误单列，不能把整个包装命令称为 exit 0 |
| inline-ai / WebKit | 4 用途、撤销保留其他编辑、教师编辑采用、丢响应同键、历史、单项替换、响应式通过 | webkit-local-final.log |
| inline-ai / Firefox Linux | 同上，exit 0 | firefox-local-final.log |
| inline-recovery / WebKit | 断网恢复、取消不填入、取消后采用拒绝、刷新找回未确认、过期拒绝且草稿保留；exit 0 | webkit-recovery/result.json |
| inline-recovery / Firefox Linux | 同上，exit 0 | firefox-recovery/result.json |

WebKit 和 Firefox 分别用独立项目 tracepbl-stage12-webkit（50173/50787）、tracepbl-stage12-firefox（51173/51787）。测试私有 overlay 保留在证据目录。`tests/stage12.browser-fixture.sql` 只向这些测试目录库插入 6 条明确合成材料、版本、chunks 与 fake 1024 维向量，不修改应用门禁。最初没有 chunks 的 fixture 被 EVIDENCE_INSUFFICIENT 拒绝；修复 fixture 后通过，原失败日志保留。Demo 主链重载前等待“探究问题”标题，避免人为中断异步加载；没有过滤新增错误。

### 键盘、原生缩放、颜色和导出

`TRACEPBL_BROWSER_ORIGIN=http://127.0.0.1:45176 TRACEPBL_BROWSER_EVIDENCE=.tracepbl/stage12-followup/keyboard-final node tests/stage12.keyboard-zoom.browser.mjs` exit 0。45176 是本次修复后的隔离静态构建预览，不替换用户原预览产物。

- 键盘完成八步；抽屉 Tab/Shift+Tab 各 30 次约束在弹窗内，Escape 后焦点回“我的备课”；Word/PDF 下载成功。
- 独立测试 profile 的本地扩展 chrome.tabs.setZoom/getZoom 实测 2；innerWidth 1427→713，devicePixelRatio 1.25→2.5，visualViewport.scale 保持 1。不是 CSS zoom 或只改 viewport。
- 八页 document 宽度无横向溢出；用浏览器 captureVisibleTab 保存真实像素 top/bottom 截图。早期 Playwright fullPage 在原生缩放下截图裁切，改取原生截图，不改产品布局。最终已检查量规顶部原生截图。
- reduced-motion/forced-colors 为浏览器媒体模拟，并保存截图和 ARIA 快照；不等价于 Windows 读屏、完整系统高对比、400% 或真实 Safari/VoiceOver。
- `keyboard-final/result.json`、各页截图、synthetic-demo.docx/pdf 是最终证据。用已有 WPS 12.1.0.19302 隐藏 COM 实例只读打开本次 DOCX，ExportAsFixedFormat 生成 synthetic-demo-wps.pdf；实例关闭，不调用云转换。
- WPS 初始渲染发现活动 2 和使用说明孤立标题；只添加 DOCX 段落 keepNext。目标 Node 24.20.0 镜像挂载该源码执行 `npm run build` exit 0（`export-build.log`），然后重新键盘导出并 WPS 渲染，6 页 contact sheet 检查标题已随第一段移动、未发现重叠。直接 PDF 5 页；PDFium/pypdf 本地渲染提取，不是 Word 实机验证。

### 覆盖率与静态检查

`node node_modules/vitest/vitest.mjs run --config tests/stage12.coverage.config.ts` exit 0：100 passed、7 DB 项仅此单元命令跳过。数据库集成有效证据继承原归档，不把跳过称为通过。V8 provider 4.1.11 在本机忽略工具环境使用，manifest/lockfile 已恢复原值；复验机需提供与 Vitest 匹配的可解析 @vitest/coverage-v8 工具，未将依赖加入生产或项目锁文件。

`coverage-retry.log` 和 `coverage/coverage-summary.json`：语句 1378/4817=28.60%，分支 924/3724=24.81%，函数 326/1345=24.23%，行 1098/2524=43.50%。包含未运行的 apps/packages 源码，不合并浏览器和 DB 覆盖率。首次自定义 provider 解析失败产生的零值报告已保留失败日志，不作为测量结论。

更改的六个 JS/TS 测试文件及导出模块 ESLint exit 0。最后代码构建含整个 typecheck，exit 0；DOCX 一行修复之后的浏览器与 WPS 复验通过。未受影响的安全、数据库和并发测试继承归档证据，不重复宣称本轮全仓重跑。最终 git diff --check 与清单核对另见本任务最后工具输出。

## 公开模型资料，只读复核

2026-09-05 官方 [Embedding-3](https://docs.bigmodel.cn/cn/guide/models/embedding/embedding-3) 标示 0.5 元/百万 Tokens，并明确支持 1024 维。官方 [GLM-5.3-Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash) 确认 Model Code glm-5.3-flash，但介绍中的相对折扣不是完整 API 价格表；pricing 页面抓取只得到 JS 占位。本次没有冻结新价格档案或启用真实调用，也没有把文档可见性当作账号可调用性。价格会变，真实调用前仍需按批准流程核对输入、输出、缓存、有效期、数据处理政策和预算。

## 本轮边界与保留

既有 output/、预览数据库、已通过证据全部保护。浏览器/工具下载、合成测试容器与新卷、备份和截图保留以便复验，不执行批量清理。只有本轮报告列明的 17 路径可申请本地归档。真实设备/教师/模型/公网和物理硬件限制见报告，未强行把全部未验证项标成通过。
