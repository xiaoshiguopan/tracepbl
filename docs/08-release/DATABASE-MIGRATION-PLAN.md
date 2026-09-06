# 本次发布的数据库计划

本次只发布静态 Demo，GitHub Pages 没有数据库，不执行生产 migration、seed、restore 或真实数据导入。GitHub CI 运行 migration 0001—0005 仅针对临时合成 PostgreSQL，不接入用户本地数据库。

完整模式继续按 [恢复手册](../07-quality-security/RECOVERY-RUNBOOK.md) 操作。阶段 12 恢复保护和阶段 13.2 空库演练证据保留，不因网页发布重新迁移已有预览库。未来后端部署、真实数据或新 migration 须另行变更批准。
