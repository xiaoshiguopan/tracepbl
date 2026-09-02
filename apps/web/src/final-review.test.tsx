import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { acceptAuditRecommendation, createAuditDraft, type AuditInput } from "./design-audit";
import { createEvidenceMapDraft } from "./evidence-map";
import { FinalReviewPage } from "./FinalReviewPage";
import { confirmTeachingPack, createFinalReviewDraft, getFinalReviewSummary, normalizeFinalReviewDraft, sanitizeTeachingPackFileName, type FinalReviewInput } from "./final-review";
import { createLessonDesignDraft } from "./lesson-design";
import { createRubricDraft } from "./rubric-design";

const question = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const selectedSourceIds = ["AUTH-SRC-001", "AUTH-SRC-002", "AUTH-SRC-003", "AUTH-SRC-004"];
const evidence = createEvidenceMapDraft(question, selectedSourceIds);
const lesson = createLessonDesignDraft(question, selectedSourceIds, evidence.relations);
const rubric = createRubricDraft(lesson.activities);
const auditInput: AuditInput = { question, selectedSourceIds, evidence, lesson, rubric };
const audit = { ...acceptAuditRecommendation(createAuditDraft(auditInput), "AUDIT-EVIDENCE-GAP"), completed: true };
const input: FinalReviewInput = { question, selectedSourceIds, lesson, rubric, audit };

describe("P09 最终确认与导出", () => {
  it("用连续装订清样完成一次确认和同页导出", () => {
    const noop = () => undefined;
    const html = renderToStaticMarkup(<FinalReviewPage onBack={noop} onReturnContext={noop} onReturnQuestion={noop} onReturnSources={noop} onReturnEvidence={noop} onReturnLesson={noop} onReturnRubric={noop} onReturnAudit={noop} />);
    expect(html).toContain("教学包装订清样");
    expect(html).toContain("教师签发");
    expect(html).toContain("确认这份教学包");
    expect(html).toContain("权利处理预览");
    expect(html).toContain("确认后可打开打印预览");
    expect(html).not.toContain("专家认证通过");
    expect(html).not.toContain("<audio");
  });

  it("只有上游完成并由教师确认后才允许导出", () => {
    const draft = createFinalReviewDraft(input);
    expect(getFinalReviewSummary(input, draft).canExport).toBe(false);
    expect(getFinalReviewSummary(input, confirmTeachingPack(draft, input, "2026-09-02T08:00:00.000Z")).canExport).toBe(true);
  });

  it("上游变化会使旧确认失效", () => {
    const approved = confirmTeachingPack(createFinalReviewDraft(input), input);
    const changed = { ...input, question: `${question}（调整）` };
    expect(getFinalReviewSummary(changed, approved).canExport).toBe(false);
    const normalized = normalizeFinalReviewDraft(approved, changed);
    expect(normalized.approved).toBe(false);
    expect(normalized.confirmedAt).toBeNull();
  });

  it("清理文件名中的系统非法字符并阻止空文件名", () => {
    expect(sanitizeTeachingPackFileName("史证工坊:<盛世>?*")).toBe("史证工坊-盛世-");
    const empty = { ...createFinalReviewDraft(input), approved: true, fileName: "<>" };
    expect(getFinalReviewSummary(input, empty)).toMatchObject({ canExport: false, fileNameError: "请保留至少一个可用于文件名的字符。" });
  });
});
