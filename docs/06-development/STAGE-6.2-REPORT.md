# 阶段 6.2 P00 混合 3D 技术原型完成报告

> 报告日期：2026-09-01
> 状态：实施与验证完成，用户已批准归档
> 归档边界：只申请本地提交；不含 push、部署、最终视觉资产、数据库或后端

## 1. 结论

已按用户批准的精确版本安装 `three@0.185.1` 与开发期 `@types/three@0.185.4`，完成 P00 混合 3D 技术原型。真实 UI 始终先于并独立于 3D；完整场景延迟加载，支持 6.5 秒镜头、有限视差、首次/重看、主动作收束、资源释放、性能采样和失败降级。

技术预算通过，可以申请归档并进入最终视觉门。当前低模人物、洞窟、残卷与灯火只是工程占位，绝不等于用户要求的高级 CG、历史人文气质或最终王圆箓叙事。

## 2. 产物

| 路径 | 内容 |
|---|---|
| `apps/web/package.json`、`package-lock.json` | 用户批准的两个精确依赖及完整锁文件 |
| `apps/web/src/experience-policy.ts`、`.test.ts` | 四级体验策略与边界测试 |
| `apps/web/src/P00Experience.tsx` | HTML/3D 边界、延迟加载、首次/重看、失败和可访问状态 |
| `apps/web/src/three-scene.ts` | 最小 Three 场景、时间线、性能观测、暂停和 dispose |
| `apps/web/src/App.tsx`、`App.test.tsx`、`styles.css` | 安全层接入、真实声音文案、响应式与状态样式 |
| `docs/06-development/` | 依赖准入、原型验证、本报告和学习卡 |
| `docs/00-governance/PROJECT-STATE.md` | 当前门禁、证据与下一步 |

## 3. 验证摘要

- lint、typecheck、2 文件 5 项测试、production build、npm audit 均以退出码 0 完成。
- 初始 JS 63.21kB gzip，低于 65kB；Three 独立 chunk 132.66kB gzip，低于 190kB。
- 应用内 Chromium：完整 3D 首帧 116ms；2 秒一次性样本 174fps、1 慢帧；17 draw calls、20 geometries、576 triangles；控制台无 warning/error。
- 真实 WebGL context loss 自动降到静态层；320×800 自动进入轻量层，Canvas 隐藏、横向溢出 0px、触控目标至少 44px。
- 当前浏览器工具未触发真实 `document.hidden`，所以后台暂停以代码路径复核通过、普通浏览器手工事件仍列为遗留，不虚报运行通过。

详细证据见 `P00-3D-PROTOTYPE-VALIDATION.md`。

## 4. 边界与风险

- 没有最终人物、洞窟、壁画、残卷、视频或音频资产；也没有复制、生成或伪造史料。
- 没有安装 Fiber、Drei、Babylon、OGL、后期处理、物理、音频或其他未批准依赖。
- 没有 P01—P12、数据库表/Schema、迁移、具体后端 API 或后端业务代码。
- 没有秘密、真实教师/学生数据、外发消息、push、部署或账号权限变化。
- `@types/three` 自带若干开发期类型依赖，已进入 lockfile；npm audit 当前为 0 漏洞，但后续升级仍需单独审查。
- 初始 JS 仅剩 1.79kB gzip 预算余量；最终视觉实现不得把媒体、调试器或 Three 静态打进入口。
- 最终资产会显著改变网络、GPU、可访问性和视觉判断，必须重新测量，不能继承本原型性能结论。

## 5. 下一门禁

用户回复“批准归档”后，才允许按下列路径做一次本地提交。归档后进入 P00 最终视觉资产与视觉门，继续前端编码；不得提前进行数据库或后端设计。

建议提交消息：

```text
feat(web): validate P00 hybrid 3D runtime
```

建议归档路径：`apps/web/package.json`、`package-lock.json`、`apps/web/src/`、`docs/00-governance/PROJECT-STATE.md`、`docs/06-development/`。

不包含：`node_modules/`、`apps/web/dist/`、任何浏览器临时产物、push 或部署。

用户于 2026-09-01 明确回复“批准归档”，授权本报告所列精确路径进行一次本地提交；不包含 push、部署、最终视觉资产、数据库或后端工作。
