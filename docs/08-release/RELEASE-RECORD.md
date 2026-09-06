# 发布记录

状态：2026-09-06 已发布并验证。用户明确批准“批准归档并发布到上述地址”；仅公开静态 Demo，未部署后端。

| 字段 | 当前值 |
|---|---|
| 输入基线 / 首次归档 | 6d8b886 / 99f3714（原报告 19 路径） |
| 部署 SHA | 670660194214426ee73a1461f5b27db29da43702 |
| 公开仓库 | [xiaoshiguopan/tracepbl](https://github.com/xiaoshiguopan/tracepbl)，Public，仅推送 main |
| 实际体验 URL | [史证工坊 Demo](https://xiaoshiguopan.github.io/tracepbl/) |
| 同 SHA CI | [34018579886](https://github.com/xiaoshiguopan/tracepbl/actions/runs/34018579886)，success |
| Pages 运行 | [34018703725](https://github.com/xiaoshiguopan/tracepbl/actions/runs/34018703725)，success，2026-09-06 07:17 UTC（北京时间 15:17） |
| 制品 | apps/web/dist；54 文件、37,522,358 字节；最终影片/海报检查通过 |
| 上传包 | artifact 9984758929；24,136,647 字节；SHA256 e301873c26635decd9cf9a495b4cbd73956e4b25de5332c6de393a8fd6d4e38d |
| Pages 设置 | build_type=workflow，public=true，https_enforced=true，无自定义域名 |
| 安全保护 | Secret scanning / Push protection / vulnerability alerts 已启用；未配置自动更新 PR 或 CodeQL |
| 访客验证 | 全新未登录 Chromium；完整 Demo、预填、替换撤销、刷新、Word/PDF、深层 404 恢复、未知任务安全落页、字体及桌面/手机宽度通过 |
| 网络边界 | API/外部请求 0，pageErrors 0，IndexedDB 存在；无模型调用 |
| 回滚基线 | 本次成功版本 6706601；未执行回滚 |

## 发布期间修复与有效证据

1. [首轮 CI](https://github.com/xiaoshiguopan/tracepbl/actions/runs/34018133092) 失败：workspace tests 先于数据库角色/checkpointer 初始化。`5569773` 仅移动既有 integration 步骤到 npm test 前，保留全部检查。
2. [第二轮 CI](https://github.com/xiaoshiguopan/tracepbl/actions/runs/34018349184) 集成通过，但重复 workspace API 测试失败：固定请求编号重用旧任务，同时重复保存相同 context 撞到不可变历史唯一约束。`6706601` 按现役内容保存策略复用已有相同历史；每轮测试使用独立请求编号，新增相同内容再次保存、锁版本递增、历史 ID/hash 不变断言。旧迁移、权限、审计与乐观锁均保留。
3. 最终 CI：数据库 18、API 集成 7、checkpointer 1；workspace 108（含再次执行的 API/checkpointer）；后端 E2E 1、阶段 11 跨层 13、阶段 12 安全 8；typecheck/lint/build/audit/format 均通过，生产依赖漏洞 0。重复测试次数不算独立覆盖数。
4. Pages 同 SHA 门禁成功，只上传 dist。公网浏览器 exit 0；验证与截图在忽略的 `.tracepbl/stage14/public-demo/`，不会上传。公网制品与本地准备制品字节数不同是独立构建事实，不以旧本地字节数冒充远端制品。

原 19 路径外的必要发布修复精确为 `.github/workflows/ci.yml`、`apps/api/tests/api.integration.test.ts`、`packages/database/src/index.ts`。发布后文档回填清单见阶段报告。本站仍部署上述 SHA；后续仅文档提交不会自动重新部署。

## 保留限制

公开验证来自本机当前网络及 Chromium 视口模拟，不代表真实手机硬件、全部地区网络、Safari/辅助技术或真实教学验收。PDF 大分块、现役混合导入以及固定 Action 的 Node 运行时弃用警告仍在；本次实际 CI/部署成功，不据此声称警告消失。未购买服务、读取本机密钥、调用真实模型或导入真实数据；没有 tag/force/mirror/内部引用推送。`output/` 保持既有未跟踪。
