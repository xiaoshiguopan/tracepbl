# 阶段 12 补充验证报告

日期：2026-09-05。输入归档：2952c53（阶段 13.1），安全实现基线 6bcf716。状态：本轮可执行补验完成，用户已批准本报告 17 路径随本次本地提交归档；阶段 13 暂停。不是生产、真实数据或真实模型批准。

## 本轮结果

| 原未验证项 | 本轮实际结果与边界 |
|---|---|
| 官方镜像冷下载及无缓存构建 | Windows 从 Docker 官方 registry 获取 Node 24.20.0 的全部 5 层，逐项 SHA256 校验后导入 WSL；Docker --no-cache 构建、新 npm 安装和隔离空库完整启动通过。WSL daemon 直接 --pull 仍因官方 token 域名连接超时失败，不能声称标准单命令冷拉取已修复 |
| Windows 原生恢复 | Windows PowerShell + PostgreSQL 18.6 原生客户端执行生产 backup.ps1/restore.ps1 通过；删除清单合并后任务 0、历史保留，非空恢复目标拒绝。服务器仍为隔离 Linux PostgreSQL |
| Firefox / WebKit | 静态 Demo 全流程、下载与三宽度检查通过；本地原位生成/撤销/编辑采用/局部替换，以及断网、取消、刷新恢复、过期拒绝均通过。Firefox 使用 Linux 官方浏览器；WebKit 不等同于 macOS Safari |
| 键盘、200% 缩放 | Chromium 纯键盘贯穿八步、抽屉正反向焦点约束与关闭归还、两种下载通过；原生浏览器 zoom=2，八页无横向溢出；减少动态/强制颜色模拟检查完成 |
| 覆盖率百分比 | V8 单元覆盖率已实测：语句 28.60%、分支 24.81%、函数 24.23%、行 43.50%。未执行源码保留在分母，未把浏览器/数据库结果冒充合并覆盖率；偏低仍是测试深度风险 |
| Office/PDF | 本机 WPS 打开真实 DOCX 并导出 6 页 PDF，检查分页与文字；直接 PDF 5 页。修复标题落在页末、正文转到下页的问题，重新构建、下载、WPS 渲染确认。未安装 Microsoft Word，不能称 Word 实机验证 |

业务代码只增加 DOCX 标题的 keepNext 属性。页面、影片、API、权限、数据库、真实 AI 开关、manifest/lockfile 均未改变。测试增加可选浏览器引擎、隔离地址和证据路径；Demo 重载前等待页面就绪，避免 Firefox 把测试主动中断的模块加载误判为产品错误。没有删除或弱化断言。

## 仍需保留的限制

- 当前机器没有可执行的 macOS Safari/VoiceOver、NVDA 与 Microsoft Word 验证环境；ARIA 快照、WebKit、WPS 分别只是补充证据。Windows Firefox 原生启动遇到 SideBySide/mozglue 装配错误，保留失败日志，Linux Firefox 通过不替代 Windows 组合。
- 未执行物理断电、磁盘损坏、真实教师专业评审、真实模型质量/账号可调用性、远端 CI、公开 Pages 目标网络访问。均不能由本次合成环境测试代替。
- Docker daemon 的直接冷拉取网络问题仍在；官方来源下载与无缓存构建已有证据，无镜像源切换或全局网络配置修改。
- 公开模型文档只完成只读核对，未得到完整可冻结的 GLM 输入/输出/缓存计价档案，因此继续 fail closed。不得用 Coding Plan 积分或价格比例替代 API 单价。
- PDF 大 chunk 与混合导入警告继承原记录，没有抬高阈值或隐藏警告；覆盖率没有人为设置“通过线”。

上述项需要未来指定设备、专业人员或专门外部授权，本轮不要求用户立即介入。未自动推进阶段 13，也不宣称全部发布条件已满足。

## 交付与精确归档范围

验证命令、工具版本、失败保留和证据位置见 [验证记录](./STAGE-12-FOLLOWUP-VALIDATION.md)，概念解释见 [学习卡](./LEARNING-CARD-12-FOLLOWUP.md)。用户已明确回复“批准归档”；以下 17 路径为本次本地提交的精确归档清单：

1. apps/web/src/teaching-pack-export.ts
2. docs/00-governance/PROJECT-STATE.md
3. docs/README.md
4. docs/07-quality-security/STAGE-12-REPORT.md
5. docs/07-quality-security/STAGE-12-VALIDATION.md
6. docs/07-quality-security/STAGE-12-FOLLOWUP-REPORT.md
7. docs/07-quality-security/STAGE-12-FOLLOWUP-VALIDATION.md
8. docs/07-quality-security/LEARNING-CARD-12-FOLLOWUP.md
9. tests/stage11.demo.browser.mjs
10. tests/stage11.inline-ai.browser.mjs
11. tests/stage11.inline-recovery.browser.mjs
12. tests/stage12.runtime.mjs
13. tests/stage12.browser-fixture.sql
14. tests/stage12.coverage.config.ts
15. tests/stage12.followup.compose.yaml
16. tests/stage12.keyboard-zoom.browser.mjs
17. tests/stage12.windows-restore.ps1

共 17 路径。output/、忽略目录 .tracepbl/、浏览器 profiles、工具缓存、合成 dump 与清单不入 Git，全部保留。报告之外没有归档授权；既有归档批准不沿用到本轮。
