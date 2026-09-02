# 前端视图模型与可执行 Fixture 规格

> 版本：0.1
> 日期：2026-08-31
> 状态：阶段 5 已批准归档
> 当前修订：2026-09-02 P03/MUST-004 view-model 边界已随阶段 6.6 获准归档
> 地位：阶段 6 实现输入；不是数据库 Schema、ORM 模型或具体 HTTP API

## 1. 目的

`FRONTEND-DATA-CONTRACT.md` 定义页面需要什么；本文件把它收束成可直接实现的前端 view-model、adapter 能力和 fixture 文件边界，使编码阶段不再临时发明字段名、状态优先级或错误结构。

## 2. 根包结构

每个 fixture 根包必须含以下字段：

| 字段 | 类型/示例 | 规则 |
|---|---|---|
| `fixtureId` | `FX-TANG-45M-V1` | 稳定、可读、不可用于授权 |
| `fixtureVersion` | `1.0.0` | 语义版本；破坏性变更升 major |
| `contractVersion` | `frontend-v1` | 与 adapter 校验一致 |
| `title` | 合成任务标题 | 不含真实教师/学校/学生 |
| `dataClassification` | `syntheticWithAuthoritativeSourceMetadata` | 禁止把史料标为 synthetic |
| `generatedAt` | ISO 8601 | 表示 fixture 构造时间，不是史料年代 |
| `sourceRegistryVersion` | `2026-08-31` | 指向史料登记复核批次 |
| `taskSnapshot` | 当前任务全部页面视图 | 只含页面所需内容 |
| `scenarios` | 故障注入表 | 公开 Demo 不显示工程开关 |
| `expectedAssertions` | 页面/动作预期 | 供组件/E2E 共用 |

## 3. 通用视图模型

| View-model | 必需字段 |
|---|---|
| `AppEnvironmentVM` | `mode`、`isOnline`、`storageState`、`demoNoticeVersion`、`motionPreference`、`dataPreference`、`filmState` |
| `NarrativeExperienceVM` | `level: full3d/lightMotion/static/safeColor`、`mediaState`、`contextState`、`canReplay`、`shouldAutoRun`；只描述本机体验能力，不进入业务 adapter |
| `TaskShellVM` | `taskRef`、`title`、`currentStep`、`steps[]`、`highestPriorityNotice`、`saveState`、`lastSafeVersion` |
| `StepVM` | `id`、`label`、`href`、`state`、`highestCount`、`entryRequirement` |
| `StatusVM` | `kind`、`label`、`description`、`iconName`；颜色不进入数据真相 |
| `ProblemVM` | `code`、`category`、`message`、`fieldProblems[]`、`retryable`、`preserved`、`actions[]`、`traceId?` |
| `OperationVM` | `operationId`、`state`、`startedAt`、`elapsedMs`、`completedCount?`、`totalCount?`、`canCancel`、`parts[]` |
| `ImpactVM` | `summary`、`items[]`；每项含对象标签、旧/新状态、原因、修复 href |
| `RightsVM` | `state`、`label`、`basis`、`allowedPresentation`、`officialUrl` |
| `SourceSummaryVM` | `sourceRef`、`title`、`creatorOrInstitution`、`dateLabel`、`type`、`identifier`、`discoveryScope`、`verification`、`rights`、`presentation`、`recommendationTier`、`recommendationReasons[]`、`helpsAssess[]`、`cannotEstablish[]`、`selection`、`failure?` |

`iconName` 只是视觉提示，不决定状态；状态来自 `kind/state`。任何 view-model 都不得含 capability、秘密、数据库列名、厂商原始响应、完整日志或他人资源存在性。

## 4. Adapter 能力面

阶段 6 只实现两种 adapter 的同一能力语义：Demo adapter 使用 fixture + IndexedDB；API adapter 先提供类型化接口和不可用占位，不连接未设计的真实 API。

| 能力组 | 读取 | 动作 | Demo 行为 |
|---|---|---|---|
| 环境/任务 | 读取演示边界、当前任务壳 | 建立/继续任务 | 本机版本化快照 |
| 情境/问题 | 读取 P01/P02 view | 保存、确认、诊断、比较提案 | 确定性预生成结果 |
| 史料 | 读取 P03 推荐/更多结果、内嵌证据记录和发现状态 | 选择、排除、调整条件、录入材料元数据、模拟自动核验 | 只用登记的权威史料与允许展示范围；检索、核验、推荐均为确定性预生成演示，不伪装真实在线能力 |
| 关系/课程/量规 | 读取 P05—P07 | 增删改、排序、生成提案 | 合成内容，保留教师编辑 |
| 审计/批准 | 读取检查与审阅 | 运行/取消、记录理由、批准/退回 | 确定性规则，不证明真实服务端授权 |
| 导出 | 读取预览 | 生成/取消 | 只生成本机文件；格式按阶段 6 实测开放 |
| 数据 | 读取范围 | 清除单项/整任务 | IndexedDB 幂等清除 |

所有动作接受基线版本和幂等键概念；传输形式留给阶段 9。高风险动作不做假乐观成功。

## 5. 具体 JSON 形状样例

下面是结构样例，文字为合成界面数据；史料元数据只引用 `SOURCE-FIXTURE-RESEARCH.md` 已登记事实。阶段 6 将其转换为通过 Zod 校验的 JSON 文件。

```json
{
  "fixtureId": "FX-TANG-45M-V1",
  "fixtureVersion": "1.0.0",
  "contractVersion": "frontend-v1",
  "dataClassification": "syntheticWithAuthoritativeSourceMetadata",
  "taskSnapshot": {
    "taskRef": "demo-tang-45m",
    "currentStep": "sources",
    "question": "依据哪些史料，我们可以把唐朝前期称为‘盛世’？",
    "steps": [
      { "id": "context", "label": "教学情境", "state": "complete" },
      { "id": "question", "label": "探究问题", "state": "complete" },
      { "id": "sources", "label": "候选史料", "state": "current", "highestCount": 2 }
    ],
    "sourceDiscovery": {
      "strategy": "registeredKnowledgeBaseThenExternal",
      "resultCount": 10,
      "recommendedCount": 4,
      "status": "succeeded"
    },
    "sources": [
      {
        "sourceRef": "AUTH-SRC-001",
        "title": "《贞观政要》版本记录",
        "creatorOrInstitution": "国家图书馆（国家古籍保护中心）",
        "verification": "conditional",
        "rights": "restrictedMetadataOnly",
        "allowedPresentation": "metadataAndOfficialLink",
        "recommendationTier": "recommended",
        "recommendationReasons": ["与当前问题相关；可与不同类型史料形成互证"],
        "helpsAssess": ["官方版本记录及其可定位性"],
        "cannotEstablish": ["不能单独概括唐朝前期整体社会状况"]
      }
    ]
  }
}
```

fixture 中不写可被误认成真实史料的 AI 引文。若需要验证长文排版，使用明确标注的排版测试字符串，字段名为 `layoutStressText`，不得挂在 `excerpt` 或 `quotation` 下。

## 6. 场景注入结构

每个场景只改变明确变量：

| 字段 | 值 |
|---|---|
| `scenarioId` | `S06-TIMEOUT` |
| `trigger` | 动作语义，如 `audit.run` |
| `latencyClass` | `instant/normal/slow/over30s`，测试用假时钟 |
| `result` | `success/partial/problem/cancelled/conflict` |
| `problemCode` | 稳定 code；成功时为空 |
| `preservePaths` | 必须保留的草稿/确认版 |
| `expectedNotices` | 页面必须出现的文案 ID |
| `expectedFocus` | CSS 选择器概念或语义目标，不绑定 DOM 结构 |
| `expectedStateChanges` | 对象旧/新状态 |

场景不能用随机延迟或随机错误；相同输入必须复现相同结果。

## 7. 文案 ID 与本地化

关键安全/状态文案使用稳定语义 ID，例如 `demo.boundary.summary`、`source.verification.timeout`、`audit.incomplete`、`task.unavailable`、`export.local.success`。ID 不出现在教师界面，也不作为领域规则。普通说明可直接在组件内组合；错误和门禁文案集中管理，确保按钮与反馈动词一致。

## 8. Fixture 迁移与失败

- IndexedDB 快照记录 `contractVersion` 与 `fixtureVersion`；读取旧 major 版本时先提供导出或清除，不静默丢弃。
- 可兼容迁移失败时进入 `storage` 问题，保留原数据副本，禁止假称已恢复。
- fixture 来源登记变化时，受影响史料状态变为待复核；不自动替换为新元数据后仍保留教师批准。
- 清除整任务后，任务快照、草稿、场景状态和本机文件引用都消失；只保留不含内容的清除成功状态。

## 9. 阶段 6 直接验收

1. 所有 fixture 根包通过同一运行时 schema；未知 major 安全失败。
2. Demo/API adapter 通过同一行为契约测试；API adapter 不连接未批准服务。
3. `PAGE-STATE-MATRIX.md` 每格至少映射一个 scenario + assertion。
4. fixture 搜索确认没有真实个人/学生数据、秘密、伪造史料、未授权全文或图片。
5. P00 影片/海报状态与任务业务快照分离；项目不包含声音；视觉资源加载或解码失败不破坏任务数据。
6. P00 至少有完整增强、轻量动态、静态、纯色、reduced-motion、首次访问、再次访问、主动重看和上下文丢失场景；断言主动作始终可用。
