import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesignAuditPage } from "./DesignAuditPage";
import { acceptAuditRecommendation, createAuditDraft, getAuditSummary, normalizeAuditDraft, updateAuditReason, type AuditInput } from "./design-audit";
import { createEvidenceMapDraft } from "./evidence-map";
import { createLessonDesignDraft, updateLessonActivity } from "./lesson-design";
import { createRubricDraft } from "./rubric-design";

const question = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const selectedSourceIds = ["AUTH-SRC-001", "AUTH-SRC-002", "AUTH-SRC-003", "AUTH-SRC-004"];
const evidence = createEvidenceMapDraft(question, selectedSourceIds);
const lesson = createLessonDesignDraft(question, selectedSourceIds, evidence.relations);
const rubric = createRubricDraft(lesson.activities);
const input: AuditInput = { question, selectedSourceIds, evidence, lesson, rubric };

describe("P08 设计检查", () => {
  it("以异常优先的校样呈现整条证据链，而不是仪表盘", () => {
    const html = renderToStaticMarkup(<DesignAuditPage onBack={() => undefined} onReturnContext={() => undefined} onReturnQuestion={() => undefined} onReturnSources={() => undefined} onReturnEvidence={() => undefined} onReturnLesson={() => undefined} onReturnRubric={() => undefined} />);
    expect(html).toContain("设计检查");
    expect(html).toContain("需要你处理");
    expect(html).toContain("当前史料仍缺少部分群体和地区的直接材料");
    expect(html).toContain("首选处理");
    expect(html).toContain("16 项已通过的检查");
    expect(html).toContain("最终确认与导出");
    expect(html).not.toContain("忽略全部");
    expect(html).not.toContain("强制通过");
    expect(html).not.toContain("<audio");
  });

  it("默认有 18 项检查且待教师确认不会假装可交付", () => {
    const summary = getAuditSummary(createAuditDraft(input));
    expect(summary).toMatchObject({ totalCount: 18, passedCount: 16, blockerCount: 0, confirmationCount: 1, suggestionCount: 1, unknownCount: 0, ready: false });
  });

  it("采用首选处理会形成可编辑理由并允许完成检查", () => {
    const accepted = acceptAuditRecommendation(createAuditDraft(input), "AUDIT-EVIDENCE-GAP");
    expect(accepted.findings[0].teacherReason.length).toBeGreaterThanOrEqual(10);
    expect(getAuditSummary(accepted)).toMatchObject({ confirmationCount: 0, passedCount: 17, ready: true });
  });

  it("过短教师理由阻断完成", () => {
    const accepted = acceptAuditRecommendation(createAuditDraft(input), "AUDIT-EVIDENCE-GAP");
    const invalid = updateAuditReason(accepted, "AUDIT-EVIDENCE-GAP", "太短");
    expect(getAuditSummary(invalid).ready).toBe(false);
    expect(getAuditSummary(invalid).reasonErrors["AUDIT-EVIDENCE-GAP"]).toContain("10—500");
  });

  it("活动变化只使相关检查类别失效", () => {
    const draft = createAuditDraft(input);
    const changedLesson = updateLessonActivity(lesson, "ACT-002", { minutes: 14 });
    const normalized = normalizeAuditDraft(draft, { ...input, lesson: changedLesson });
    expect(normalized.staleCategories).toContain("课堂可行性");
    expect(normalized.staleCategories).toContain("活动—评价一致性");
    expect(normalized.staleCategories).not.toContain("来源完整性");
    expect(getAuditSummary(normalized).ready).toBe(false);
  });
});
