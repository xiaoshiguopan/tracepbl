# 阶段 14.1 公开发布准备报告（准备完成）

> 2026-09-06 执行批准：用户明确回复“批准归档并发布到上述地址”，授权报告 19 路径本地归档、新建 xiaoshiguopan/tracepbl Public、仅推送 main、通过 CI 后发布 GitHub Pages。以下此前待批准文字为准备历史；本次不含 tag、付费、真实模型或阶段 15。

日期：2026-09-05。输入基线 6d8b886。2026-09-06 更新：本地准备已完成；用户确认 MIT 并要求直接动工，已核实账号 xiaoshiguopan，具体化目标 xiaoshiguopan/tracepbl；最终发布批准单见 DEPLOYMENT-PLAN.md。没有归档、推送、远程创建或部署授权。

## 已完成

- 核对阶段 13.2 与阶段 12 补验归档和保留限制；开工只有既有 output/ 未跟踪，无 remote。
- 建立 Pages 手动发布工作流：main、显式 approved、仓库名 tracepbl、同 SHA push CI 成功门禁；独立最小部署权限，只上传 apps/web/dist。
- 当前前端与容器代码比较仅 DOCX keepNext 一行不同；挂载该最终源码，在 Node 24.20.0/npm 11.19.0 镜像以 --network none 执行 npm run build，exit 0。这里的 typecheck 针对镜像内已归档代码；不是本轮新工作流的远端 CI 执行。保留 PDF chunk 与混合导入警告。
- 静态产物检查 exit 0：54 文件、37,525,796 字节；最终影片/海报 SHA256、固定 base、404 文件、无私有目录/符号链接/旧媒体。
- 模拟 Pages 真正 404 的浏览器实测 exit 0：深层进入、刷新、安全落页、字体和三宽度通过，零 API/外部请求与页面异常。
- 新测试/产物检查脚本 ESLint exit 0；Pages YAML 可解析，手动触发/默认不批准/制品路径/部署权限断言通过；git diff --check 通过。
- 扫描 34 个 main 提交及当前候选，既定秘密模式只命中扫描器自己的规则文本。原扫描 exit 1、四项命中如实保留并人工归类，不冒充零命中。锁依赖许可缺省项沿用阶段 12 定点核查。
- 核实 refs/codex 内部快照包含本机 output 图像对象，不在 main 路径历史，发布计划禁止 --mirror/--all。不删除或修改任何内部引用/用户 output。

官方 Action 标签只读核对：upload-pages-artifact v3→56afc609e74202658d3ffba0e8f6dda462b719fa；deploy-pages v4→d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e。通过 git ls-remote 官方仓库验证，未执行这些 Action。现役 checkout/setup-node 固定 SHA 复用原 CI。

## 等待的决定与限制

- GitHub 账号通过已登录 gh api user 核实为 xiaoshiguopan；gh repo view 未找到目标 tracepbl。没有猜测凭据或创建远程。
- MIT 已获用户确认，根 LICENSE 与 THIRD-PARTY-NOTICES 已写入；版权署名为公开账号与贡献者。未把字体或第三方史料改为 MIT。
- 精确外部方案现已完成，目标 Public 仓库、main 全历史、Pages、费用与回滚均已明确；等待本地归档和该精确外部动作批准。

实际公网、远端 CI、安全扫描保护设置、平台配额与最终公共内容许可确认未验证。阶段 12 的设备/真实教师/真实模型/物理故障限制保持。没有开通收费服务、读密钥或调用模型，没有更改已确认视觉、产品、API、数据库或技术栈。

## 产物索引与当前路径范围

以下 19 路径为最终本地归档清单，等待批准；外部动作单列于 DEPLOYMENT-PLAN.md：

1. README.md
2. docs/README.md
3. docs/00-governance/PROJECT-STATE.md
4. .github/workflows/pages.yml
5. scripts/check-pages-artifact.mjs
6. tests/stage14.pages.browser.mjs
7. docs/08-release/ENVIRONMENT-MATRIX.md
8. docs/08-release/VARIABLES-AND-SECRETS.md
9. docs/08-release/DEPLOYMENT-PLAN.md
10. docs/08-release/DATABASE-MIGRATION-PLAN.md
11. docs/08-release/ROLLBACK-PLAN.md
12. docs/08-release/RELEASE-CHECKLIST.md
13. docs/08-release/RELEASE-RECORD.md
14. docs/08-release/PUBLIC-REPOSITORY-REVIEW.md
15. docs/08-release/PUBLIC-URL-CHECK.md
16. docs/08-release/LEARNING-CARD-14.1.md
17. docs/08-release/STAGE-14.1-REPORT.md
18. LICENSE
19. docs/08-release/THIRD-PARTY-NOTICES.md

证据在忽略的 .tracepbl/stage14/：history-scan.json、build/、browser-1788617371829/；不会推送。构建/扫描/官方 SHA/YAML/ESLint 具体命令和结果保留在本任务记录，URL 行为详见 PUBLIC-URL-CHECK.md。等待归档与精确外部批准期间继续保留现有运行环境，不清理或改写历史。
