# 史证工坊数据库 Schema 设计

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：阶段 7 已批准归档
> 目标版本：PostgreSQL 18.6、pgvector 0.8.6、Drizzle ORM 0.45.2、postgres.js 3.4.9

## 1. 全局约定

- schema：`core` 保存领域真相，`rag` 保存可重建检索数据，`ops` 保存作业/幂等/去内容化审计，`agent` 隔离 LangGraph checkpointer 自有表。
- 对外领域 ID：`uuid NOT NULL DEFAULT uuidv7()`；高写入且不对外暴露的明细用 `bigint GENERATED ALWAYS AS IDENTITY`。
- 名称：小写 `snake_case`，不使用带引号混合大小写。
- 时间：全部 `timestamptz`；日期才用 `date`。
- 文本：使用 `text`；长度要求用 `CHECK (length(...) <= n)`。
- 状态：`text + CHECK`，避免业务状态被 PostgreSQL enum 锁死。
- JSONB：仅用于不可变快照、模型结构化结果、定位和可变元数据；核心关系必须有列和外键。
- 所有 FK 列建立对应 B-tree 索引；所有 workspace 内引用同时校验 `workspace_id`。
- 每个带 `workspace_id/task_id/id` 的被引用实体都声明 `UNIQUE(workspace_id,task_id,id)`；`task_sources` 声明 `UNIQUE(workspace_id,task_id,source_version_id)`。这是复合 FK 可落地的必要候选键，不因 `id` 已是 PK 而省略。
- 普通应用角色不得 UPDATE/DELETE 不可变表；状态变化通过新增记录或限定更新完成。

## 2. `core` 表

### 2.1 `core.workspaces`

用途：完整本地系统的数据隔离根；v0.1 启动时只有一行。

| 字段 | 类型 | 必填/默认 | 约束与说明 |
|---|---|---|---|
| `id` | uuid | 必填；`uuidv7()` | PK |
| `mode` | text | 必填；`local_single_user` | CHECK 仅允许当前模式 |
| `display_name` | text | 必填；`本地工作区` | 长度 1—80 |
| `created_at` | timestamptz | 必填；`now()` | 创建时间 |
| `updated_at` | timestamptz | 必填；`now()` | 由写入逻辑维护 |

删除：应用无 DELETE；完全重置走受控重建。敏感级别：G0 配置，不含身份。

### 2.2 `core.tasks`

用途：备课任务根、当前生命周期和乐观并发。

| 字段 | 类型 | 必填/默认 | 约束与说明 |
|---|---|---|---|
| `id` | uuid | `uuidv7()` | PK；不透明定位符，不授权 |
| `workspace_id` | uuid | 必填 | FK workspace，`ON DELETE RESTRICT` |
| `title` | text | 必填 | 1—120 字符 |
| `workflow_state` | text | `draft` | CHECK：`draft/designing/review_ready/approved` |
| `lock_version` | bigint | `0` | CHECK `>= 0`；每次权威写入递增 |
| `revision_seq` | bigint | `0` | CHECK `>= 0`；task revision 号分配器 |
| `last_activity_at` | timestamptz | `now()` | 本地排序和运行信息，不触发自动过期 |
| `deleted_at` | timestamptz | 可空 | 非空即从普通读取隐藏 |
| `purge_after` | timestamptz | 可空 | 与 `deleted_at` 同空/同非空，且固定为 `deleted_at + interval '24 hours'` |
| `created_at`/`updated_at` | timestamptz | `now()` | 审计时间 |

唯一/索引：`UNIQUE (workspace_id,id)`；活动任务 `(workspace_id,updated_at DESC) WHERE deleted_at IS NULL`；清理 `(purge_after) WHERE purge_after IS NOT NULL`。删除：workspace RESTRICT；到期任务由 worker 硬删，其子树按下文规则处理。敏感级别：G0/G1/G2 内容容器。

### 2.3 `core.task_contexts`

用途：P01 教学情境和 P06 非个人学情条件；与 task 一对一。

| 字段 | 类型 | 必填/默认 | 约束与说明 |
|---|---|---|---|
| `task_id`、`workspace_id` | uuid | 必填 | PK `task_id`；复合 FK 到 task，CASCADE |
| `stage` | text | 必填 | `junior/senior` |
| `grade` | text | 必填 | 学段与年级组合 CHECK |
| `textbook`、`lesson` | text | 必填 | 各 1—160 |
| `lesson_types` | text[] | `{}` | 有序小集合，不作实体关系 |
| `minutes` | integer | 必填 | CHECK 1—180 |
| `inquiry_direction` | text | 可空 | 最长 500 |
| `prior_knowledge` | text | 可空 | 非个人教学描述 |
| `learning_needs` | text[] | `{}` | 不得含学生身份 |
| `profile_note` | text | 可空 | 最长 2,000；敏感模式由应用拒绝 |
| `updated_at` | timestamptz | `now()` | 当前状态时间 |

### 2.4 `core.inquiry_questions`

用途：P02 中心问题、子问题、证据产物和范围。

字段：`id uuid PK`、`workspace_id uuid`、`task_id uuid`、`parent_id uuid NULL`、`kind text`（`central/sub`）、`ordinal integer`（`>=0`）、`question_text text`（1—1,000）、`input_type text NULL`、`evidence_outcome text NULL`、`scope_boundary text NULL`、`confirmed_at timestamptz NULL`、`review_state text`（`ready/needs_review`）、时间戳。

约束：复合 FK 到 task；parent 必须在同 workspace/task；`central` 的 parent 为空且 ordinal=0，`sub` 必须有 parent 且 ordinal 1—3；`UNIQUE(task_id,kind,ordinal)`；每个 task 最多一个 central。草稿不强制恰好三个子问题，最终签发事务再验证。

### 2.5 `core.sources`

用途：史料稳定身份和作用域，不保存“当前页面卡片”。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | UUIDv7 |
| `scope` | text | `catalog/task_private` |
| `workspace_id` | uuid NULL | catalog 必须为空；private 必填 |
| `task_id` | uuid NULL | private 必填；复合 FK 同 workspace；catalog 为空 |
| `material_kind` | text | `catalog/url/text`；当前不含 file |
| `title` | text | 1—300 |
| `canonical_url` | text NULL | URL 材料必填；数据库只存字符串，安全抓取属后端阶段 |
| `data_class` | text | `synthetic/public_licensed/public_unknown` |
| `retired_at` | timestamptz NULL | 公共来源停止新选择，不删除历史 |
| 时间戳 | timestamptz | 创建/更新时间 |

约束：scope 与 workspace/task/material_kind 的空值组合 CHECK；partial unique index `(workspace_id,task_id,canonical_url) WHERE scope='task_private' AND canonical_url IS NOT NULL` 用于任务内 URL 去重。文本材料允许相同标题，不能用标题或 NULL URL 做数据库自然键；正文候选去重使用 source version 的 content hash。`scope/workspace_id/task_id/material_kind` 创建后不可变，普通角色只可更新标题或设置公共 `retired_at`；改变作用域必须新建 source。

`core.task_sources` 写入时还需一个窄范围的数据库 scope guard：公共 catalog source 可被任一同 workspace task 选择；task_private source 必须同时满足 `source.workspace_id = task.workspace_id` 且 `source.task_id = task.id`。普通 CHECK/FK 无法表达这组三表关系，因此只为此不变量使用延迟约束触发器；它不是业务流程触发器，也不代替服务层鉴权。

### 2.6 `core.source_versions`

用途：可引用、不可变的史料内容和出处快照。

字段：`id uuid PK`、`source_id uuid FK`、`version_no bigint >0`、`creator_or_institution text`、`period_label text NULL`、`source_type text`、`identifier text NULL`、`locator text`、`accessed_at timestamptz NULL`、`language_code text DEFAULT 'zh-CN'`、`content_text text NULL`、`context_note text NULL`、`meaning_note text NULL`、`interpretation_note text NULL`、`limitation_note text NULL`、`rights_state text`（`verified_reusable/restricted_metadata_only/unknown/not_allowed`）、`rights_basis text`、`verification_state text`（`candidate/pending/verified/conditional/excluded`）、`content_hash text`、`created_at timestamptz`。

约束：`UNIQUE(source_id,version_no)`；`UNIQUE(source_id,content_hash)`；`UNIQUE(id,source_id)`；hash 为 64 位小写十六进制；`not_allowed` 不得同时 `verified`；`restricted_metadata_only/not_allowed` 不保存全文也不生成 chunk。task_private 的 `verified_reusable` 只表示教师确认可在当前 task 中处理，不扩大为公开再分发，具体依据写入 `rights_basis` 并受 source scope 限制。应用/worker 无 UPDATE/DELETE，变更必须新增 version。source 物理删除时版本 CASCADE；catalog source 在当前生命周期只可退役，app/worker 无 source DELETE 权限。

### 2.7 `core.task_sources`

用途：task 明确选择的准确 source version；是证据和活动可引用清单。

字段：`workspace_id`、`task_id`、`source_version_id`、`selection_order integer >=0`、`selected_by text`（当前 `teacher`）、`selected_at`、`review_state`（`ready/needs_review`）。PK `(task_id,source_version_id)`；另有候选键 `(workspace_id,task_id,source_version_id)`；同 task 的 `selection_order` 唯一；复合 FK 保证 task/workspace，一般 source version FK RESTRICT。删除 task CASCADE；移除选择前必须先处理引用，默认 RESTRICT。

### 2.8 `core.evidence_claims`

字段：`id uuid PK`、workspace/task 复合 FK CASCADE、`question_id uuid NULL`、`claim_text text`（1—2,000）、`ordinal integer >=0`、`gap_accepted boolean DEFAULT false`、`review_state text`、时间戳。唯一 `(task_id,ordinal)`；question 必须同 task。

### 2.9 `core.evidence_relations`

用途：命题与已选史料版本的有理由关系。

字段：`id uuid PK`、workspace/task、`claim_id`、`source_version_id`、`relation_kind text`（`background/supports/turning_point/consequence/challenges_or_limits`）、`reason text`（1—2,000）、`review_state text`、时间戳。复合 FK 到 claim 和 task_source；`UNIQUE(task_id,claim_id,source_version_id,relation_kind)`，重复建立返回既有关系。

### 2.10 `core.evidence_citations`

用途：relation 对准确片段的引用定位。

字段：`id uuid PK`、workspace/task、`relation_id uuid`、`source_version_id uuid`、`chunk_id bigint NULL`、`locator_text text`、`quoted_text text NULL`、`quote_hash text NULL`、`ordinal integer >=0`、时间戳。relation、version、chunk 均必须同 task/source version；`UNIQUE(relation_id,ordinal)`。quoted text 是必要短引，不替代 source version；保存前做定位/哈希一致性校验。

### 2.11 `core.learning_activities` 与 `core.activity_sources`

`learning_activities` 字段：UUID PK、workspace/task、`ordinal integer`、`title text`、`activity_minutes integer >=0`、`transition_minutes integer >=0`、`student_action text`、`evidence_product text`、`difficulty text`、`scaffold text`、`teacher_edited boolean`、`review_state text`、时间戳。`UNIQUE(task_id,ordinal)`。

`activity_sources`：PK `(activity_id,source_version_id)`，带 workspace/task；复合 FK 到 activity 与 task_source。task 删除 CASCADE；移除 task source 时 RESTRICT。七项和 45 分钟总和在签发事务验证。

### 2.12 `core.rubric_items`、`core.rubric_levels`、`core.rubric_activities`

- `rubric_items`：UUID PK、workspace/task、ordinal、title、teacher_edited、review_state、时间戳；`UNIQUE(task_id,ordinal)`。
- `rubric_levels`：bigint identity PK、rubric_item_id、`level_key`（`support/expected/strong`）、ordinal、label、description；每项至少三个层级由签发事务验证，键和 ordinal 唯一。
- `rubric_activities`：PK `(rubric_item_id,activity_id)`，workspace/task 复合 FK，证明评价来自实际活动。

### 2.13 `core.verification_runs` 与 `core.verification_findings`

`verification_runs`：UUID PK、workspace/task、`run_kind`（`source_check/design_audit`）、`input_lock_version bigint`、`status`、`started_at/completed_at`、`reused_from_run_id NULL`、`summary jsonb`。P04 自动核验以 `source_check` 并入 P03；P08 使用 `design_audit`。

`verification_findings`：UUID PK、run/task/workspace、`severity`（`blocking/teacher_confirmation/suggestion/pass/unknown`）、`category`、`subject_kind`、受控 `subject_id uuid NULL`、title、basis、impact、recommendation、`resolution_state`（`pending/accepted/resolved/superseded`）、时间戳。subject 是展示定位，不作为通用多态外键授权依据；可强制的关联另由 run/task 复合 FK保证。

### 2.14 `core.teacher_decisions`

用途：只保存教师明确动作。

字段：UUID PK、workspace/task、`finding_id uuid NULL`、`task_revision_id uuid NULL`、`decision_kind`（`accept_risk/request_changes/approve/revoke`）、`reason text NULL`、`decided_at`。CHECK 要求 finding/revision 恰有一个非空，并限制其合法 decision_kind；两个 FK 均需同 task。普通 worker 无 INSERT/UPDATE/DELETE 权限。

### 2.15 `core.task_revisions`

用途：不可变里程碑快照。

字段：`id uuid PK`、workspace/task、`revision_no bigint >0`、`reason`（`generated/teacher_confirmed/audit_completed/final_approved/exported`）、`schema_version integer >0`、`base_lock_version bigint`、`snapshot jsonb`、`content_hash text`、`created_by text`（`teacher/system/worker`）、`created_at`。`UNIQUE(task_id,revision_no)` 和 `UNIQUE(task_id,content_hash,reason)`；snapshot 必须为 object。无 UPDATE/DELETE grant；task 硬删 CASCADE。

### 2.16 `core.export_runs`

字段：UUID PK、workspace/task、`task_revision_id`、`format`（`docx/pdf`）、`file_name`、`status`、`idempotency_key`、`error_code NULL`、`started_at/completed_at`。`UNIQUE(workspace_id,idempotency_key)`；只保存运行记录，不保存文件、下载路径或浏览器成功猜测。task/revision 硬删 CASCADE。

## 3. `rag` 表

### 3.1 `rag.embedding_profiles`

字段：UUID PK、`provider`=`zhipu`、`model`=`embedding-3`、`dimensions integer`=1024、`distance`=`cosine`、`chunker_version text`、`active boolean`、`created_at`。唯一 `(provider,model,dimensions,distance,chunker_version)`；被 embedding 使用时 RESTRICT。模型/切片变化新增 profile，不原地修改。

### 3.2 `rag.source_chunks`

字段：`id bigint identity PK`、`source_version_id uuid`、`ordinal integer >=0`、`heading text NULL`、`content_text text`、`char_start integer NULL`、`char_end integer NULL`、`locator jsonb`、`content_hash text`、`created_at`。唯一 `(source_version_id,ordinal)`、`(source_version_id,content_hash)` 与 `(id,source_version_id)`；最后一项允许 citation 用复合 FK 同时锁定 chunk 与 source version。范围成对为空或 `0 <= start < end`。source version 硬删时 CASCADE；只有有权内容可切片。

### 3.3 `rag.chunk_embeddings`

字段：`chunk_id bigint`、`embedding_profile_id uuid`、`embedding vector(1024)`、`created_at`；PK `(chunk_id,embedding_profile_id)`。chunk CASCADE、profile RESTRICT。向量必须 finite；当前不建 HNSW/IVFFlat。

### 3.4 `rag.model_runs`

字段：UUID PK、workspace/task、`task_revision_id NULL`、`purpose`（`question_guidance/source_analysis/evidence_analysis/lesson/rubric/audit`）、provider/model、prompt_template_version、`input_fingerprint`、`status`、`result_summary jsonb NULL`、input/output/total tokens、`estimated_cost numeric(12,6) NULL`、`error_code NULL`、`external_thread_id NULL`、started/completed、时间戳。

不保存 API Key、Authorization、完整厂商响应、完整生成正文或无必要的原始 prompt；生成正文进入对应领域行/revision，run 只留去内容化摘要。结果写入时核对 task `lock_version`；过期结果状态为 `stale`。

### 3.5 `rag.retrieval_hits`

字段：bigint identity PK、`workspace_id uuid`、`task_id uuid`、`model_run_id uuid`、`source_version_id uuid`、`chunk_id bigint`、`rank integer >0`、`cosine_distance double precision`（0—2）、`keyword_score double precision NULL`、`selected_for_context boolean`、`created_at`。复合 FK `(workspace_id,task_id,model_run_id)` 到 model run、`(workspace_id,task_id,source_version_id)` 到 task source、`(chunk_id,source_version_id)` 到 chunk；唯一 `(model_run_id,rank)` 和 `(model_run_id,chunk_id)`。这样数据库直接拒绝保存未被该 task 选择的私有/公共版本命中；相似度不称为真实性。

## 4. `ops` 与 `agent` 表

### 4.1 `ops.jobs`

UUID PK；workspace/task/model_run 可空但必须满足 job kind 所需关系；字段含 `job_kind`、`status`、`priority`、`attempts`、`max_attempts`、`available_at`、`locked_at/locked_by`、`idempotency_key`、只含引用和参数的 `payload jsonb`、`error_code/error_summary`、时间戳。唯一 `(workspace_id,idempotency_key)`；可认领索引 `(status,available_at,priority DESC)`；不在 payload 复制史料正文。

### 4.2 `ops.command_receipts`

UUID PK；workspace、task 可空、`idempotency_key`、operation、request_hash、status、resource_kind/resource_id、`response_summary jsonb`、`expires_at`、时间戳。唯一 `(workspace_id,idempotency_key)`；同键不同 request hash 必须冲突，不能复用首次响应。

### 4.3 `ops.audit_events`

bigint identity PK；workspace/task、`actor_kind`（`teacher/api/worker/system`）、action、entity_kind/entity_id、correlation_id、去内容化 metadata、occurred_at。仅 INSERT/SELECT；不保存正文、prompt、秘密或前后完整快照。task 硬删时其内容性事件 CASCADE，以满足已确认的彻底删除语义。

### 4.4 `agent` schema

由固定版本 LangGraph PostgreSQL checkpointer 的官方 migration 管理；不手写猜测其内部表，不向 `core` 建外键。只允许 worker 的独立角色访问。若阶段 8 发现固定 checkpointer 与 PostgreSQL 18 不兼容，停止并返回技术决策；不得让 checkpoint 成为 task、批准或引用的真相源。

## 5. 状态转换约束

数据库用 CHECK 拒绝未知值，用有限 UPDATE 权限和条件更新拒绝终态复活；跨行转换由事务用例保证：

- completed/failed/cancelled/stale run 不回到 running；重试使用同 job 新 attempt 或新 run。
- approved task 的上游编辑先递增 lock version，并将受影响对象标 `needs_review`；旧 revision 保留。
- deleted task 只能在 `purge_after` 前撤销；到期后 hard purge，无普通恢复。
- verification 的 unknown/failed 不能被数据库默认成 pass；教师 accept risk 与 system pass 是不同记录。

## 6. 删除矩阵

| 父对象 | 子对象 | 行为 | 理由 |
|---|---|---|---|
| workspace | task/private source | RESTRICT | 防止误删整个本地库 |
| task | 当前领域行/revision/run/job/export/audit/private source | hard purge 时 CASCADE | 完整清除任务内容与派生物 |
| catalog source | source version | 只退役；普通角色禁止 DELETE | 保留历史引用；owner 的物理维护删除会 CASCADE，但不属于当前产品操作 |
| source version | task source/citation | RESTRICT | 不允许悬空引用 |
| task source | evidence/activity 关系 | RESTRICT | 先展示影响并显式处理 |
| source version | chunks | 受控删除时 CASCADE | chunk/embedding 可重建 |
| chunk | embedding/hit | CASCADE | 派生物不孤立 |
| embedding profile | embedding | RESTRICT | 避免错解释现有向量 |

## 7. 敏感级别与保留

- workspace/task/教学设计：G0/G1/G2；本地持续保存，主动删除后 24 小时 hard purge。
- 私有 URL/文本：只允许经声明的非敏感内容；与 task 同生命周期。
- 公共 catalog：按版本长期保留；退役不删除历史。
- model/job/audit：去秘密、最小化；与 task 同生命周期。
- API Key、数据库密码、capability、Cookie：G5，禁止入库。
- 外部备份：仓库外由本地用户保管；恢复后必须重跑 purge，不能宣称 hard purge 会删除既有备份文件。
