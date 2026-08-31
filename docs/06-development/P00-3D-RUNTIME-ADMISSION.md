# P00 混合 3D 运行时依赖准入申请

> 日期：2026-09-01
> 状态：用户已批准，精确版本已安装并通过阶段 6.2 技术原型验证；等待本子阶段归档批准
> 适用范围：阶段 6.2 技术原型；不构成最终美术、音频或公开发布批准

## 1. 需要解决的问题

P00 已有独立 HTML/CSS 安全首屏。下一步技术原型需要在不阻断该首屏的前提下验证：导演式镜头、简化洞窟空间、灯火/尘埃、有限鼠标视差、残卷收束、暂停、上下文丢失和四级降级。

原生 CSS/Canvas 2D 能完成轻量动态层，但不能低成本证明真实摄像机、遮挡、深度与资源生命周期；直接编写 WebGL2 又需要自行维护矩阵、着色器、缓冲区、材质和释放逻辑。这个工作量会把“验证体验”变成“自研渲染引擎”，不符合最小实现原则。

## 2. 唯一建议

申请安装以下精确版本：

| 包 | 范围 | 精确版本 | 许可证 | 用途 |
|---|---|---:|---|---|
| `three` | `apps/web` production dependency | `0.185.1` | MIT | 仅供按需加载的 P00 WebGL2 装饰层 |
| `@types/three` | `apps/web` development dependency | `0.185.4` | MIT | TypeScript 类型；不进入生产包 |

不申请 `@react-three/fiber`、Drei、后期处理库、物理引擎、GUI、音频库或资产压缩运行时。原型直接在一个 React 边界组件的 effect 中动态导入独立场景模块；逐帧状态留在渲染模块，不进入 React 高频重渲染。

## 3. 当前公开证据快照

数据访问时间均为 2026-09-01：

| 候选 | 当前 registry 版本 | GitHub 状态 | 许可证 | 全包第三方估算 gzip | 判断 |
|---|---:|---|---|---:|---|
| `three` | 0.185.1 | 约 115k stars；2026-08-31 有推送；r185 于 2026-07-01 发布；未归档 | MIT | 182,364 B | **采用** |
| `ogl` | 1.0.11 | 约 4.6k stars；最后推送 2025-04-13；无 GitHub release | npm 标为 Unlicense | 34,177 B | 小，但需更多自定义 shader/基础设施，维护证据弱，淘汰 |
| `@babylonjs/core` | 9.23.0 | 约 26k stars；2026-08-31 有推送；近期 release | Apache-2.0 | 1,734,304 B | 能力远超需求，包体和认知成本过高，淘汰 |
| `@react-three/fiber` | 9.7.0 | 约 31.8k stars；2026-08-31 有推送；适配 React 19 | MIT | 51,795 B，另需 `three` 与其依赖 | 单一 Canvas 不值得增加第二渲染器和 10 个依赖，淘汰 |

说明：

- registry 版本、发布包体、许可证和修改时间来自 npm registry 元数据；GitHub stars、推送、归档与 release 来自 GitHub API。
- gzip 数值来自 Bundlephobia 对完整入口的当前估算，只用于安装前比较，不等于本项目经 Vite tree-shaking 后的真实 chunk。批准安装后必须以本项目 production build 复测。
- OSV 对上述精确版本与 `@types/three` 的查询均返回 0 条已知漏洞；这只表示查询时没有登记项，不是安全保证。
- Three 官方当前 `WebGLRenderer` 只支持 WebGL2。能力探测失败、上下文丢失或低性能时必须降级，不能尝试绕过。

## 4. 为什么直接使用 Three，而不是 React Three Fiber

React Three Fiber 对大型、交互密集、组件化 3D 场景很有价值，但 P00 的 3D 是一个可随时移除的装饰子系统：真实 UI 始终由 React/HTML 管理，渲染循环不应把每帧坐标送回 React。直接 Three 可以：

- 少一个运行时层和依赖树；
- 更明确地控制初始化、暂停、销毁和上下文丢失；
- 把整个 3D 场景封装为单个延迟加载 chunk；
- 未来如证据证明 3D 不值得保留，可删除一个模块和两个依赖，不影响 UI 架构。

这不是对 React Three Fiber 质量的否定，而是本项目当前场景不需要其抽象。

## 5. 安装后的硬预算

批准只授权安装和技术原型，不代表依赖自动保留。原型必须同时满足：

| 指标 | 准入阈值 | 不满足时 |
|---|---:|---|
| 初始关键 JS | 当前 61.35kB gzip；引入动态入口后目标仍 ≤ 65kB gzip | 检查误打包；无法隔离则移除运行时 |
| 可选 Three chunk | ≤ 190kB gzip | 改为更窄入口/构建；仍超限则回退轻量动态 |
| P00 完整增强媒体 | 桌面总传输 ≤ 4.5MB | 压缩、缩短或降级 |
| 移动默认 | 不加载完整 3D；轻量媒体 ≤ 1.8MB | 静态终帧 |
| 首个稳定增强帧 | 参考桌面设备 ≤ 2.5s；UI 不等待 | 超时保持当前层，不再升级 |
| 帧率 | 原型实测后冻结；持续低帧率必须自动降级 | 不允许只记录而不降级 |
| 页面隐藏 | 动画循环和媒体立即暂停 | 阻断归档 |
| `prefers-reduced-motion` | 不导入 Three、不推镜、不视差 | 阻断归档 |
| WebGL2/上下文丢失 | 保留静态或纯色 UI，可进入主链 | 阻断归档 |

## 6. 技术原型最小范围

批准后只实现：

1. `P00ExperienceBoundary`：保持真实 UI 永远在 Canvas 之上；负责能力、偏好、超时和降级状态。
2. 延迟加载的 `three` 场景：程序化低模洞窟前/中/后景、单灯、受控尘埃和占位残卷；醒目标注“技术原型”。
3. 固定 5—7 秒时间线、有限鼠标视差、用户操作后收束、首次/再次访问和“重看序章”。
4. `visibilitychange` 暂停、resize、`webglcontextlost`、初始化失败和完整 dispose。
5. reduced-motion、窄屏、节省数据、超时、显式失败注入和四级降级测试。
6. production build chunk、浏览器加载、帧率/长任务和基本内存观察记录。

不会在此原型中制作最终王圆箓角色、复制敦煌壁画、加入伪文字、购买资产、添加正式音频、实现 P01 页面或连接网络服务。

## 7. 实现纪律与退出方案

- 使用 `import()` 在 UI 可用后才加载场景；禁止从 `App.tsx` 顶层静态导入 `three`。
- Canvas 使用装饰语义，不进入辅助技术顺序，不持有按钮或文字。
- 运行时状态只在场景模块内部；React 只接收低频阶段与降级事件。
- 不使用自由轨道控制、不请求陀螺仪、不引入后期处理或物理。
- 资源必须显式 dispose；事件监听、RAF、计时器与媒体在卸载时全部清理。
- 升级 Three 不自动追随最新版；单独审查迁移说明、构建体积和回归测试。
- 退出时删除场景模块与边界中的动态导入，从 `apps/web/package.json` 移除 `three` 和 `@types/three`，更新 lockfile；P00 自动回到已归档静态安全首屏。

## 8. 安全、隐私和权限

运行时不发网络请求、不读取身份、不存储个人数据、不接收史料文本，也不改变任何授权判断。`introSeen`、声音和运动偏好只属于本机体验状态；它们不是认证或安全授权。加载失败日志只记录低敏错误类别，不记录浏览器指纹、完整设备信息或用户内容。

## 9. 来源

- Three 官方仓库与 MIT 许可：https://github.com/mrdoob/three.js
- Three 官方安装说明：https://threejs.org/manual/en/installation.html
- Three `WebGLRenderer` 官方文档：https://threejs.org/docs/pages/WebGLRenderer.html
- Three 安全页：https://github.com/mrdoob/three.js/security
- React Three Fiber 官方仓库：https://github.com/pmndrs/react-three-fiber
- OGL 官方仓库：https://github.com/oframe/ogl
- Babylon.js 官方仓库：https://github.com/BabylonJS/Babylon.js
- npm registry：https://registry.npmjs.org/
- OSV API：https://api.osv.dev/
- Bundlephobia（第三方体积估算）：https://bundlephobia.com/

## 10. 请求批准

请求用户批准仅执行：

```text
apps/web dependencies: three@0.185.1
apps/web devDependencies: @types/three@0.185.4
```

用户于 2026-09-01 明确批准上述两个精确版本。安装使用现有 npm workspace，未执行包安装脚本；没有加入其他 3D、音频、后期处理或状态管理依赖。阶段 6.2 的 production build 实测初始 JS 为 63.21kB gzip、独立 Three 场景 chunk 为 132.66kB gzip，均在本文件预算内。完整结论见 `P00-3D-PROTOTYPE-VALIDATION.md`。
