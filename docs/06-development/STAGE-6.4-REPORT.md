# 阶段 6.4 P00/P01 返修进度报告

> 日期：2026-09-02  
> 状态：用户已于 2026-09-02 批准归档；等待完成本地提交

## 1. 已完成

- 删除用户否决的实时纸片、粒子、指针光点、Canvas 场景、白色光洗与 1.45 秒伪转场；页面不再加载 Three.js。
- P00 重排为全屏媒体与电影下三分之一信息轨：标题、产品用途和入口共享基线与细分隔线；删除主视觉中的 `1900 · 敦煌藏经洞`、解释性艺术声明、方框 CTA、洞壁光点和循环边光，完整边界收进顶部“演示说明”。
- P00 标题接入 Google Fonts 官方 Noto Serif SC 500 的六个 unicode-range 切片（235,124B）并本地托管 OFL；没有加载完整网络字体或新增依赖。
- 项目保持全程无声；不存在音频元素或声音控件。
- 删除独立页面过渡动画；点击后由 History API 立即进入，空间连续性交给影片纸面尾帧和工作台材质，不再用 UI 遮罩冒充匹配剪辑。
- 生成并登记两张美术探索关键帧：肩后灯火揭示和纸面匹配剪辑；二者明确不是史料或影片成片。
- P01 经第二轮 UX 复核后删除三幕与“生成任务简报 → 确认教学情境”的重复动作；当前页只采集最小课程边界，并以一个确认动作结束。
- 史料用途、数量与组成移交 P03；阅读水平、前置知识和困难移交 P06；正式问题由 P02 收束。隐藏的后续字段不再阻塞 P01 校验。
- 复用原 draft、IndexedDB 草稿和即时摘要，没有建立第二套表单、生成态或状态库。
- P01 改为深色低干扰框架包围中低亮度无纹理阅读面；压平白卡套白卡，统一输入高度、2px 圆角、标签/帮助文字间距和选中标记。
- 最终交付仍是“可直接用于课堂的史料包”，但不在 P01 提前展示或要求选择；它在史料查找、核验和组织完成后逐步形成。
- 沿用 React、HTML 表单、IndexedDB 与既有 CSS 分层，没有新增依赖、状态库、表单库或动画库。
- 将用户已反复确认的决策习惯、视觉偏好、史料边界、无声原则和协作方式写入 `PROJECT-HANDBOOK.md` 0.5；后续数据库与后端阶段可直接复用，不再重复讨论这些稳定规则。
- 同步 PRD 0.3：P01 只确认最小课程边界，正式问题、史料条件与匿名学情分别由 P02、P03、P06 在需要时收集。
- 删除 `TeachingContextDraft` 中已经移交后续页面且不再被 P01 使用的字段、类型、选项和派生函数；旧本地草稿在规范化时会剥离这些字段，没有建立第二套状态。

## 2. 当前验证

- TypeScript、ESLint、Vitest（2 文件、8 项）、production build、生产依赖审计、敏感信息模式扫描与 `git diff --check` 通过；审计为 0 漏洞，扫描未发现仓库内 API 密钥或私钥模式。
- 应用内 Chromium 1440×900：P00 下三分之一信息轨完整，标题字体命中本地 `TracePBL Display`；P00→P01 单击一次到达一级标题“教学情境”。
- 390×844：P00 横向溢出=0，不创建视频；标题、用途与入口在底部安全区单列，顶部“演示说明”仍可见。P01 既有 320×800 验证保持有效。
- 空白情境提交后显示 5 处当前页错误并聚焦视觉顺序中的首项 `textbook`；隐藏的史料/学情字段不参与校验。
- P01 正常路径只需一次 `确认教学情境`；成功后按钮冻结为“教学情境已确认”，步骤同步显示“已确认”；修改任一字段后恢复待确认且不产生虚假错误摘要。
- 390×844 使用单列字段和折叠条件摘要；1440×900 使用表单 + 粘性条件摘要；两者语义树均无三幕页签或未到达步骤假按钮。
- 收尾后的构建体积：CSS 20.42kB / 5.26kB gzip；P01 独立 chunk 16.97kB / 5.84kB gzip；P00 初始 JS 195.57kB / 62.25kB gzip。正式页面已没有 Three 独立 chunk。
- Playwright 新会话在桌面首屏与 390×844 P01 回归中保持一次进入、一次确认、成功冻结和移动摘要；补充无需额外文件的内联 favicon 后，控制台为 0 error / 0 warning。

## 3. 影片候选进展

Runway 工作区无可用模型后，用户明确授权改用 MiniMax H3 API。按 MiniMax 中国区官方 V2 文档，以两张既有关键帧提交 `MiniMax-H3` 2K、6 秒首尾帧任务；任务 `437084928930074` 成功，候选片已下载为 `p00-cinematic-h3-v1.mp4` 并接入桌面 P00。

浏览器实测视频为 2560×1440、6.584 秒，具有真实空间推进并准确停在纸面尾帧；320px 与减少动态使用静态回退，一次点击进入 P01。用户已确认当前 P00/P01 没有问题。H3 原文件包含 AAC 音轨，页面已经强制静音；用户决定先保留首版并把物理去音轨后置到视频定稿后，当前不安装 FFmpeg。

## 4. 风险与边界

- 当前只有一条付费候选，没有以重复抽卡制造成本；用户若否决，应先指出具体镜头问题再决定是否生成第二条。
- 六个字体切片合计约 230KiB，会增加首次标题下载；这是稳定字形与系统宋体漂移之间的明确取舍，后续若已有批准的本地子集工具才进一步压缩，不为此新增依赖。
- Three.js 运行时代码与依赖已按用户确认的清理清单移除；`npm ls three @types/three --all` 返回空树。
- P01 只在本机保存教学情境并即时派生条件摘要，不检索史料、不调用 AI、不连接数据库或后端。
- 前端步骤、隐藏、禁用和不可用展示只改善体验，不是真正安全授权。
- 史料、引文、出处和权利不得合成；当前画面始终标记为艺术化演绎。
- 未实现 P02—P12，未设计数据库表或具体后端 API，未提交、push 或部署。

## 5. 清理结果

根据引用扫描，历史阶段报告、验证记录、模板和设计决策仍承担审计或治理用途，因此没有删除整份 Markdown 文档。用户于 2026-09-02 看过清理预览并明确回复“批准清理以上3项”，以下清理已完成：

| 已清理项 | 结果 | 恢复方式 |
|---|---|---|
| `three`、`@types/three` 及锁文件条目 | 使用 npm 正常移除；依赖树为空，审计 0 漏洞 | 从阶段 6.2 归档提交恢复，并重新走依赖准入 |
| `apps/web/public/assets/p00/p00-dunhuang-desktop.webp` | 已删除；运行时代码无引用，移动回退仍保留 | 可从阶段 6.3 Git 历史恢复 |
| `apps/web/public/assets/p00/p00-dunhuang-desktop.jpg` | 已删除；运行时代码无引用，移动回退仍保留 | 可从阶段 6.3 Git 历史恢复 |

`docs/03-frontend-design/assets/hero-desktop-v1.svg/.png` 虽然是被否决的旧稿，但仍被阶段 5 历史报告引用，保留作为决策证据；`dunhuang-hero-art-direction-v1.png` 和两张电影关键帧仍承担视觉溯源或影片来源说明，也保留。H3 MP4 的 AAC 轨道属于已登记的后置工作，不在本次清理中处理。

## 6. 新对话启动提示词

```text
这是史证工坊（TracePBL）的新 Codex 对话。请先完整读取 VIBE-CODING-AI-GUIDE.md、AGENTS.md、PROJECT-HANDBOOK.md、docs/00-governance/PROJECT-STATE.md、PRD 与验收标准、全部总体规划文档、唯一技术决策，以及当前 Git 状态、差异和最近提交，并输出开工摘要。

先确认阶段 6.4 已经批准并归档；如果没有，立即停止，不得继续。确认后直接进入阶段 6 前端编码的下一个子阶段 P02“探究问题”，不得退回数据库或后端设计，也不得提前实现 P03—P12。严格执行 PROJECT-HANDBOOK.md 4.6 的用户决策与协作偏好：从教师真实任务和最少步骤出发，复用现有组件、状态与依赖，不重复造轮子；需要产品或视觉取舍时给出一个有理由的首选建议。前端权限展示只能改善体验，不是真正安全授权。

本阶段只实现 P02，并先核对阶段 5 已批准设计、P01 当前数据契约和相邻页面状态。不得设计数据库表、实现数据库、设计具体后端 API、写后端业务代码、安装未批准依赖、使用真实个人/学生数据或合成史料。史料必须来自可定位的官方或权威公开来源；非史料 fixture 可以合成但必须清楚标识。项目全程无声。

实现后运行与风险相称的类型检查、测试、lint、production build、依赖审计和真实浏览器桌面/窄屏验证；覆盖正常、加载、空状态、校验失败、系统失败、无权限或不可用、超时/离线、成功反馈、手机窄屏、键盘和焦点。提交阶段报告、学习卡、原型/实现验证、风险、精确归档路径和建议提交消息，等待我回复“批准归档”。未经批准不得 git add、commit、tag、push、部署或进入 P03。
```

## 7. 归档申请

阶段 6.4 的实现、知识同步、清理和验证已经完成。建议本地提交消息：

```text
feat(web): complete P00 and P01 experience
```

本次申请归档的精确路径如下；只授权这些路径的本地提交，不含 push、部署或 P02：

```text
PROJECT-HANDBOOK.md
apps/web/index.html
apps/web/package.json
apps/web/public/404.html
apps/web/public/assets/p00/fonts.css
apps/web/public/assets/p00/noto-serif-sc-500-112.woff2
apps/web/public/assets/p00/noto-serif-sc-500-115.woff2
apps/web/public/assets/p00/noto-serif-sc-500-116.woff2
apps/web/public/assets/p00/noto-serif-sc-500-117.woff2
apps/web/public/assets/p00/noto-serif-sc-500-118.woff2
apps/web/public/assets/p00/noto-serif-sc-500-119.woff2
apps/web/public/assets/p00/noto-serif-sc-OFL.txt
apps/web/public/assets/p00/p00-cave-ambience.wav（删除）
apps/web/public/assets/p00/p00-cinematic-h3-v1.mp4
apps/web/public/assets/p00/p00-dunhuang-desktop.jpg（删除）
apps/web/public/assets/p00/p00-dunhuang-desktop.webp（删除）
apps/web/public/assets/p00/p00-film-keyframe-matchcut-v1.webp
apps/web/public/assets/p00/p00-film-keyframe-reveal-v1.webp
apps/web/src/App.test.tsx
apps/web/src/App.tsx
apps/web/src/P00Experience.tsx
apps/web/src/TeachingContextForm.tsx
apps/web/src/TeachingContextPage.tsx
apps/web/src/experience-policy.test.ts（删除）
apps/web/src/experience-policy.ts（删除）
apps/web/src/main.tsx
apps/web/src/styles.css
apps/web/src/teaching-context-store.ts
apps/web/src/teaching-context.test.tsx
apps/web/src/teaching-context.ts
apps/web/src/three-scene.ts（删除）
apps/web/src/workbench-form.css
apps/web/src/workbench.css
docs/00-governance/PROJECT-STATE.md
docs/01-initiation/PRD.md
docs/03-frontend-design/BROWSER-PERFORMANCE-ASSETS.md
docs/03-frontend-design/COMPONENT-ARCHITECTURE.md
docs/03-frontend-design/DESIGN-SYSTEM.md
docs/03-frontend-design/FRONTEND-DATA-CONTRACT.md
docs/03-frontend-design/FRONTEND-REVIEW.md
docs/03-frontend-design/HYBRID-3D-OPENING-SPEC.md
docs/03-frontend-design/INFORMATION-ARCHITECTURE.md
docs/03-frontend-design/LEARNING-CARD.md
docs/03-frontend-design/MOCK-AND-FIXTURES.md
docs/03-frontend-design/PAGE-SPECIFICATIONS.md
docs/03-frontend-design/PAGE-STATE-MATRIX.md
docs/03-frontend-design/PROTOTYPE-VALIDATION.md
docs/03-frontend-design/RESPONSIVE-ACCESSIBILITY.md
docs/03-frontend-design/USER-FLOWS.md
docs/03-frontend-design/VIEW-MODEL-FIXTURE-SPEC.md
docs/03-frontend-design/VISUAL-DIRECTION.md
docs/03-frontend-design/assets/README.md
docs/03-frontend-design/assets/hero-desktop-v1.svg
docs/06-development/LEARNING-CARD-6.4.md
docs/06-development/P00-FINAL-ASSET-REGISTER.md
docs/06-development/P00-FINAL-VISUAL-VALIDATION.md
docs/06-development/P01-PROTOTYPE-VALIDATION.md
docs/06-development/STAGE-6.4-REPORT.md
package-lock.json
```

用户已于 2026-09-02 回复“批准归档”，授权按上述精确路径执行一次本地提交；不含 push、部署或 P02。归档完成后停止；新对话按第 6 节提示词直接进入 P02。
