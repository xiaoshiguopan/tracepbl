# 数据库访问控制与隔离设计

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：阶段 7 已批准归档
> 当前产品模式：本地单用户；默认仅监听 `127.0.0.1`

## 1. 结论

v0.1 不建立产品账号、学校组织、管理员后台、分享链接或公网匿名 capability。每个本地安装创建一个内部 workspace，Hono 从可信启动配置取得 workspace，不接受浏览器指定另一个 workspace。task ID 仅定位，不能提升为授权凭证。

当前不启用 RLS。原因不是数据无需保护，而是本地单用户没有真实数据库身份可映射；此时复杂 RLS 会重复 Hono 的 workspace 判断，且表 owner 默认可绕过，容易产生虚假安全感。替代控制是：数据库角色分离、应用非 owner、workspace 复合外键、默认 localhost、服务端逐资源检查和跨 workspace 负向测试。

## 2. 参与者与信任边界

| 参与者 | 可做 | 不可做 |
|---|---|---|
| Pages Demo 访客 | 操作自己浏览器 IndexedDB 中的公开/合成内容 | 访问 PostgreSQL、GLM Key、他人浏览器数据或真实 API |
| 本地教师 | 通过同源 Hono 使用当前本地 workspace 的任务 | 指定其他 workspace、直接连接数据库、访问禁止数据 |
| Hono API | 当前领域数据 CRUD、事务、读写幂等记录 | 迁移 schema、读取密钥值、修改不可变 revision/source version |
| Worker | 认领 job、写入 chunk/vector/model run 结果、执行到期清理 | 教师批准、任意修改当前任务、迁移 schema |
| Migrator | 创建/修改 schema、extension、role、grant | 承担日常 API 请求 |
| Backup operator | 只读完整备份和受控恢复 | 作为应用账号运行或把备份写入 Git |
| 仓库维护者 | 管理本地环境和迁移 | 通过产品隐藏入口冒充管理员 |

## 3. 数据库角色

| 数据库角色 | 连接 | 核心权限 |
|---|---:|---|
| `tracepbl_owner` | 否 | 拥有 schema/对象；不用于应用运行 |
| `tracepbl_migrator` | 仅迁移 | 对批准 schema 执行 DDL、extension 和 grant |
| `tracepbl_app` | API | 当前可变领域表最小 SELECT/INSERT/UPDATE；无 schema DDL、无历史 UPDATE |
| `tracepbl_worker` | Worker | jobs、RAG 派生表和运行结果所需最小权限 |
| `tracepbl_backup` | 手动 | 备份所需只读；恢复使用独立受控身份 |

API 和 Worker 使用不同 `DATABASE_URL`；`.env.example` 只列变量名。数据库凭据、智谱 Key、Authorization 和连接串不得写入表、fixture、日志、截图或 Git。

## 4. 资源操作矩阵

| 资源/动作 | 本地教师经 API | API role | Worker role | Migrator |
|---|---:|---:|---:|---:|
| 读取/编辑当前 task | 允许 | 允许且带 workspace | 禁止任意编辑 | 结构维护，不作产品操作 |
| 创建 revision | 在批准节点触发 | INSERT/SELECT | 可为受控生成结果插入，不可改写 | 结构维护 |
| 公共 source/version | 只读/选择 | SELECT | 受控导入/核验 INSERT | 结构维护 |
| 私有 URL/文本 source | 当前 task 内允许 | CRUD | 仅处理已登记内容 | 结构维护 |
| chunk/embedding | 只通过检索结果读取 | 受限 SELECT | INSERT/重建/清理 | 结构维护 |
| teacher decision | 教师明确动作 | INSERT/SELECT | 禁止创建或修改 | 结构维护 |
| verification/model run | 查看安全结果 | 发起/读取 | 执行/写结果 | 结构维护 |
| export run | 主动触发/取消 | INSERT/UPDATE 状态 | 可执行生成工作 | 结构维护 |
| task 删除/撤销 | 明确动作 | 设置/清除删除标记 | 到期硬删 | 不作普通删除 |
| schema/migration | 禁止 | 禁止 | 禁止 | 允许 |

## 5. 拒绝场景

必须以相同安全结果拒绝：客户端提交其他 workspace ID；通过猜测 UUID 读写别的 workspace；把未选 source version 接到 claim/activity；读取已 `deleted_at` 的 task；旧 `lock_version` 覆盖新版本；Worker 为教师创建批准决定；普通 app 修改 revision、source version 或 audit event；前端直接提交 `verified`/`approved` 派生状态。

“无权”和“不存在”在未来对外模式中必须保持不可区分。当前 localhost 模式仍要保留 repository 查询的 workspace 条件，证明 schema 没有堵死未来安全升级。

## 6. RLS 决策与未来触发条件

| 阶段 | 决定 |
|---|---|
| 当前本地单用户 | 不启用 RLS；workspace 列、复合外键、最小角色和服务端授权必须存在 |
| 局域网开放、账号、团队或分享被提出 | 立即退回 PRD/数据库/后端设计；不得只修改监听地址 |
| 未来多用户获批 | 增加 users/members；app 非 owner；`ENABLE` + 必要时 `FORCE ROW LEVEL SECURITY`；策略只用稳定 workspace 归属；所有策略以非超级用户负向测试 |

即使未来使用 RLS，Hono 用例授权仍不可删除；RLS 是纵深防御，不负责动作级状态、教师批准或许可判断。

## 7. GLM 与外部传输

- GLM-5.3-Flash/Embedding-3 只由 Worker 调用；浏览器和数据库不持有 Key。
- 仅发送完成当前步骤必需的公开、合成或教师明确提交的非敏感文本片段。
- 禁止学生身份、作品、成绩、教师个人资料、秘密和未获权材料。
- 模型输出是不可信输入，必须结构化校验；不得直接执行 SQL、Shell、HTML 或外部写入。
- 国内智谱账号的数据保留、训练用途和模型权限在真实联调前重新复核；未复核前只用合成/许可公开内容。

## 8. 删除、备份和运维访问

删除后普通查询立即不可见；24 小时内只允许当前操作撤销，不提供 P11 回收站。到期 hard purge 删除全部 task 内容与派生数据。外部 `pg_dump` 不可能被活动库事务追溯删除，因此备份恢复后必须先运行到期清理，再开放应用。

本地项目不设内容浏览型管理后台。排障优先使用计数、状态、关联 ID 和去内容化错误；确需检查合成测试内容时使用专用开发库，不把内容复制到日志或 issue。
