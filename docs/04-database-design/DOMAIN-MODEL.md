# 史证工坊领域模型

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：阶段 7 已批准归档
> 范围：PostgreSQL 持久化领域及一致性边界；不是页面、HTTP API 或 ORM 实现

## 1. 建模原则

数据库围绕教师实际完成的“问题—史料—证据—活动—量规—审计—签发”关系建模，不把 P00—P12 页面、React store 或 IndexedDB 对象逐个翻译成表。页面是用户旅程，领域对象由身份、生命周期、基数和一致性边界决定。

两个运行面保持分离：GitHub Pages Demo 继续以 IndexedDB 保存当前浏览器的公开/合成任务；本文件只设计可由他人克隆后在本机运行的完整工程数据库。两者通过后续 adapter 共享可观察契约，但不共享存储、密钥或用户数据。

## 2. 聚合与实体

### 2.1 Workspace 聚合

`Workspace` 是完整工程中的数据隔离根。v0.1 每个本地实例只有一个 `local_single_user` workspace，不设置账号、学校、团队或分享。所有私有任务和教师自有材料都归属一个 workspace；公共来源目录不属于任何私人 workspace。

未来若获批账号/团队，再新增 `User`、`WorkspaceMember` 和认证关系；当前不放空用户表、不伪造管理员角色，也不启用 RLS。

### 2.2 Task 聚合

`Task` 是一次完整备课的事务与版本边界，包含：

- 一个 `TeachingContext`；
- 一个中心 `InquiryQuestion`，整课模式下最多三个有序子问题；
- 对若干准确 `SourceVersion` 的选择；
- 多个 `EvidenceClaim`、`EvidenceCitation` 和 `EvidenceRelation`；
- 有序 `LearningActivity`；
- 多个 `RubricItem`；
- 多次 `VerificationRun`、`TeacherDecision`、`ModelRun` 和 `ExportRun`；
- 若干不可变 `TaskRevision`。

普通编辑修改当前关系化状态；生成、教师确认、完成审计或导出前创建不可变里程碑快照。Task 的 `lock_version` 是乐观并发令牌，不是业务修订号。

### 2.3 Source 聚合

`Source` 表示同一史料/研究材料的稳定身份；`SourceVersion` 表示某次可引用内容和元数据快照。公共目录与任务私有材料共享这套关系，但作用域不同：

- `catalog`：公共且经过登记的来源，可被多个任务引用；
- `task_private`：教师在某个任务中粘贴的 URL 或文本，只能被该任务使用；
- v0.1 不接收 PDF/DOCX、图片、音视频，也不自动抓取任意 URL。

URL 只是定位。只有已实际保存、分类且允许处理的文本才能成为 `SourceVersion` 内容并进入 RAG。公共来源修订时新增版本；已有任务继续引用旧版本，不发生静默漂移。

### 2.4 Evidence 聚合

`EvidenceClaim` 是教师要判断的命题；`EvidenceRelation` 表达命题与史料之间的背景、支持、转折、影响、质疑/限制等关系；`EvidenceCitation` 再把一条关系定位到任务已选的准确史料版本及可选文本块。

引用完整性不是“有一个 source ID”即可：引用的 source version 必须已被当前 task 选用，chunk 必须属于同一个 version，且 workspace/task 不能交叉。AI 可以提出关系候选，不能成为关系真实性或教师批准的最终来源。

### 2.5 Lesson 与 Rubric

`LearningActivity` 记录顺序、活动分钟、转换分钟、学生动作、证据产物、困难和教师支架；与史料采用多对多关系。`RubricItem` 记录评价维度，并通过 `RubricActivity` 指向课堂实际活动；`RubricLevel` 保存有序、可观察的表现描述。

草稿允许不完整。只有进入最终签发门时，领域服务才校验七项活动、总时长 45 分钟、五个评价维度和活动—证据—量规对齐；数据库负责行内范围、顺序唯一和引用完整性。

### 2.6 Verification、Teacher Decision 与 Export

P04 不再是独立领域流程。自动来源检查和 P08 全链设计审计统一以 `VerificationRun`/`VerificationFinding` 表达，通过 `run_kind` 区分用途。教师接受风险、要求修改或完成签发的动作进入 `TeacherDecision`，不能由 AI 记录冒充。

P10 不存在独立导出聚合。`ExportRun` 属于 P09 最终审阅，必须引用一个不可变 `TaskRevision`；数据库保存格式、文件名、状态和结果摘要，不保存生成的 DOCX/PDF 文件。

P11 保持取消。任务删除有 24 小时安全窗口和当前操作撤销，但不建立回收站页面、收藏夹或永久归档能力。

### 2.7 RAG 与运行记录

`EmbeddingProfile` 固定提供商、模型、维度、距离和切片版本；`SourceChunk` 是来源版本中的可定位文本块；`ChunkEmbedding` 是可重建派生物。`ModelRun` 保存一次生成/分析的去秘密运行元数据和结果摘要；生成正文进入领域行/revision。`RetrievalHit` 保存该次运行使用的准确 task source version、chunk、排名和距离。

`Job` 与 `CommandReceipt` 分别承担当异步恢复与幂等重复请求。外部调用永不处于长数据库事务中；完成结果只有在输入 task revision/lock version 仍有效时才能应用，否则标记 `stale`。

## 3. 值对象

| 值对象 | 核心内容 | 规则 |
|---|---|---|
| `OpaqueId` | PostgreSQL 18 UUIDv7 | 可定位，不授权 |
| `WorkspaceScope` | `workspace_id` | 由服务端可信上下文确定，不接受客户端任意覆盖 |
| `SourceLocator` | URL、机构、标识符、卷/页/段、访问时间 | 至少一个稳定定位；URL 变化不改写历史版本 |
| `RightsAssessment` | 状态、依据、允许展示方式 | `unknown` 不能升级为可复制 |
| `ContentFingerprint` | SHA-256 等内容摘要 | 去重、变更检测；不是数字签名或权利证明 |
| `RevisionNumber` | task 内从 1 递增 | 不允许复用或回写 |
| `OptimisticVersion` | `lock_version` | 条件更新失败即冲突 |
| `EmbeddingIdentity` | provider/model/dimensions/distance/chunker | 任一项变化即新 profile |
| `OperationState` | queued/running/succeeded/failed/cancelled/stale | 合法转换由领域层与数据库行内约束共同保证 |

## 4. 业务不变量与保证位置

| 不变量 | 数据库保证 | 仍需应用/后端保证 |
|---|---|---|
| 私有数据不跨 workspace/task | workspace 复合唯一/外键、作用域列非空 | 从可信运行上下文注入 workspace；每个用例授权 |
| 引用指向准确来源版本 | `task_sources`、`source_versions`、`source_chunks` 复合外键 | 引文文本与定位语义相符的确定性校验 |
| 历史版本不可变 | app/worker 无 UPDATE/DELETE 权限；revision 唯一 | 只在批准节点创建；schema version 可读取 |
| 上游变化使结果 stale | 运行输入版本和当前 task version 均保存 | 影响传播计算和用户提示 |
| 史料未知/失败不能标已核验 | 状态 CHECK、finding/run 关联 | 核验规则、权利判断和教师决定 |
| 课时/问题/量规整体完整 | 正数、顺序、基数上界等行内约束 | 跨行计数、总时长和语义对齐 |
| 重复命令不重复副作用 | workspace + idempotency key 唯一 | 返回首次结果；外部调用重放控制 |
| 删除覆盖派生数据 | task 子树硬删 CASCADE/RESTRICT 计划 | 24 小时调度、备份恢复后重新清理 |

## 5. 状态与转换

### Task

`draft → designing → review_ready → approved`；上游变更可使下游对象为 `needs_review`，而不是强行倒退整个 task。`active → deleted_pending_purge → purged` 属于生命周期正交状态；`purged` 无数据库行。

### SourceVersion

`candidate → pending → verified | conditional | excluded`。失败或未知不得进入 `verified`；公共版本退役使用 `retired_at`，不改写历史核验状态。

### Job/ModelRun/ExportRun

`queued → running → succeeded | failed | cancelled | stale`。终态不可重新变为 running；重试创建新 attempt 或安全认领同一 job，不覆盖既有成功结果。

## 6. 数据分类与生命周期

- G0 合成、G1 许可明确公开资料可进入 seed/fixture；G2 只保存最小元数据/必要摘录；G3/G4 禁止；G5 密钥不进入数据库。
- Pages Demo 数据由浏览器管理；完整本地 workspace 持续保存，直到用户主动删除。
- 删除 task 后立即从普通读取隐藏，可撤销 24 小时；到期硬删 task 及私有来源、chunks、embeddings、jobs、model runs、exports 和内容性 audit。
- 公共来源仍被其他 task 使用时不得级联删除，只能停止新选择。
- 用户自行生成的外部备份不受活动库删除事务控制；恢复旧备份后必须重跑 purge。

## 7. 明确不建模

- 账号、密码、学校、班级、学生、团队、分享、管理员后台；
- 云端长期个人项目库或公网匿名 capability；
- PDF/DOCX 输入、OCR、对象存储和通用爬虫；
- 聊天消息、长期 AI 记忆、学生成绩、自动评分；
- P04、P10、P11 独立页面或重复领域状态；
- 厂商托管知识库、第二向量库、Redis/Kafka/Temporal。

上述任一项若未来进入范围，必须回到 PRD、数据库设计和相应权限/生命周期审查。
