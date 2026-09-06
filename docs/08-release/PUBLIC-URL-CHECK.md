# 静态 URL 验证记录

状态：本地 Pages 行为模拟已通过，公网验证未执行。没有已发布的公开 URL。

`tests/stage14.pages.browser.mjs` 启动仅 localhost 的临时 HTTP 服务：文件不存在时真正返回 404.html/HTTP 404，不使用 Vite 的自动 SPA index fallback。运行时仅允许同源静态请求，API/外部请求立即阻断并使断言失败。

最终 `node tests/stage14.pages.browser.mjs` exit 0，证据 `.tracepbl/stage14/browser-1788617371829/result.json`：

- 深层 context URL 原始请求 HTTP 404；现役 404.html 保存路径、跳根页并恢复路由，表单正常出现。
- 填写合成表单后进入探究问题，刷新仍停留该页面。
- 未知任务显示“此任务不可使用”，不显示任务表单。
- fonts.css 已载入；首页 1440/390/320 无横向溢出；截图保留。
- API/外部请求 0、pageErrors 0。

第一次测试使用错误的标题选择器“无法”，超时；阅读现役 WorkbenchShell 后改为精确标题，复跑通过，无产品代码修改。

复验：先 `npm run build`，再设置 TRACEPBL_PAGES_BUILD 指向静态产物、TRACEPBL_PLAYWRIGHT_MODULE 指向已有 Playwright 模块，运行该脚本。当前默认读取本机 .tracepbl/stage14/build。完整 Demo 教学包/下载沿用阶段 11/12 有效证据；本轮新增验证仅覆盖 Pages 托管特性。

实际部署后仍需从全新、未登录浏览器访问真实 page_url，重复核心流程及手机检查；本地 404 模拟不能证明 GitHub 服务状态、目标网络延迟或域名设置正确。
