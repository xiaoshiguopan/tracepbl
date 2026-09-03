# 后端架构与服务边界

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档

## 1. 架构结论

史证工坊后端是 TypeScript 模块化单体，不是微服务。完整模式有两个长期进程：Hono API 处理短请求，Node Worker 处理可恢复的异步工作；二者共享领域契约和 PostgreSQL，但使用不同最小权限角色。

```text
apps/web ─ REST/SSE ─> apps/api ─> domain use cases ─> repositories ─> PostgreSQL
                                      │
                                      └─ enqueue job
                                             │
apps/worker <─ claim/lease ─ ops.jobs <──────┘
    ├─ packages/retrieval
    ├─ packages/ai / GLM adapter
    └─ LangGraph.js / agent schema
```

## 2. 模块职责与依赖

| 模块 | 可以 | 不可以 |
|---|---|---|
| `packages/domain` | 状态机、影响传播、门禁、费用/删除纯规则、用例端口 | 导入 Hono、React、SQL、LangGraph 或 GLM |
| `packages/contracts` | Zod DTO、Problem、SSE event、OpenAPI metadata | 暴露数据库行、保存副作用、复制 UI store |
| `apps/api` | 会话、workspace 注入、HTTP 校验、授权、用例调用、SSE | 外部模型长调用、直接拼 SQL、把 task ID 当权限 |
| `apps/worker` | 认领 job、租约、重试、取消、调用受限适配器 | 教师批准、普通 CRUD、扩大数据/费用范围 |
| `packages/database` | repository、Unit of Work、事务、迁移 | 把 Drizzle/SQL 类型作为公共 API |
| `packages/retrieval` | 规范化、切片、embedding、检索、引用验证 | 跨 task 检索私人内容、认定历史事实 |
| `packages/ai` | provider adapter、模板、结构校验、短 LangGraph | 权限、删除、预算和引用完整性的最终决定 |
| `packages/fixtures` | 合成/公开 fixture、fake provider | 保存真实密钥或真实个人/学生数据 |

依赖只向稳定内层；所有外部实现通过显式端口注入。禁止万能 service、循环依赖和请求级可变全局状态。

## 3. 主要用例

### 3.1 同步用例

- 建立、列表、继续和复制当前 workspace 任务；
- 保存教学情境、问题、史料选择、证据图、活动和量规；
- 教师采用/否决 AI 建议；
- 记录教师决定和最终签发；
- 删除及宽限期撤销；
- 查询视图、运行状态和导出 manifest。

同步用例只允许数据库短事务，不等待 URL、GLM 或 embedding。

### 3.2 异步用例

- 单 URL 获取与基础来源检查；
- 来源切片和 embedding；
- 问题、证据、活动、量规建议；
- 设计审计；
- 不可变导出 manifest 准备；
- 到期 purge。

P03 多材料按独立子 job 执行，API 聚合为 `partial`，单项失败不清空已成功项。

## 4. Controller、领域服务与 repository

HTTP controller 只做：读取可信会话、解析参数、调用 Zod、建立 trace/correlation ID、调用一个用例、映射 HTTP 状态。它不读写表、不判断门禁、不组织 prompt。

领域服务负责跨实体规则，例如：上游变化影响哪些下游、哪些史料可导出、教师是否能采用建议、删除是否仍可撤销。普通确定性规则不能下放给 Agent。

repository 每个方法都要求 `WorkspaceScope`；task 子资源还要求 task ID。返回领域对象或明确结果，不返回 ORM 行。不存在和不属于当前 workspace 都返回同一 `NotFound`。

## 5. 事务边界

| 场景 | 一个事务内 | 事务外 |
|---|---|---|
| 普通保存 | 授权查询、版本比较、当前状态写入、影响传播、审计、幂等回执 | 无 |
| 提交异步动作 | 授权、预算预留、model/run/job/回执创建、事件 | URL/模型/embedding |
| Worker 完成 | 用 lease fence 更新运行状态、校验 input lock、写 revision/hit/finding/event | 已结束的外部调用 |
| 采用建议 | 校验 generated revision、当前版本和门禁，复制到当前状态，创建 teacher revision | 无 |
| 删除 | 标记删除、创建延迟 purge、事件/回执 | 到期硬删 |
| purge | checkpoint 先在独立幂等步骤删除；随后硬删 task 子树 | checkpoint 删除不与领域表伪装成原子事务 |

## 6. AI 建议与领域真相

Worker 的结构化结果先写入不可变 `task_revision(reason='generated', created_by='worker')`，当前关系表不变。教师采用时，API 在新事务中重验版本、来源、引用和状态，再写当前关系表并创建 `teacher_confirmed` revision。stale、失败、取消或引用不合格的结果不得成为可采用 revision。

## 7. 前端适配边界

- API read model 对齐现有 P01—P09 view model，不要求前端直接理解数据库表。
- Demo adapter 和 API adapter 消费同一 `packages/contracts`；Demo 继续使用 IndexedDB 和预生成结果。
- 运行模式必须显式选择；不能通过请求 localhost 成败自动切换。
- P12 仍是对象零读取的安全落页；后端 404 不回显用户提交的未知 ID。
