import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceDiscoveryPage } from "./SourceDiscoveryPage";
import { emptySourceDraft, excludeSource, getSourceSetSummary, sourceFixture, toggleSourceSelection } from "./source-discovery";

describe("P03 查找史料", () => {
  it("以史料阅览纸和推荐目录直接呈现史料、理由与边界", () => {
    const html = renderToStaticMarkup(<SourceDiscoveryPage onBack={() => undefined} onReturnContext={() => undefined} onReturnQuestion={() => undefined} />);
    expect(html).toContain("查找史料");
    expect(html).toContain("source-sheet");
    expect(html).toContain("推荐目录");
    expect(html).toContain("米斗三钱，外户不闭");
    expect(html).toContain("可以帮助判断");
    expect(html).toContain("不能单独证明");
    expect(html).toContain("推荐理由为合成演示建议，不是馆方结论");
    expect(html).toContain("在官方来源查看");
    expect(html).toContain("更多可用史料 6 条");
    expect(html).not.toContain("核验史料");
    expect(html).not.toContain("可信度");
    expect(html).not.toContain("RAG");
    expect(html).not.toContain("<audio");
  });

  it("10 条候选都来自登记的官方来源且只有 4 条优先推荐", () => {
    expect(sourceFixture).toHaveLength(10);
    expect(sourceFixture.filter((source) => source.recommended)).toHaveLength(4);
    expect(sourceFixture.filter((source) => source.discoveredBy === "已登记知识库")).toHaveLength(7);
    expect(sourceFixture.filter((source) => source.discoveredBy === "外部权威来源补充")).toHaveLength(3);
    expect(sourceFixture.every((source) => source.id.startsWith("AUTH-SRC-") && source.url.startsWith("https://"))).toBe(true);
  });

  it("选择和排除互斥并保持原数组不可变", () => {
    const selected = toggleSourceSelection(emptySourceDraft, "AUTH-SRC-001");
    const excluded = excludeSource(selected, "AUTH-SRC-001");
    expect(emptySourceDraft).toEqual({ selectedIds: [], excludedIds: [] });
    expect(selected.selectedIds).toEqual(["AUTH-SRC-001"]);
    expect(excluded.selectedIds).toEqual([]);
    expect(excluded.excludedIds).toEqual(["AUTH-SRC-001"]);
  });

  it("至少 4 条且 3 种类型才允许进入组织证据", () => {
    const draft = { selectedIds: ["AUTH-SRC-001", "AUTH-SRC-002", "AUTH-SRC-003", "AUTH-SRC-004"], excludedIds: [] };
    expect(getSourceSetSummary(draft)).toMatchObject({ selectedCount: 4, kindCount: 4, ready: true });
    expect(getSourceSetSummary({ selectedIds: draft.selectedIds.slice(0, 3), excludedIds: [] }).ready).toBe(false);
  });
});
