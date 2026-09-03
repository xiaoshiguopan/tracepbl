# 数据库迁移、备份与恢复策略

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：阶段 7 已批准归档
> 本阶段只设计，不创建数据库或 migration

## 1. 基本路线

Drizzle TypeScript schema 是结构来源，生成 SQL 是可审查、可重放的交付物。Stage 8 才允许创建 `database/`、migration、seed 和数据库测试；本文件不授权提前运行任何 DDL。

迁移采用前向编号和短意图名，例如 `0001_create_core_schema.sql`。文件一经归档不得原地修改；修正已共享迁移必须新增下一迁移。Drizzle journal、schema 和 SQL 必须同一次归档，不能只提交 ORM 类型。

## 2. 初始建库顺序

1. 验证 PostgreSQL 18.x 和 pgvector 0.8.6 精确版本。
2. 以 owner/migrator 创建 `core/rag/ops/agent` schema 和非登录 owner。
3. `CREATE EXTENSION vector`；不预装 `pg_trgm` 等未被查询证据证明的扩展。
4. 创建 role/grant；API 与 Worker 不能拥有 schema。
5. 按 workspace → task → source/version → task domain → RAG → ops 的 FK 顺序建表。
6. 创建普通约束、唯一键和必要 B-tree/partial index；不创建 ANN。
7. 安装固定版本 LangGraph checkpointer 的官方 schema，并验证不污染 `core`。
8. 写入一个本地 workspace 与公开/合成 seed；不导入真实数据或本机密钥。
9. 使用 app/worker 非 owner role 执行权限冒烟测试。

## 3. 三类环境

| 环境 | 数据 | 生命周期 |
|---|---|---|
| 本地开发 | 合成/许可公开 seed + 用户自行创建的非敏感本机数据 | Docker volume 持久；用户主动重建才清空 |
| CI | 每次测试创建的合成数据 | job 结束销毁；不读取真实 GLM Key |
| GitHub Pages | IndexedDB，与 PostgreSQL 无连接 | 由访客浏览器管理 |

不建设生产数据库，不把 Docker volume、dump、`.env`、上传或下载文件提交 Git。

## 4. 安全演进模式

### 4.1 Expand / migrate / contract

破坏性变化拆成三步：先增加向后兼容列/表；回填并双读验证；最后在所有消费者切换后移除旧结构。增加 NOT NULL 时先加可空列或稳定默认、分批回填、验证无 NULL，再加约束；大索引根据锁风险选择独立 migration 和 `CREATE INDEX CONCURRENTLY`。

### 4.2 数据回填

- 每批有明确上限、稳定排序和断点；重复运行结果一致。
- 回填记录 migration 版本、已处理数量、失败数量和校验查询，不复制正文到日志。
- source/chunk/embedding 使用 content hash 去重；模型变化新建 profile，不覆盖旧向量。
- 旧前端 snapshot 导入必须先通过版本化 adapter；不能把 IndexedDB JSON 直接插入表。

### 4.3 不能自动回滚的变化

DROP、不可逆内容转换、hard purge、向量重建和第三方 checkpointer schema 变化不能仅靠 `down.sql` 复原。处理顺序是：事前 `pg_dump -Fc`、迁移验证、失败时优先前向修复；确认需要恢复时停止写入并恢复到新空库，再验证后切换。

## 5. 备份

- 手动备份采用 PostgreSQL custom format：`pg_dump -Fc`；命令和包装脚本在阶段 8 设计为显式目标路径，不自动覆盖已有文件。
- dump 放在仓库外；旁置 manifest 记录应用 commit、PostgreSQL/pgvector 版本、migration head、创建时间和校验值。
- 破坏性 migration 前必须备份；普通本地编辑不承诺自动每日备份。
- role/global object 由可重放 migration 管理，不依赖把开发机所有 cluster role 一并复制。
- API Key、`.env` 和外部下载文件不进入 dump manifest。

## 6. 恢复演练

1. 创建全新 PostgreSQL 18 实例，并确认服务器已安装兼容的 pgvector 软件包。
2. 用独立 bootstrap 步骤创建 dump 不包含的登录/非登录 role 和空目标 database；不预建业务 schema/table。
3. 使用 `pg_restore` 把 custom dump 恢复到空 database；其中的 schema、table 和 extension 定义必须成功，错误即失败且不开放应用。
4. 从 dump manifest 记录的 migration head 继续运行后续 migration 到当前 head。
5. 先运行 `purge_after <= now()` 的到期清理，避免删除内容复活。
6. 执行 `ANALYZE`，再核对表数量、task/revision/source/citation/chunk/embedding 关联和无孤儿查询。
7. 以 app/worker role 运行权限与主链冒烟测试。
8. 保存去内容化结果；删除演练数据库。

备份只有完成恢复演练才算有效。当前本地模式不承诺 PITR、RPO 或 RTO；若未来上线，再单独批准 WAL/PITR、加密、异地副本和保留期限。

## 7. 发布兼容窗口

数据库 migration 先于依赖新列的 API/Worker 版本；删除旧列晚于所有旧消费者退出。GitHub Pages 不接数据库，因此 migration 失败不得影响静态 Demo。阶段 8 只完成数据库编码，不提前设计具体 HTTP API；兼容性以现有 frontend contract 的字段和错误语义验证。

## 8. 失败与恢复

| 失败 | 处理 |
|---|---|
| migration SQL 失败 | 同一事务回滚；修正草案后重建临时库重放，不改已归档文件 |
| concurrent index 失败 | 删除 invalid index 后重试独立 migration；不假定事务自动清理 |
| 回填中断 | 从已验证断点继续；唯一键和 hash 防重复 |
| extension 缺失/版本错 | 启动失败并说明版本；不退回普通 float array 冒充 pgvector |
| checkpointer migration 失败 | 保持 `core` 不变，停止 Agent 部分并回技术决策核对版本 |
| restore 部分成功 | 不开放应用；丢弃目标库，从空库重新恢复 |
| hard purge 后误删 | 活动库不承诺恢复；24 小时窗口和事前影响提示是唯一普通撤销路径 |

## 9. 阶段 8 迁移门禁

- 空库从 0 到 head 成功两次；第二次不产生漂移。
- 每个 schema object 都能追到批准设计。
- 所有 FK、CHECK、UNIQUE、grant 和索引有直接测试。
- seed 幂等且只含 G0/G1/G2 允许内容。
- dump/restore 经过至少一次全新库演练。
- `git diff --check`、秘密扫描和 migration 审查通过。
- 阶段 7 已获批准归档，但阶段 8 仍须用户另行明确授权后才能开始以上实施。
