import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonDesignPage } from "./LessonDesignPage";
import {
  createLessonDesignDraft,
  getLessonDesignSummary,
  moveLessonActivity,
  normalizeLessonDesignDraft,
  updateLessonActivity,
} from "./lesson-design";
import { createEvidenceMapDraft } from "./evidence-map";

const question = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const sourceIds = ["AUTH-SRC-001", "AUTH-SRC-002", "AUTH-SRC-003", "AUTH-SRC-004"];
const evidence = createEvidenceMapDraft(question, sourceIds);

describe("P06 设计活动", () => {
  it("以 45 分钟课堂排演稿呈现动作、史料和成果，而不是卡片墙", () => {
    const html = renderToStaticMarkup(
      <LessonDesignPage
        onBack={() => undefined}
        onReturnContext={() => undefined}
        onReturnQuestion={() => undefined}
        onReturnSources={() => undefined}
        onReturnEvidence={() => undefined}
      />,
    );

    expect(html).toContain("设计活动");
    expect(html).toContain("课堂排演稿");
    expect(html).toContain("学生动作");
    expect(html).toContain("使用史料");
    expect(html).toContain("留下成果");
    expect(html).toContain("课堂时间账簿");
    expect(html).toContain('<strong>45</strong><span>/ 45 分钟</span>');
    expect(html).toContain("含 2 分钟转换");
    expect(html).toContain("只生成本段替代建议");
    expect(html).not.toContain("draggable");
    expect(html).not.toContain("<audio");
  });

  it("预排三段活动并把任务与转换时间完整计入 45 分钟", () => {
    const draft = createLessonDesignDraft(question, sourceIds, evidence.relations);
    expect(draft.activities).toHaveLength(3);
    expect(getLessonDesignSummary(draft, 45)).toMatchObject({
      taskMinutes: 39,
      transitionMinutes: 6,
      totalMinutes: 45,
      sourceCount: 4,
      ready: true,
    });
    expect(draft.activities.every((activity) => activity.sourceIds.length > 0)).toBe(true);
  });

  it("编辑与排序保持原草稿不变，并标记教师编辑", () => {
    const original = createLessonDesignDraft(question, sourceIds, evidence.relations);
    const changed = updateLessonActivity(original, "ACT-001", { minutes: 9 });
    const moved = moveLessonActivity(changed, "ACT-001", 1);

    expect(original.activities[0].minutes).toBe(8);
    expect(changed.activities[0]).toMatchObject({ minutes: 9, teacherEdited: true });
    expect(moved.activities[1].id).toBe("ACT-001");
  });

  it("上游问题变化影响全部活动，移除史料只影响使用该史料的活动", () => {
    const original = createLessonDesignDraft(question, sourceIds, evidence.relations);
    const questionChanged = normalizeLessonDesignDraft(original, `${question}（已修改）`, sourceIds, evidence.relations);
    expect(questionChanged.activities.every((activity) => activity.status === "needs-review")).toBe(true);

    const sourceChanged = normalizeLessonDesignDraft(original, question, sourceIds.slice(1), evidence.relations.filter((relation) => relation.sourceId !== "AUTH-SRC-001"));
    expect(sourceChanged.activities.find((activity) => activity.id === "ACT-001")?.status).toBe("needs-review");
    expect(sourceChanged.activities.find((activity) => activity.id === "ACT-002")?.status).toBe("ready");
  });

  it("阻断超时、空成果和脱离史料即可完成的活动", () => {
    const original = createLessonDesignDraft(question, sourceIds, evidence.relations);
    const invalid = updateLessonActivity(original, "ACT-001", {
      minutes: 20,
      sourceIds: [],
      studentAction: "讨论唐朝前期是不是盛世",
      evidenceProduct: "",
    });
    const summary = getLessonDesignSummary(invalid, 45);

    expect(summary.totalMinutes).toBeGreaterThan(45);
    expect(summary.ready).toBe(false);
    expect(summary.errors["ACT-001"]?.sourceIds).toContain("史料");
    expect(summary.errors["ACT-001"]?.studentAction).toContain("使用证据");
    expect(summary.errors["ACT-001"]?.evidenceProduct).toContain("成果");
  });
});
