# 阶段 13.2 合成数据就绪演练报告

日期：2026-09-05。基线 8de8f5c。状态：本子阶段完成，用户已批准以下 9 路径随本次本地提交归档。用户在阶段 12 补验归档后要求进入下一阶段；本轮遵循此前“沿用合成数据”的决定，验证不预装真实材料的首次使用路径。阶段 14 未开始。

## 实际结果

- 从新的独立数据库运行 migration 0001—0005、API、Worker、Web 和恢复清单初始化。未向目录预装测试史料，首次会话任务列表与材料目录均为空。
- 浏览器从首页进入、填写情境、运行一次 fake 问题建议并由测试模拟教师确认，再通过 TXT 文件入口加入明确合成内容。
- 两个材料确认默认不勾选；未确认数据范围时拒绝保存；明确确认后保存正文，但来源仍 unknown/pending，不伪造核验结果。
- 相同材料请求键重放得到相同 ID，无重复记录；同键不同内容返回 409。混合三项返回 202/422/422；成功项保留、失败项不新增，纠正后仅补交一项。
- 最终 API 与数据库均为 4 条材料：1 条正文 unknown/pending，3 条 restricted_metadata_only/pending 且无正文。模型任务 1 succeeded、embedding 1 succeeded；均 fake，无模型费用。
- 无会话访问存在/不存在任务均 401；同工作区其他任务看不到这批私有材料，跨任务选入版本返回 404；旧乐观锁返回 412。未审批任务导出返回 409。
- 刷新后材料仍显示；删除后来源 404，24 小时窗口内撤销恢复全部 4 条。purge 任务 cancelled 与撤销一致。
- 浏览器页面异常 0、外部请求 0、完整模式 IndexedDB 数据库 0；没有改 Demo、影片、API、权限、业务代码、数据库或依赖。

具体证据和失败修正见 [验证记录](./STAGE-13.2-VALIDATION.md)，通俗解释见 [学习卡](./LEARNING-CARD-13.2.md)。

## 结论与边界

“不预装真实材料”的数据就绪路径已完成本轮适用验证，可在归档后另行启动阶段 14 发布准备。没有执行真实导入，因此不提供虚构的真实数据数量、许可证明或试导入成功结论。

创建材料接口仍不能完整写入作者、版本、定位与许可证明；真实材料逐字段保真仍需具体批次评估和变更批准。本轮不会因为待核验材料不能签发而放松门禁。完整教学包通过路径继承阶段 11/12 预生成及合成目录证据，不把本轮材料录入演练称为完整真实史料教学验证。

阶段 12 保留的 Safari/读屏/Word、真实教师、物理故障、真实模型、直接 daemon 冷拉取网络等限制不因阶段推进消失。真实导入、模型外发、公开仓库/部署/远端 CI 均需单独批准。

## 精确归档范围

用户已明确回复“批准归档”，仅授权以下 9 路径随本次本地提交归档：

1. README.md
2. docs/README.md
3. docs/00-governance/PROJECT-STATE.md
4. docs/08-release/REAL-DATA-IMPORT.md
5. docs/08-release/LEARNING-CARD-13.2.md
6. docs/08-release/STAGE-13.2-REPORT.md
7. docs/08-release/STAGE-13.2-VALIDATION.md
8. tests/stage13.synthetic.compose.yaml
9. tests/stage13.readiness.browser.mjs

建议消息：test(readiness): verify synthetic first-use and material batch。output/、忽略证据、测试容器及数据卷均不纳入或清理。本次只执行上述范围的本地归档；未推送、部署或启动阶段 14。
