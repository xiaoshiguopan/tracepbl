# P00 H3 V2 最终接入报告

> 日期：2026-09-05
> 状态：实现与验证完成，经用户批准本地 Git 归档；提交号以包含本报告的 Git 提交为准
> 范围：首页最终影片、静态后备、旧媒体清理、现役前端文档与回归验证

## 1. 目标与结论

用户确认首页改为明亮矿物色的抽象山河影片：笔锋先形成可理解的环绕关系再收卷吸入；中段沿河谷逐渐加速；通过太阳、道路与蓝色山体完成构图匹配；结尾攀升后稳定定格为宏阔史诗全景。用户随后明确允许编码，并要求旧视频不留运行时残余、一次完成。

结论：目标已实现。首页桌面端只播放最终 7.5 秒 H3 V2 成片；窄屏、减少动态和影片失败只显示从同片终帧提取的海报。旧 H3 视频、敦煌移动图和洞窟关键帧已从 `public` 与 production build 删除。没有新增依赖、API、数据库改动或外部部署。

## 2. 实现结果

- `p00-cinematic-h3-v2.mp4` 已由用户确认成片原位替换：H.264、1344×768、24fps、180 帧、7.500 秒、10,184,415B，只有一个视频流。
- 新增 `p00-cinematic-h3-v2-poster.webp`：由 7.42 秒终帧经 FFmpeg 直接提取，1344×768、172,306B，没有重新生成内容。
- 页面保留单次自动播放、终帧保持和低权重重播；新增视频错误回退。桌面媒体出现前的安全底改为明亮蓝色，媒体不再被整体降饱和，暗层只服务顶部与底部文字可读性。
- 移动端与 `prefers-reduced-motion` 不创建视频元素，只显示新终帧海报；320px 与 390px 都不下载 MP4。
- 删除五个旧运行时文件：旧 H3 首版、旧敦煌 JPG/WebP、两张旧洞窟关键帧；原 `v2` 文件内容也被最终成片替换，因此被否决的 9.42 秒版本不再存在。
- 最终文件复制并校验后，删除系统临时目录中的 136 个预演、灰盒、分段和废弃剪辑（约 145MB），并删除独立遗留的旧 H3 原始 MP4 与本轮浏览器截图；仓库既有 `output/` 未触碰。
- 历史阶段报告保留当时文件名和哈希作为审计证据，但现役代码、现役设计、生产资产和构建产物均不使用它们。

## 3. 制作、费用与安全边界

- 两个 MiniMax H3 任务为 `438205307773346`、`438207800136065`，每个任务最多使用五张参考图；最终用 FFmpeg 在共享构图处直接剪接为 7.5 秒。
- 平台返回总用量 16 秒（输入 8 秒、输出 8 秒）；按生成时价格估算约 ¥9.27，未超过用户批准的 ¥9.60。该金额是估算，不冒充实际账单。
- 仓库只保留最终 MP4、同片 WebP 海报与既有字体。MiniMax key、参考图、原始分段、运动试片、接缝试片、联系表和 API 响应均未复制进仓库。
- 影片与海报明确是非史料的 AI 艺术化气氛画面；不连接运行时 MiniMax，不含声音、真实数据、个人信息或学生数据。

## 4. 验证证据

### 4.1 自动化与构建

- 先把首页合同改为期待新海报并排除旧敦煌/旧关键帧，旧实现按预期 1 项失败；实现后 `apps/web/src/workflow.test.tsx` 19/19 通过。
- `npm run typecheck`：退出码 0，根测试与全部工作区通过。
- `npm run lint`：退出码 0，根测试与全部工作区无 ESLint 错误。
- `npm test`：退出码 0；65 项通过，7 项数据库/真实 checkpointer 集成测试按该脚本的既定分入口跳过，没有失败。
- `npm run build`：退出码 0；Vite 转换 56 个模块并生成 production build。`pdfmake` 动态块的既有大包警告仍存在，与首页媒体变更无关。
- `npm audit --audit-level=high`：退出码 0，0 个漏洞。
- `ffprobe`：MP4 为单一 H.264 视频流，1344×768、24fps、180 帧、7.500 秒；没有音频流。
- FFmpeg `blackdetect=d=0.15:pix_th=0.02`：无检出；`freezedetect=n=-50dB:d=0.3`：无检出。
- production `dist/assets/p00/` 与源码资产的 MP4/WebP 哈希一致；两个目录都只包含这两项媒体，五个旧文件均不存在。

### 4.2 真实 Chrome

- 1440×900 刷新：影片 `currentTime=0.009492`、`readyState=4`、正在播放；实际源只指向新 `p00-cinematic-h3-v2.mp4`。
- 播放结束：停在 `7.46/7.5s`、`paused=true`、`loop=false`，重播按钮可见；点击重播后在 0.5 秒检查为 `currentTime=0.639384`、正在播放且按钮隐藏。
- 390×844：视频元素为 0，终帧海报显示，`scrollWidth=390`，主动作高 51.39px；截图目视确认日轮、道路、蓝金山河、标题和入口构图完整。
- 320×800：视频元素为 0，终帧海报显示，`scrollWidth=320`，主动作高 51.39px。
- 1440×900 + `prefers-reduced-motion: reduce`：视频元素为 0，只显示新终帧海报。
- 强制拦截 MP4：视频错误后自动移除，海报、标题和主动作保持可见；控制台只出现该负向测试主动制造的网络失败。
- 正常路径控制台 0 error/0 warning；静态请求只出现新 MP4、新海报和既有字体，没有旧视频、敦煌图或洞窟关键帧请求。

## 5. 已知边界

- 桌面成片为 10.18MB，超出阶段 5 的早期探索预算；这是最终视觉质量与 H3 输出的已确认取舍。移动端不下载该文件，后续如需压缩必须重新做画质对照并获得确认，不能静默降码率。
- Safari、Firefox、读屏、强制高对比和 200%/400% 缩放仍属于后续发布前设备矩阵；本轮没有虚报这些项目。
- 历史 Markdown 仍记录被替换资产的当时事实；Git 历史本身也不会被重写。这些记录不被 Vite 构建，不属于“旧视频运行时残留”。

## 6. Git 归档建议

建议提交消息：

```text
feat(web): replace P00 with final H3 V2 film
```

建议只暂存以下 25 个路径；`output/` 明确不得暂存：

1. `apps/web/public/assets/p00/p00-cinematic-h3-v1.mp4`（删除）
2. `apps/web/public/assets/p00/p00-cinematic-h3-v2.mp4`
3. `apps/web/public/assets/p00/p00-cinematic-h3-v2-poster.webp`
4. `apps/web/public/assets/p00/p00-dunhuang-mobile.jpg`（删除）
5. `apps/web/public/assets/p00/p00-dunhuang-mobile.webp`（删除）
6. `apps/web/public/assets/p00/p00-film-keyframe-matchcut-v1.webp`（删除）
7. `apps/web/public/assets/p00/p00-film-keyframe-reveal-v1.webp`（删除）
8. `apps/web/src/P00Experience.tsx`
9. `apps/web/src/optimization.css`
10. `apps/web/src/styles.css`
11. `apps/web/src/workflow.test.tsx`
12. `docs/00-governance/PROJECT-STATE.md`
13. `docs/03-frontend-design/BROWSER-PERFORMANCE-ASSETS.md`
14. `docs/03-frontend-design/DESIGN-SYSTEM.md`
15. `docs/03-frontend-design/FRONTEND-DEEP-OPTIMIZATION-SPEC.md`
16. `docs/03-frontend-design/HYBRID-3D-OPENING-SPEC.md`
17. `docs/03-frontend-design/PAGE-SPECIFICATIONS.md`
18. `docs/03-frontend-design/PAGE-STATE-MATRIX.md`
19. `docs/03-frontend-design/RESPONSIVE-ACCESSIBILITY.md`
20. `docs/03-frontend-design/USER-FLOWS.md`
21. `docs/03-frontend-design/VISUAL-DIRECTION.md`
22. `docs/03-frontend-design/assets/README.md`
23. `docs/06-development/P00-FINAL-ASSET-REGISTER.md`
24. `docs/06-development/P00-H3-V2-LEARNING-CARD.md`
25. `docs/06-development/P00-H3-V2-REPORT.md`

用户于 2026-09-05 明确回复“批准归档”，因此只允许按上述精确清单进行一次本地提交；仍不授权 `output/`、tag、push、部署或阶段 11。
