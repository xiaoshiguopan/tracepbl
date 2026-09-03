# 授权、事务、材料安全与数据生命周期

> 文档版本：0.1
> 更新日期：2026-09-03
> 状态：用户已于 2026-09-03 批准归档

## 1. 本地会话不是账号体系

完整模式首次启动生成至少 256 位随机秘密，保存在 Compose 持久卷或权限受限的本机配置文件，不进入仓库。API 为浏览器建立 host-only、`HttpOnly`、`SameSite=Strict` Cookie；使用 HTTPS 时必须加 `Secure`，纯 loopback HTTP 的例外要由浏览器合同测试覆盖。

会话只证明请求来自同一受控本地站点，不声称识别现实教师。服务端从本地配置绑定唯一 `local_single_user` workspace，客户端不能提交、查看或替换内部 workspace ID。

## 2. 请求完整性

- API 与 Web 默认监听 `127.0.0.1`；Host 只允许配置的 localhost/loopback 主机和端口。
- CORS 默认关闭，不设置 `*`。
- 所有非安全方法同时验证 Origin、`Sec-Fetch-Site` 和会话 Cookie；不只依赖 Hono 内置 CSRF 对表单媒体类型的覆盖。
- JSON 写入必须显式为 `application/json`，并设置请求体总上限。
- Cookie、幂等键、ETag 和 task ID 都不能单独替代逐资源授权。

## 3. 逐资源授权规则

repository 的 task 查询固定形态为“当前 workspace + task ID + 未删除”；子资源通过 workspace/task 复合条件读取。以下场景均返回同一个 404：

- task 不存在；
- task 属于另一个 workspace；
- task 已进入删除窗口；
- 子资源不属于该 task；
- 构造的 source/revision/job/checkpoint 映射不属于该 task。

教师身份才能触发的决定由 API 固定 actor_kind 记录，前端传入的 `selectedBy`、`createdBy`、`verified`、`approved`、`workspaceId` 和价格/模型配置全部忽略或拒绝。Worker 角色不能写 `teacher_decisions`。

## 4. 乐观并发与影响传播

每次权威写入要求客户端携带当前 ETag/lock version。事务中的条件更新必须命中恰好一行，否则返回 412，并返回安全的当前版本摘要供前端重新加载；服务端不自动覆盖或合并教师的另一窗口修改。

上游事实变化不强行倒退整个 task，而是由 domain 计算 `ImpactSet`，将受影响的问题、关系、活动、量规、审计、签发或导出标记为 `needs_review`/stale。旧不可变 revision 不改写。

## 5. 幂等与重复请求

副作用命令先尝试创建 `command_receipts(workspace,idempotency_key,request_hash)`：

1. 新 key：状态 `processing`，执行命令；成功/失败摘要与资源 ID 同事务落盘。
2. 旧 key + 同哈希 + 已完成：返回原状态和安全摘要。
3. 旧 key + 不同哈希：409，不能复用。
4. 旧 key + processing：返回当前 operation；不得重复外部调用。

请求哈希基于规范化后的业务输入、operation 和目标资源，不包含 Cookie、traceId 或传输噪声。

## 6. URL 与文本材料

### 6.1 输入上限

- URL 最长 2048 字符，仅 `http`/`https`，只允许端口 80/443，不允许 userinfo。
- 文本最多 50,000 Unicode code points；疑似秘密、个人或学生数据时拒绝并提示删除。
- `authorizedForCurrentTask`：可保存正文、切片、embedding 并发送已披露模型；数据库权利仍为 task-only/unknown basis，不升级为公开可复用。
- `unknown`：只保存必要元数据和链接，`content_text=NULL`，不切片、不调用模型。

### 6.2 抓取边界

- 仅教师明确触发的一个普通公开页面；最多 3 次重定向。
- 连接/首包 10 秒，总时限 20 秒；下载上限 1 MiB，抽取文本上限 100,000 字符。
- 只接受 `text/html`、`text/plain`；不执行 JavaScript，不加载子资源，不提交表单。
- 不发送本地 Cookie、Authorization、Referer、客户端证书或私有 header；使用固定可识别 User-Agent。
- 每次重定向前重新规范化 URL、解析全部 A/AAAA 地址并拒绝 loopback、私网、链路本地、保留/未指定/组播和云元数据地址；连接后的远端地址仍需复核以防 DNS rebinding。
- 不绕过登录、验证码、付费墙、robots/明确禁止、内容处置或证书错误；失败后只允许教师改为粘贴文本。

抽取只保留可见文本、标题和必要定位；脚本、样式、事件属性、表单和主动内容全部丢弃。前端按纯文本呈现，模型输出也不能作为 HTML 执行。

## 7. 删除、撤销和 purge

### 删除事务

- 校验授权、If-Match、影响确认和幂等键；
- 原子写 `deleted_at` 与固定 `purge_after=deleted_at+24 hours`；
- 创建 available_at 为 purge_after 的 purge job；
- 普通读取立即隐藏，AI、审计、导出和新写入全部禁止。

### 撤销

只有当前时间早于 purge_after 且 purge job 尚未取得有效 lease 时才允许撤销；事务同时清除删除标记并取消 queued purge job。已认领时返回 `PURGE_ALREADY_STARTED`，不伪装恢复。

### 硬清理

1. fencing 阻止新工作并请求取消未完成 job；
2. 读取该 task 的全部 `model_runs.external_thread_id`；
3. 幂等调用 `PostgresSaver.deleteThread()`；
4. 确认 checkpoint 删除成功后，在数据库事务中硬删 task；
5. 依赖现有 FK 清除私有来源、revision、chunk/vector、job、运行、导出和 task 内容性审计；
6. 只留下不含内容和原 task ID 的系统级清理计数/时间。

崩溃在第 3/4 步之间时 task 仍处于删除状态，可安全重跑；不会先删 task 后遗留无法定位的 checkpoint。

### 备份恢复

外部备份不受活动库删除事务控制。每次从备份恢复后、API readiness 开放前，必须以 Worker 权限运行 overdue purge reconciliation；失败则保持服务未就绪。P11 不因恢复或清理而出现。

## 8. 事务重试

只对数据库明确的 serialization/deadlock 瞬时失败重试整个无外部副作用事务，默认最多 3 次并加随机退避。约束、权限、版本冲突和业务状态错误不重试。任何 URL、GLM 或 embedding 调用都不得包在数据库事务内。
