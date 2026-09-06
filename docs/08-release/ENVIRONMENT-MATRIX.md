# 发布环境矩阵

| 环境 | 运行内容 | 数据/访问 | 外部模型 |
|---|---|---|---|
| GitHub Pages 候选 | apps/web/dist 静态 HTML/CSS/JS/字体/最终影片；没有服务端 | 公开/合成 fixtures、预生成结果；访客各自 IndexedDB | 不调用 |
| 本地完整模式 | API、Worker、PostgreSQL、checkpointer | localhost；本机共享工作区，任务隔离 | 默认 disabled，本轮测试 fake |
| CI | Ubuntu 临时 PostgreSQL、测试和静态构建 | 合成 fixtures，流水线结束即环境终止 | fake |

阶段 14 不部署 API、Worker、数据库、对象存储、模型代理、账号系统或公网管理入口。Pages 公开是演示发布，不是完整模式的生产上线。Pages 环境与本地预览不是同一域，其浏览器数据不能自动迁移。

发布账号已核实为 xiaoshiguopan，目标为 xiaoshiguopan/tracepbl（尚未创建）；当前静态 base 固定 /tracepbl/，必须匹配仓库名 tracepbl。其他路径需先评估，不静默改已确认路由。
