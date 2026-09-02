import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createEvidenceMapDraft } from "./evidence-map";
import { createLessonDesignDraft, updateLessonActivity } from "./lesson-design";
import { RubricDesignPage } from "./RubricDesignPage";
import { createRubricDraft, getRubricSummary, normalizeRubricDraft, updateRubricLevel } from "./rubric-design";

const question = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const sourceIds = ["AUTH-SRC-001", "AUTH-SRC-002", "AUTH-SRC-003", "AUTH-SRC-004"];
const evidence = createEvidenceMapDraft(question, sourceIds);
const lesson = createLessonDesignDraft(question, sourceIds, evidence.relations);

describe("P07 评价量规", () => {
  it("用连续评阅标尺呈现四维可观察行为和课堂成果", () => {
    const html = renderToStaticMarkup(<RubricDesignPage onBack={() => undefined} onReturnContext={() => undefined} onReturnQuestion={() => undefined} onReturnSources={() => undefined} onReturnEvidence={() => undefined} onReturnLesson={() => undefined} />);
    expect(html).toContain("评价量规");
    expect(html).toContain("评阅标尺");
    expect(html).toContain("从只摘抄材料到形成历史解释");
    expect(html).toContain("证据选择与引用");
    expect(html).toContain("证据解释");
    expect(html).toContain("互证与质疑");
    expect(html).toContain("结论及其边界");
    expect(html).toContain("本课留下的成果");
    expect(html).toContain("不计算总分");
    expect(html).not.toContain("权重");
    expect(html).not.toContain("<audio");
  });

  it("默认四维都对齐三项活动成果", () => {
    const draft = createRubricDraft(lesson.activities);
    expect(getRubricSummary(draft, lesson.activities)).toMatchObject({ dimensionCount: 4, productCount: 3, mappedActivityCount: 3, alignedDimensions: 4, ready: true });
    expect(draft.dimensions.every((dimension) => dimension.levels.length === 3)).toBe(true);
  });

  it("阻断空泛或重复等级描述，但允许教师编辑清除复核状态", () => {
    const draft = createRubricDraft(lesson.activities);
    const vague = updateRubricLevel(draft, draft.dimensions[0].id, 1, "一般");
    expect(getRubricSummary(vague, lesson.activities).ready).toBe(false);
    expect(getRubricSummary(vague, lesson.activities).errors[draft.dimensions[0].id][0]).toContain("空泛");
    const duplicate = updateRubricLevel(draft, draft.dimensions[0].id, 1, draft.dimensions[0].levels[0].description);
    expect(getRubricSummary(duplicate, lesson.activities).errors[draft.dimensions[0].id]).toContain("阶段描述不能重复，请写出行为差异。");
  });

  it("上游活动变化只标记对应维度待复核", () => {
    const draft = createRubricDraft(lesson.activities);
    const changedLesson = updateLessonActivity(lesson, "ACT-002", { evidenceProduct: "一份重新定义的证据比较记录。" });
    const normalized = normalizeRubricDraft(draft, changedLesson.activities);
    expect(normalized.dimensions.find((dimension) => dimension.id === "RUBRIC-CORROBORATION")?.status).toBe("needs-review");
    expect(normalized.dimensions.find((dimension) => dimension.id === "RUBRIC-EVIDENCE-SELECTION")?.status).toBe("ready");
    expect(getRubricSummary(normalized, changedLesson.activities).ready).toBe(false);
  });

  it("删除全部证据维度时不能确认", () => {
    const draft = { ...createRubricDraft(lesson.activities), dimensions: [] };
    expect(getRubricSummary(draft, lesson.activities)).toMatchObject({ dimensionCount: 0, omittedCoreDimension: true, ready: false });
  });
});
