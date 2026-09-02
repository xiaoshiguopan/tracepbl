# 组件架构与状态归属

> 状态：阶段 5 已批准归档
> 当前修订：2026-09-02 P03/MUST-004 组件职责已随阶段 6.6 获准归档
> 边界：定义前端内部结构和数据流，不是业务代码、数据库模型或具体后端 API

## 1. 分层

```text
App shell / routes
├─ page composition（按页面编排）
├─ feature components（按领域任务）
├─ shared UI（无领域决定）
├─ view-models / form models（展示与编辑状态）
└─ data ports
   ├─ Demo adapter（fixtures + IndexedDB）
   └─ API adapter（未来真实实现；同一前端需求契约）
```

页面组件负责加载边界、标题、主任务和区块编排；业务组件只处理一个领域对象/动作；基础组件不导入业务状态或数据 adapter。前端不直连数据库、对象存储或付费 AI，不保存服务端秘密。

## 2. 页面与业务组件映射

| 页面 | 页面组件职责 | 业务组件 |
|---|---|---|
| P00 | 非阻塞预渲染电影、静态/纯色降级、演示/艺术边界、一次点击进入/继续 | `NarrativeHero`、`CinematicMedia`、`NarrativeArtLabel`、`DemoBoundaryNotice`、`StartTaskCard`、`LocalResumeCard`；不再拆实时场景、视差或飞纸组件 |
| P01 | 最小情境表单、即时条件摘要和一次确认 | `TeachingContextForm`、`ContextConflictPanel`、`ContextSummary`、`StepRail`；不建立页签状态、生成态或第二套简报状态 |
| P02 | 自动承接情境、有限问题方案、关键确认与按需编辑 | `QuestionProposalList`、`QuestionFocusChooser`、`QuestionInlineEditor`、`QuestionSummary` |
| P03 | 知识库/外部发现状态、优先推荐、直接阅读、自动核验依据、选择与材料元数据输入 | `SourceDiscoveryStatus`、`RecommendedSourceList`、`SourceReadingCard`、`SourceRationale`、`SourceEvidenceDisclosure`、`SourceSetSummary`、`SourceFilters`、`AddMaterialMetadataPanel` |
| P04 | 无独立页面；MUST-004 视图组合进 P03 | 复用 `SourceEvidenceDisclosure` 内的 `SourceIdentitySection`、`ProcessingChain`、`ValueLimitationSummary`；不建立独立 route/page/form store |
| P05 | 关系概览与等价列表 | `EvidenceMapOverview`、`EvidenceRelationList`、`RelationEditorDialog`、`EvidenceGapPanel` |
| P06 | 活动、时长和支架 | `LessonTimeline`、`ActivityCard`、`EvidenceProductEditor`、`ScaffoldEditor` |
| P07 | 量规与映射 | `RubricDimensionList`、`PerformanceLevelEditor`、`ActivityRubricMapping` |
| P08 | 审计运行与结果 | `AuditRunPanel`、`AuditSummary`、`AuditFindingList`、`TeacherRationaleForm` |
| P09 | 审阅与批准 | `ReviewSectionList`、`ApprovalControl`、`ImpactSummary`、`DeliveryReadiness` |
| P10 | 导出预览与任务 | `ExportFormatPicker`、`RightsSubstitutionPreview`、`ExportJobStatus` |
| P11 | 数据说明与清除 | `DataBoundarySummary`、`ClearItemDialog`、`ClearTaskDialog` |
| 全局 | 布局与状态 | `EvidenceTrail`、`DemoModeBadge`、`TaskStatusBanner`、`OfflineBanner` |

名称是设计语汇，编码时允许在不改变职责的前提下调整；不得生成一个接收所有对象和状态的万能 `Workspace` 组件。

## 3. 基础组件

`Button`、`Link`、`IconButton`、`TextField`、`TextArea`、`Select`、`Checkbox`、`RadioGroup`、`FieldError`、`ErrorSummary`、`StatusBadge`、`Banner`、`Toast`、`Dialog`、`Disclosure`、`Tabs`、`Card`、`DataList`、`Table`、`Skeleton`、`ProgressStatus`、`EmptyState`。

基础组件内建 focus-visible、disabled/loading、可访问名称、描述/错误关联和 reduced-motion 支持；不内建“教师批准”“来源已核验”等业务规则。

## 4. 状态归属

| 状态 | 所有者 | 例子 | 不应放置 |
|---|---|---|---|
| URL 状态 | 路由 | 筛选、分页、P03 当前展开 source、当前 claim | 临时输入、秘密、完整正文、核验状态 |
| 远端/持久任务状态 | data port 缓存 | 情境、史料卡、批准、审计结果 | React 隐式全局单例 |
| Demo 持久状态 | Demo adapter/IndexedDB | 当前浏览器的任务快照、schema 版本 | 组件直接读写 IndexedDB |
| 表单草稿 | 最接近的页面/业务表单 | 未提交字段、dirty、客户端错误 | 全应用 store |
| 交互临时状态 | 组件局部 | disclosure、dialog、hover、当前选择 | URL（除需深链） |
| 异步操作状态 | 操作 view-model | queued/running/partial/succeeded/failed/cancelled | 只靠按钮 disabled 推断 |
| 领域状态 | 契约返回/领域规则 | 待核验、阻断、教师批准 | UI 自行根据颜色/字段拼出 |
| 全局环境状态 | app shell | demo/complete、online/offline、storage unavailable、motion preference、page visibility | 每页重复请求/复制逻辑 |
| P00 媒体能力状态 | `CinematicMedia` + app environment | `film`/`poster`/`safe-color`、media loading/ready/error、motion/data preference | 业务任务快照、URL、史料状态 |
| P00 导演式时间线 | `NarrativeHero` 局部编排 | 当前镜头段、收束、用户主动重看 | 全局业务 store、服务端状态 |

状态提升只在两个以上相邻消费者确实需要时发生。服务器/领域派生状态不由客户端回算。URL 中的 task ID 只定位，capability 不进入查询参数、日志或持久可复制状态。

## 5. 数据流与写入

```text
route loader → data port → validated view data → page/feature
form draft → client experience validation → command intent
→ data port → authoritative result → cache/task snapshot → visible feedback
```

- 表单可做即时体验校验，但后续真实 adapter 的结果是最终事实。
- 乐观更新只用于可安全撤销的低风险操作（如本机筛选、非关键排序和可撤销的本机选择）。批准、删除、核验状态、审计和导出不做假成功。
- 所有写入有 pending/succeeded/failed/cancelled；重复触发共享同一进行中结果或被安全拒绝。
- 上游改变由返回的影响清单驱动 UI，不由组件自行猜哪些下游失效。

## 6. 权限与边界

- `CanView`/`CanEdit` 等前端提示只用于禁用或解释入口，不能作为安全授权。
- 完整模式每次读取、保存、核验、批准、导出、取消和清除都必须由后续服务端校验当前 capability 与资源归属。
- 无权限与不存在共享安全展示，前端不显示资源标题、来源或所有者信息。
- Demo adapter 只操作本机的合成非史料数据与官方史料元数据夹具；它不证明完整模式授权安全，也不把官方公开等同于可复制许可。
- `NarrativeHero` 只消费艺术资产和环境偏好，不能向史料组件提供事实；艺术图或预渲染媒体损坏时，真实页面内容保持完整。
- `CinematicMedia` 只选择影片/海报/纯色层并报告安全诊断，不自行推断设备身份；视频不拥有主按钮、标题或艺术声明。
- `ParallaxController` 只驱动有上限的镜头/深度参数，不直接移动真实 UI，不请求陀螺仪权限，不把指针轨迹持久化。

## 7. 组合与复用规则

- 优先组合具体组件，不用 `variant="everything"` 的万能卡片。
- 第三次出现且语义、状态和交互一致后再抽象；仅外观相似不抽业务组件。
- 对话框内容是独立表单组件，便于在窄屏 route/sheet 中复用。
- 图形视图与列表共享同一 view-model，不能维护两套关系真相。
- 组件 props 使用领域名，禁止 `data`、`item`、`handler` 等无语义总称。

## 8. 错误边界

- App 级：加载公共壳失败，显示最小安全页。
- Route 级：某页面失败，保留导航与其他已知状态，提供重试。
- Feature 级：单个来源/审计项失败，不拖垮整页。
- Field 级：输入问题就地修复。
- 意外错误不得吞掉；展示安全追踪 ID，不渲染堆栈、SQL、密钥或第三方响应。

## 9. 编码输入索引

- 逐页组成、字段和文案：`PAGE-SPECIFICATIONS.md`
- 视图模型、adapter 能力与 fixture 结构：`VIEW-MODEL-FIXTURE-SPEC.md`
- 浏览器、性能、图片、动效与资产：`BROWSER-PERFORMANCE-ASSETS.md`
- 敦煌叙事与代表页：`VISUAL-DIRECTION.md`
- P00 预渲染电影分层、时序、降级和完成门：`HYBRID-3D-OPENING-SPEC.md`
