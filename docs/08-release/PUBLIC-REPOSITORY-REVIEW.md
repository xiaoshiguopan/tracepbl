# 公开仓库审查记录

输入 main=6d8b886，共 34 个 main 可达提交；355 个当前跟踪路径。无 remote；2026-09-06 用户确认 MIT，根 LICENSE 与素材许可范围说明已补齐，尚未公开。

## 跟踪内容与历史

`node tests/stage12.supply-chain.mjs --scan-only` 本轮实际 exit 1：4 个历史命中均为 tests/stage12.supply-chain.mjs 自身 `BEGIN .*PRIVATE KEY` 扫描规则字符串，人工核对不是密钥。不能把此命令记作 0 findings/exit 0。其余既定高置信模式未发现命中；这不是对所有秘密格式的完备证明。

420 个锁依赖完整性无缺失；4 个 license 字段空白的包已有阶段 12 LICENSE 定点核对（buildcheck MIT、cpu-features MIT/内嵌 Apache-2.0、png-js MIT、ssh2 MIT），本轮不改锁文件。字体 OFL 正文随产物保留。项目自身 MIT 已由用户确认；第三方与独立媒体不被整体改为 MIT。

当前 HEAD 无真实 .env、dump、私钥、运行日志或 output/ 跟踪；.env.example 与明确合成 tests/stage12.synthetic.env 是公开模板/测试值，不是运行秘密。既有 output/ 不暂存、不读取或清理。

`refs/codex/turn-diffs/...` 是本机内部快照引用，包含 output/playwright 图像对象，不属于 main 的文件历史；只允许精确 push main:main，不 --mirror/--all 推送内部引用。未删除、改写这些本机引用。main 历史仍含旧版首页媒体，按既有资产登记是历史审计内容，当前 Pages 产物未重新引入；最终外部授权应明确公开 main 全历史。

可达对象最大为 NotoSansSC-Variable.ttf 17,772,300 字节，最终影片 10,184,415 字节；不是本轮上传成功证据。公开仓库将含历史方案、本地路径示例和合成任务标识，需在最终公开范围批准时明确；不夹带测试 Cookie、真实模型响应或本机秘密。

## 产物与权限

`node scripts/check-pages-artifact.mjs .tracepbl/stage14/build` exit 0：54 文件、37,525,796 字节，扩展名白名单、无 symlink/私有目录、固定 /tracepbl/ base、404 恢复脚本、最终影片/海报 SHA256 一致、无旧影片/洞窟资产。仅上传 apps/web/dist，不打包整个仓库或测试 evidence。

构建仍包含静态 source map 和部分未执行的本地模式前端代码（现役混合导入限制），不含后端可执行服务或密钥；是否连接后端以浏览器零请求证据为准，不把字符串存在当成已外发。PDF 大 chunk 与混合导入 warning 保留。

2026-09-06 用户批准 main 完整历史与指定 Public 仓库/Pages 发布；远端已建立，Secret scanning、Push protection、vulnerability alerts 已启用。只存在 main 远端分支，无 tag 或内部引用。实际 CI/Pages 成功，未请求付费升级；未开展所有账户配额专项审计，未配置自动更新 PR/CodeQL。首段为准备时快照，实际运行见 RELEASE-RECORD.md。
