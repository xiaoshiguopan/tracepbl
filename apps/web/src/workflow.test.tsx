import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App, boundaryCopy, routeForPath } from "./App";
import { DesignAuditPage } from "./DesignAuditPage";
import { EvidenceMapPage } from "./EvidenceMapPage";
import { FinalReviewPage } from "./FinalReviewPage";
import { LessonDesignPage } from "./LessonDesignPage";
import { QuestionWorkspacePage } from "./QuestionWorkspacePage";
import { RubricDesignPage } from "./RubricDesignPage";
import { SourceDiscoveryPage } from "./SourceDiscoveryPage";
import { TeachingContextPage } from "./TeachingContextPage";
import { acceptAuditRecommendation, createAuditDraft, getAuditSummary, normalizeAuditDraft, type AuditInput } from "./design-audit";
import { addEvidenceRelation, createEvidenceMapDraft, getEvidenceMapSummary, moveEvidenceRelation, normalizeEvidenceMapDraft, removeEvidenceRelation, updateEvidenceRelation } from "./evidence-map";
import { confirmTeachingPack, createFinalReviewDraft, getFinalReviewSummary, normalizeFinalReviewDraft, sanitizeTeachingPackFileName, type FinalReviewInput } from "./final-review";
import { createLessonDesignDraft, getLessonDesignSummary, moveLessonActivity, normalizeLessonDesignDraft, updateLessonActivity } from "./lesson-design";
import { createQuestionDraft, createQuestionGuidance, normalizeQuestionDraft, validateQuestionConfirmation, validateQuestionInput } from "./question-workspace";
import { createRubricDraft, getRubricSummary, normalizeRubricDraft, updateRubricLevel } from "./rubric-design";
import { emptySourceDraft, getSourceSetSummary, normalizeSourceDraft, sourceFixture, toggleSourceSelection } from "./source-discovery";
import { getContextConflict, isSameTeachingContext, normalizeTeachingContextDraft, syntheticFixture, validateTeachingContext, type TeachingContextDraft } from "./teaching-context";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const question = "唐朝为何由盛转衰？";
const sourceIds = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const evidence = createEvidenceMapDraft(question, sourceIds);
const lesson = createLessonDesignDraft(question, sourceIds, evidence.relations);
const rubric = createRubricDraft(lesson.activities);
const auditInput: AuditInput = { question, selectedSourceIds: sourceIds, evidence, lesson, rubric };
const noop = () => undefined;

describe("首页、导航与安全边界", () => {
  it("呈现游客入口、无声影片后备和本机数据边界", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("让沉睡千年的证据");
    expect(html).toContain("重新开口");
    expect(html).toContain("新建备课");
    expect(html).toContain("我的备课");
    expect(html).toContain("公开演示");
    expect(html).toContain("p00-film-keyframe-reveal-v1.webp");
    expect(html).not.toContain("<audio");
    expect(boundaryCopy).toContain("数据只保存在当前浏览器");
  });
  it("识别八个任务页面和统一不可用页", () => {
    expect(routeForPath("/tracepbl/tasks/demo/context", "/tracepbl")).toBe("context");
    expect(routeForPath("/tracepbl/tasks/demo/review", "/tracepbl")).toBe("review");
    expect(routeForPath("/tracepbl/task-unavailable", "/tracepbl")).toBe("unavailable");
    const html = renderToStaticMarkup(<TaskUnavailable onBack={() => undefined} onNewTask={() => undefined} />);
    expect(html).toContain("此任务不可使用");
    expect(html).not.toContain("任务编号");
  });
  it("固定呈现八步，已到达步骤可自由切换", () => {
    const html = renderToStaticMarkup(<WorkbenchShell currentStep={0} reachedStep={2} currentLabel="教学情境" nextLabel="探究问题" onBack={() => undefined} onNavigateStep={() => undefined}><main>内容</main></WorkbenchShell>);
    expect(html.match(/class="step-(?:link|label)"/g)?.length).toBe(16);
    expect(html).toContain("已完成 · 可查看");
    expect(html).toContain("最终确认与导出");
  });
  it("八个任务页面均保留清晰主任务，且最终页只提供真实文件导出", () => {
    const pages = [
      <TeachingContextPage onBack={noop} onNext={noop} />,
      <QuestionWorkspacePage onBack={noop} onReturnContext={noop} onNext={noop} />,
      <SourceDiscoveryPage onBack={noop} onReturnContext={noop} onReturnQuestion={noop} onNext={noop} />,
      <EvidenceMapPage onBack={noop} onReturnContext={noop} onReturnQuestion={noop} onReturnSources={noop} onNext={noop} />,
      <LessonDesignPage onBack={noop} onReturnContext={noop} onReturnQuestion={noop} onReturnSources={noop} onReturnEvidence={noop} onNext={noop} />,
      <RubricDesignPage onBack={noop} onReturnContext={noop} onReturnQuestion={noop} onReturnSources={noop} onReturnEvidence={noop} onReturnLesson={noop} onNext={noop} />,
      <DesignAuditPage onBack={noop} onReturnContext={noop} onReturnQuestion={noop} onReturnSources={noop} onReturnEvidence={noop} onReturnLesson={noop} onReturnRubric={noop} onNext={noop} />,
      <FinalReviewPage onBack={noop} onReturnContext={noop} onReturnQuestion={noop} onReturnSources={noop} onReturnEvidence={noop} onReturnLesson={noop} onReturnRubric={noop} onReturnAudit={noop} />,
    ].map((page) => renderToStaticMarkup(page));
    expect(pages.map((html) => html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1])).toEqual(["教学情境", "探究问题", "查找史料", "组织证据", "设计活动", "评价量规", "设计检查", "最终确认与导出"]);
    expect(pages[7]).toContain("不再重复打勾或签发");
    expect(pages[7]).not.toContain("本机确认与打印");
  });
});

describe("P01 教学情境", () => {
  it("接受匿名合成学情并拒绝个人信息", () => {
    expect(validateTeachingContext(syntheticFixture)).toEqual({});
    expect(validateTeachingContext({ ...syntheticFixture, profileNote: "学生姓名张某" }).profileNote).toContain("个人信息");
    expect(getContextConflict({ ...syntheticFixture, minutes: "8" })).toContain("一个小问题");
  });
  it("兼容旧草稿并只把真实变化视为修改", () => {
    const legacy = { ...syntheticFixture, sourceUses: ["比较"] } as unknown as TeachingContextDraft;
    expect("sourceUses" in normalizeTeachingContextDraft(legacy)).toBe(false);
    expect(isSameTeachingContext(syntheticFixture, { ...syntheticFixture, learningNeeds: [...syntheticFixture.learningNeeds] })).toBe(true);
    expect(isSameTeachingContext(syntheticFixture, { ...syntheticFixture, minutes: "40" })).toBe(false);
  });
});

describe("P02 探究问题", () => {
  it("把整课线索拆成三个递进问题，小问题不强制拆分", () => {
    const guidance = createQuestionGuidance("唐朝为何由盛转衰", syntheticFixture);
    expect(guidance.inputType).toBe("因果解释");
    expect(guidance.primary.question).toBe(question);
    expect(guidance.primary.subQuestions).toHaveLength(3);
    expect(guidance.alternative.subQuestions).toEqual([]);
  });
  it("校验开放问题并迁移旧默认问法", () => {
    expect(validateQuestionInput("").originalInput).toBeTruthy();
    const draft = createQuestionDraft(syntheticFixture);
    expect(validateQuestionConfirmation({ ...draft, centralQuestion: "当然应该证明这个观点正确" }, syntheticFixture).centralQuestion).toContain("预设");
    expect(normalizeQuestionDraft({ ...draft, centralQuestion: "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？" }, syntheticFixture).centralQuestion).toBe(question);
  });
});

describe("P03 查找史料", () => {
  it("提供十二条可定位史料、分层解读与六条默认推荐", () => {
    expect(sourceFixture).toHaveLength(12);
    expect(sourceIds).toHaveLength(6);
    expect(sourceFixture.every((source) => source.url.startsWith("https://") && source.meaning && source.interpretation && source.limitation)).toBe(true);
    expect(new Set(sourceFixture.map((source) => source.nature)).size).toBeGreaterThanOrEqual(3);
    expect(sourceFixture.every((source) => source.excerpt.length >= 50)).toBe(true);
  });
  it("勾选是唯一采用状态，四至八条且覆盖完整才可继续", () => {
    const selected = sourceIds.reduce(toggleSourceSelection, emptySourceDraft);
    expect(emptySourceDraft.selectedIds).toEqual([]);
    expect(getSourceSetSummary(selected).ready).toBe(true);
    expect(getSourceSetSummary(normalizeSourceDraft({ selectedIds: sourceIds.slice(0, 2) })).ready).toBe(false);
    expect(getSourceSetSummary({ ...selected, selectedIds: [...selected.selectedIds].reverse() }).selected.map((source) => source.id)).toEqual(sourceFixture.filter((source) => sourceIds.includes(source.id)).map((source) => source.id));
  });
});

describe("P05 组织证据", () => {
  it("允许同一史料用于不同子问题并拒绝同区重复", () => {
    const first = evidence.relations[0];
    const duplicate = addEvidenceRelation(evidence, { claimId: first.claimId, sourceId: first.sourceId, kind: "支持原因", reason: "重复" });
    const targetClaim = evidence.claims.find((claim) => !evidence.relations.some((relation) => relation.claimId === claim.id && relation.sourceId === first.sourceId));
    expect(targetClaim).toBeTruthy();
    const reused = addEvidenceRelation(evidence, { claimId: targetClaim!.id, sourceId: first.sourceId, kind: "关键转折", reason: "跨问题复用" });
    expect(duplicate.error).toContain("已经用于");
    expect(reused.draft.relations.length).toBe(evidence.relations.length + 1);
  });
  it("增删改不可变，上游变化触发复核", () => {
    const first = evidence.relations[0];
    const changed = updateEvidenceRelation(evidence, first.id, { kind: "质疑或限制", reason: first.reason });
    expect(evidence.relations[0].kind).not.toBe("质疑或限制");
    expect(removeEvidenceRelation(changed, first.id).relations).toHaveLength(evidence.relations.length - 1);
    expect(normalizeEvidenceMapDraft(evidence, `${question}（修改）`, sourceIds).relations.every((item) => item.status === "needs-review")).toBe(true);
    expect(getEvidenceMapSummary(evidence, sourceIds).ready).toBe(true);
    const destination = evidence.claims.find((claim) => !evidence.relations.some((relation) => relation.claimId === claim.id && relation.sourceId === first.sourceId));
    expect(moveEvidenceRelation(evidence, first.id, destination!.id).relations.find((relation) => relation.id === first.id)?.claimId).toBe(destination!.id);
  });
});

describe("P06 设计活动", () => {
  it("默认七段活动完整占用45分钟并包含卡点和引导", () => {
    expect(lesson.activities).toHaveLength(7);
    expect(getLessonDesignSummary(lesson, 45)).toMatchObject({ totalMinutes: 45, ready: true });
    expect(lesson.activities.every((activity) => activity.difficulty && activity.scaffold)).toBe(true);
  });
  it("支持模块编辑排序并只复核受影响内容", () => {
    const changed = updateLessonActivity(lesson, lesson.activities[0].id, { minutes: 6 });
    expect(moveLessonActivity(changed, changed.activities[0].id, 1).activities[1].id).toBe(changed.activities[0].id);
    const needsReview = normalizeLessonDesignDraft(lesson, `${question}（修改）`, sourceIds, evidence.relations);
    expect(needsReview.activities.every((activity) => activity.status === "needs-review")).toBe(true);
    expect(getLessonDesignSummary(needsReview, 45)).toMatchObject({ ready: true, reviewCount: 7 });
  });
});

describe("P07 评价量规", () => {
  it("使用五维三档可观察表现而非印象等级", () => {
    expect(rubric.dimensions.map((dimension) => dimension.title)).toEqual(["时空定位与阶段变化", "史料辨析与证据使用", "多重因果解释", "论证、反证与结论边界", "历史认识与观点表达"]);
    expect(rubric.dimensions.every((dimension) => dimension.levels.map((item) => item.label).join() === "需要支持,达到要求,表现充分")).toBe(true);
    expect(getRubricSummary(rubric, lesson.activities).ready).toBe(true);
  });
  it("拒绝空泛等级并在活动变化后复核", () => {
    const vague = updateRubricLevel(rubric, rubric.dimensions[0].id, 1, "一般");
    expect(getRubricSummary(vague, lesson.activities).ready).toBe(false);
    const changedLesson = updateLessonActivity(lesson, lesson.activities[0].id, { evidenceProduct: "新的成果" });
    const needsReview = normalizeRubricDraft(rubric, changedLesson.activities);
    expect(needsReview.dimensions.some((dimension) => dimension.status === "needs-review")).toBe(true);
    expect(getRubricSummary(needsReview, changedLesson.activities).ready).toBe(true);
  });
});

describe("P08—P09 检查与交付", () => {
  it("未知和待确认不冒充通过，采用建议后才可完成", () => {
    const draft = createAuditDraft(auditInput);
    expect(getAuditSummary(draft).ready).toBe(false);
    expect(getAuditSummary(acceptAuditRecommendation(draft, "AUDIT-EVIDENCE-GAP")).ready).toBe(true);
    const changedLesson = updateLessonActivity(lesson, lesson.activities[0].id, { minutes: 6 });
    expect(normalizeAuditDraft(draft, { ...auditInput, lesson: changedLesson }).staleCategories).toContain("课堂可行性");
  });
  it("上游变化只提示，不阻止已完成教学包继续导出", () => {
    const completed = { ...acceptAuditRecommendation(createAuditDraft(auditInput), "AUDIT-EVIDENCE-GAP"), completed: true };
    const changedLesson = updateLessonActivity(lesson, lesson.activities[0].id, { studentAction: "重新比较史料" });
    const staleAudit = normalizeAuditDraft(completed, { ...auditInput, lesson: changedLesson });
    const input: FinalReviewInput = { question, selectedSourceIds: sourceIds, lesson: changedLesson, rubric, audit: staleAudit };
    expect(staleAudit.completed).toBe(true);
    expect(getAuditSummary(staleAudit).ready).toBe(true);
    expect(getFinalReviewSummary(input, createFinalReviewDraft(input)).upstreamReady).toBe(true);
  });
  it("上游完成后可生成真实文件名，变化会使旧确认失效", () => {
    const audit = { ...acceptAuditRecommendation(createAuditDraft(auditInput), "AUDIT-EVIDENCE-GAP"), completed: true };
    const input: FinalReviewInput = { question, selectedSourceIds: sourceIds, lesson, rubric, audit };
    const draft = createFinalReviewDraft(input);
    expect(getFinalReviewSummary(input, confirmTeachingPack(draft, input)).canExport).toBe(true);
    expect(normalizeFinalReviewDraft(confirmTeachingPack(draft, input), { ...input, question: `${question}（修改）` }).approved).toBe(false);
    expect(sanitizeTeachingPackFileName("史证工坊:<盛衰>?*")).toBe("史证工坊-盛衰-");
  });
});
