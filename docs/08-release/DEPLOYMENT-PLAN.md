# 静态 Demo 发布执行方案（xiaoshiguopan/tracepbl）

> 2026-09-06 执行批准：用户明确回复“批准归档并发布到上述地址”，授权报告 19 路径本地归档、新建 xiaoshiguopan/tracepbl Public、仅推送 main、通过 CI 后发布 GitHub Pages。以下此前待批准文字为准备历史；本次不含 tag、付费、真实模型或阶段 15。

当前执行已完成：Public 仓库、仅 main 推送、同 SHA CI、Pages 与公网验证均通过，见 RELEASE-RECORD.md。下文准备语句为批准前历史。

准备时：2026-09-06 用户确认 MIT 并要求直接动工；已通过 gh api user 核实账号 xiaoshiguopan，gh repo view 未找到 xiaoshiguopan/tracepbl。目标为新建该 Public 仓库，MIT 已落地；最终精确外部批准单如下。

## 候选与发布门禁

代码基线 6d8b886，加本阶段获批归档后的候选提交。目标 Public 仓库 https://github.com/xiaoshiguopan/tracepbl；预期体验 URL https://xiaoshiguopan.github.io/tracepbl/，这不是已存在或已验证的体验链接。无自定义域名、收费托管或后端服务。

Pages 工作流仅 workflow_dispatch，不在 push 时自动发布。需要 approved=true、main 分支、仓库名 tracepbl，并查证同 SHA 的 push CI 已成功。build 只上传 apps/web/dist；deploy job 单独获得 pages:write 与 id-token:write，使用 github-pages environment。Action 固定提交 SHA。

## 精确动作顺序

1. 已核实 xiaoshiguopan 账号，已按用户决定补齐 MIT LICENSE 和 THIRD-PARTY-NOTICES；本地既有文件与影片不变。
2. 展示最终候选 SHA、目标 Public 仓库、完整 main 历史、制品清单、免费静态托管边界和回滚方式，取得本次明确外部授权。
3. 经授权创建或使用指定 Public 仓库；如已有内容先只读核对，禁止覆盖。配置 origin 后只推送 `main:main`；禁止 --mirror、--all、force 或附带 refs/codex 内部引用。
4. 等待 CI 在该 SHA 实际成功，核对运行 URL/日志。失败则停止，不能直接跳过检查发布。
5. 经授权将 Pages source 设为 GitHub Actions，并在平台允许范围启用 Secret scanning/Push protection/依赖提醒等保护。不得借此配置真实模型 secret。
6. 对已批准 SHA 的 main 手动触发 Publish static Demo；记录产物与运行 ID、实际 page_url。
7. 使用未登录新浏览器检查真实 URL、深层刷新、手机、完整 Demo 流程和下载。任一发布阻断失败就按回滚计划处理。
8. 将实际公开 URL 写入 README 和发布记录；后续提交与再次 push 仍按本次明确授权范围执行，不自动扩大。

## 本地依据

[GitHub 官方 Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)支持静态 artifact 与独立部署权限；[官方 404 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site)用于本地模拟缺失深层路由。这里没有换部署技术，也未实际调用远程写 API。

## 本次精确批准单

- 本地归档：STAGE-14.1-REPORT.md 最终列明的 19 路径；不包含 output/、忽略日志/截图、refs/codex 快照。
- 远端目标：当前已登录账号 xiaoshiguopan 下新建 tracepbl，Public；若执行时仓库已存在，先核对，不能覆盖。
- 公开内容：候选提交与 main 可达完整工程历史（含已归档历史设计和旧媒体），不公开内部工具引用、本机未跟踪文件或数据库。只执行 main:main 正常推送，不 force、mirror、all、tag。
- 服务：GitHub Pages 纯静态 Demo；无公网后端、真实模型、域名或购买。免费公共仓库/Pages 范围内运行，若平台要求付费则停止。
- 执行：推送后等待该 SHA 的 CI，通过后配置 Pages source=workflow，手动运行 approved=true；核验实际 page_url 与访客流程。
- 发布后：README 回填实际体验 URL 与发布记录，后续归档/推送仅在用户明确纳入授权时执行；不启动阶段 15。
- 回滚：首发失败保留日志并停止发布；若已错误公开，按 ROLLBACK-PLAN 处理，涉及撤销公开需相应授权。

上述动作已按用户“批准归档并发布到上述地址”执行；部署 SHA 6706601，实际运行及文档回填范围见报告和 RELEASE-RECORD.md。
