# 阶段 12 安全补充

CP-12-01 已由用户批准。阶段 9 未受影响的 REST、workspace 权限、教师确认、模型、技术栈和部署形态保持有效。

- 数据契约以 [恢复与费用规格](../04-database-design/RECOVERY-COST-SAFETY.md) 为准；使用新 0005，不修改旧 migration。
- API 启动和资源请求核对独立清单；删除/撤销先持久化 pending 清单再提交 DB，不能只用 DB 内记录声称灾备安全。Worker 在认领任务前核对。
- 所有生成/embedding 使用冻结价格、同一 workspace/日期金额锁。先预留、再确认执行权、后结算；已发起但未知的使用权不自动重放或释放。缺价格、价格漂移、超预算和有效租约丢失均停止调用。
- 真实生成最多预留两次 24k 输入/4k 输出；调用前使用 UTF-8 字节保守界限。固定 GLM-5.3-Flash、embedding-3/1024/cosine 不变。fake 必须零价。
- 恢复或既有库建立新基线后，数据库冻结真实调用至少 24h；旧任务队列取消，防止旧费用记录/旧请求复活。该限制不影响 fake，不构成真实调用授权。
- GLM 响应分块限 1 MiB，并验证 embedding index 唯一完整及非零向量；模型输出仍经结构和引用门禁。
- 独立清单、新基线、备份保留和失败处置见 [运行手册](../07-quality-security/RECOVERY-RUNBOOK.md)。这些维护操作没有新公共 API，不交给 Agent。
