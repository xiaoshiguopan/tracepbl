# P00 混合 3D 技术原型验证记录

> 日期：2026-09-01
> 范围：阶段 6.2 技术可行性；不构成最终视觉、历史内容或音频验收

## 1. 验证对象

原型把真实标题、边界说明、声音偏好和主动作保留在 HTML 安全层，把 Three 场景作为可删除的装饰增强层动态导入。场景只使用程序化低模洞窟、人物剪影、纸卷、灯光与尘埃，固定时间线为 6.5 秒；这些几何不是王圆箓、敦煌壁画或任何史料的最终资产。

体验等级为 `full`、`light`、`static`、`safe`。减少动态、窄屏、节省流量、WebGL2 缺失、加载失败、低帧率和上下文丢失不会阻断真实 UI。测试查询参数只用于技术复验：`p00-mode` 选择层级，`p00-intro=replay` 重播首次序章，`p00-failure=load|context` 注入失败。

## 2. 自动化验证

| 验证 | 当前结果 | 结论 |
|---|---|---|
| `npm run lint` | 退出码 0 | 通过 |
| `npm run typecheck` | 退出码 0 | 通过 |
| `npm run test` | 2 文件、5 测试，0 失败/跳过 | 通过 |
| `npm run build` | Vite 8.2.2，22 modules transformed，退出码 0 | 通过 |
| `npm audit --json` | 168 dependencies；0 vulnerabilities | 通过；不是安全保证 |

体验策略单元测试覆盖：能力桌面进入 full；窄屏/节省数据进入 light；减少动态/WebGL2 缺失进入 static；强制 full 不能越过减少动态；未知测试层级被拒绝。

## 3. 构建与性能预算

| 指标 | 预算 | 实测 | 判断 |
|---|---:|---:|---|
| 初始关键 JS | ≤65kB gzip | 63.21kB gzip | 通过，余量 1.79kB |
| 独立 Three 场景 chunk | ≤190kB gzip | 132.66kB gzip | 通过，余量 57.34kB |
| CSS | 无新增硬阈值 | 7.00kB / 2.44kB gzip | 记录 |
| 首个增强帧 | ≤2.5s，UI 不等待 | 116ms | 通过 |
| 2 秒运行样本 | 持续低于 24fps 自动降级 | 174fps，1 慢帧 | 本机单次样本通过 |
| 场景复杂度 | 记录并冻结原型基线 | 17 draw calls；20 geometries；576 triangles | 基线已记录 |

Three 位于独立动态 chunk，不进入初始 JS。Vite 对未压缩 Three chunk 超过 500kB 给出警告；未通过调大警告阈值隐藏它。gzip 体积在批准预算内，但后续最终资产仍必须另算媒体传输与显存，不能沿用本次结论。

## 4. 应用内 Chromium 走查

| 场景 | 运行证据 | 结论 |
|---|---|---|
| 完整 3D | `full`；首帧 116ms；174fps/1 慢帧；控制台 0 warning/error | 通过 |
| 性能采样 | 等待第二个 2.5 秒后文本保持完全相同 | 只上报一次，避免持续 React 更新 |
| 重看序章 | “重看序章”可点击；点击后保持主 UI 可用；控制台无错误 | 通过 |
| 真实 context loss | `WEBGL_lose_context` 触发后从 full 自动变为 static；主标题和动作仍在；控制台无错误 | 通过 |
| 320×800 | 自动选择 light；Canvas `display:none`；横向溢出 0px；按钮高度 44/47/44px | 通过 |
| 加载失败 | 显式加载失败进入 static，主动作仍可用 | 通过 |
| 后台暂停 | `visibilitychange` 直接调用 controller pause/resume；当前内置浏览器并行标签未触发 `document.hidden` | 实现复核通过；真实后台事件待普通浏览器手工复验 |

内置浏览器无法主动模拟 `prefers-reduced-motion`；该分支由纯函数测试、加载前判断和 CSS 条件共同覆盖。真实辅助技术、强制色、高缩放、Save-Data 请求头与多档低端 GPU 仍属于后续完整浏览器矩阵。

## 5. 生命周期与失败处理

- 页面隐藏时停止 animation loop，恢复可见时继续；滚动或进入主动作时立即收束序章。
- `ResizeObserver`、pointer listener、context-loss listener 与 animation loop 在卸载时清理。
- 场景遍历释放 geometry/material，随后 dispose renderer。
- 动态模块加载设置 2.5 秒超时；加载或初始化异常回到静态层。
- 2 秒样本低于 24fps 时释放 3D 并回到静态层。
- Canvas `aria-hidden` 且不承载文字、按钮或授权判断；键盘和辅助技术只使用 HTML 层。

## 6. 验证边界

本记录不证明最终 CG 品质，不证明真实王圆箓形象、洞窟结构、壁画、残卷或环境声已经合格，也不证明所有教师设备都能达到本机帧率。没有引入或生成史料；视觉占位不允许进入证据链。前端体验层级不是认证或安全授权。

阶段 6.2 的结论是：所选最小运行时、动态隔离、资源生命周期和四级降级方案可继续进入最终视觉门。最终资产若突破传输、帧率、可访问性或史料边界，应删减资产或降级，不得用本次低模数据豁免。
