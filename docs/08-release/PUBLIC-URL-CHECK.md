# 静态 URL 验证记录

状态：2026-09-06 本地模拟及实际公网访客验证均已通过。以下前段保留发布前证据。

`tests/stage14.pages.browser.mjs` 启动仅 localhost 的临时 HTTP 服务：文件不存在时真正返回 404.html/HTTP 404，不使用 Vite 的自动 SPA index fallback。运行时仅允许同源静态请求，API/外部请求立即阻断并使断言失败。

最终 `node tests/stage14.pages.browser.mjs` exit 0，证据 `.tracepbl/stage14/browser-1788617371829/result.json`：

- 深层 context URL 原始请求 HTTP 404；现役 404.html 保存路径、跳根页并恢复路由，表单正常出现。
- 填写合成表单后进入探究问题，刷新仍停留该页面。
- 未知任务显示“此任务不可使用”，不显示任务表单。
- fonts.css 已载入；首页 1440/390/320 无横向溢出；截图保留。
- API/外部请求 0、pageErrors 0。

第一次测试使用错误的标题选择器“无法”，超时；阅读现役 WorkbenchShell 后改为精确标题，复跑通过，无产品代码修改。

复验：先 `npm run build`，再设置 TRACEPBL_PAGES_BUILD 指向静态产物、TRACEPBL_PLAYWRIGHT_MODULE 指向已有 Playwright 模块，运行该脚本。当前默认读取本机 .tracepbl/stage14/build。完整 Demo 教学包/下载沿用阶段 11/12 有效证据；本轮新增验证仅覆盖 Pages 托管特性。

本地 404 模拟本身不证明公网可用，实际公网结果如下。

## 实际公网验证（2026-09-06）

目标 [https://xiaoshiguopan.github.io/tracepbl/](https://xiaoshiguopan.github.io/tracepbl/)；部署 `6706601`，Pages 运行 34018703725 成功后执行。全新 Chromium context，无登录状态，公开合成输入；仅允许 xiaoshiguopan.github.io 静态请求，其余请求及 /api/ 均计为失败。

沿用 `tests/stage11.demo.browser.mjs` 的完整流程断言，在忽略的 `.tracepbl/stage14/public-demo.mjs` 将目标固定为已批准的公网 origin，并加入 `tests/stage14.pages.browser.mjs` 的 404/未知任务/字体/首页检查。设置现有 TRACEPBL_PLAYWRIGHT_MODULE 后运行 `node .tracepbl/stage14/public-demo.mjs`，exit 0。该执行脚本、截图与结果仅留本地；可按上述两个已归档脚本的同样断言复验，不需安装依赖或真实数据。

- 首页进入、教学情境到终审完整链通过；合成内容预先显示，替换及撤销正常。
- IndexedDB 存在，刷新保留当前页；公开深层请求返回 HTTP 404，现役恢复脚本正常工作。
- 未知任务“此任务不可使用”，不出现任务表单；字体样式表载入。
- Word/PDF 下载各成功一次；本轮不重复宣称实体 Word 软件版式验收。
- question/evidence-map/lesson/rubric 在 1774/390/320 宽度无溢出，量规桌面表头与内容列对齐；首页 1440/390/320 无溢出。已查看桌面量规截图。
- API/外部请求 0，pageErrors 0。

证据 `.tracepbl/stage14/public-demo/`；此为当前网络、浏览器模拟手机宽度，非真机/跨地区网络覆盖。
