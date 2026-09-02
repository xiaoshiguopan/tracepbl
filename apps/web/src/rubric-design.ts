import type { LessonActivity } from "./lesson-design";

export type RubricLevel = {
  key: "starting" | "forming" | "interpreting";
  label: string;
  description: string;
};

export type RubricDimension = {
  id: string;
  title: string;
  activityIds: string[];
  mappingLabel: string;
  levels: RubricLevel[];
  teacherEdited: boolean;
  status: "ready" | "needs-review";
};

type ActivitySnapshot = { id: string; fingerprint: string };

export type RubricDraft = {
  fixtureVersion: 1;
  dimensions: RubricDimension[];
  confirmed: boolean;
  activitySnapshot: ActivitySnapshot[];
};

export type RubricErrors = Record<string, string[]>;

const snapshotActivities = (activities: LessonActivity[]): ActivitySnapshot[] => activities.map((activity) => ({
  id: activity.id,
  fingerprint: [activity.studentAction, activity.evidenceProduct, activity.sourceIds.join(","), activity.status].join("|"),
}));

const availableActivities = (preferred: string[], activities: LessonActivity[]) => {
  const ids = new Set(activities.map((activity) => activity.id));
  const available = preferred.filter((id) => ids.has(id));
  return available.length ? available : activities.slice(0, 1).map((activity) => activity.id);
};

export function createRubricDraft(activities: LessonActivity[]): RubricDraft {
  return {
    fixtureVersion: 1,
    confirmed: false,
    activitySnapshot: snapshotActivities(activities),
    dimensions: [
      {
        id: "RUBRIC-EVIDENCE-SELECTION",
        title: "证据选择与引用",
        activityIds: availableActivities(["ACT-001", "ACT-003"], activities),
        mappingLabel: "对应活动 1、3",
        levels: [
          { key: "starting", label: "起步观察", description: "未指出所用史料，或引用无法定位。" },
          { key: "forming", label: "证据成形", description: "能引用至少两条本课史料，并让读者辨认依据。" },
          { key: "interpreting", label: "历史解释", description: "能选择不同类型且与判断直接相关的史料。" },
        ],
        teacherEdited: false,
        status: "ready",
      },
      {
        id: "RUBRIC-EVIDENCE-EXPLANATION",
        title: "证据解释",
        activityIds: availableActivities(["ACT-001", "ACT-003"], activities),
        mappingLabel: "对应活动 1、3",
        levels: [
          { key: "starting", label: "起步观察", description: "只摘抄材料，没有说明为何支持判断。" },
          { key: "forming", label: "证据成形", description: "能说明材料信息与判断之间的关系。" },
          { key: "interpreting", label: "历史解释", description: "能结合来源和语境解释价值，并承认其他理解。" },
        ],
        teacherEdited: false,
        status: "ready",
      },
      {
        id: "RUBRIC-CORROBORATION",
        title: "互证与质疑",
        activityIds: availableActivities(["ACT-002", "ACT-003"], activities),
        mappingLabel: "对应活动 2、3",
        levels: [
          { key: "starting", label: "起步观察", description: "多条史料只是并列，没有比较。" },
          { key: "forming", label: "证据成形", description: "能指出一项相互支持或差异。" },
          { key: "interpreting", label: "历史解释", description: "能用史料互相检验，并据此修正判断。" },
        ],
        teacherEdited: false,
        status: "ready",
      },
      {
        id: "RUBRIC-CONCLUSION-BOUNDARY",
        title: "结论及其边界",
        activityIds: availableActivities(["ACT-003"], activities),
        mappingLabel: "对应活动 3 · 史料缺口",
        levels: [
          { key: "starting", label: "起步观察", description: "给出绝对结论，没有说明证据边界。" },
          { key: "forming", label: "证据成形", description: "给出有依据的判断，并指出当前史料不能证明什么。" },
          { key: "interpreting", label: "历史解释", description: "能回答‘在多大程度上’，并说明群体、地区或时期空缺。" },
        ],
        teacherEdited: false,
        status: "ready",
      },
    ],
  };
}

export function validateRubricDimension(dimension: RubricDimension, activities: LessonActivity[]) {
  const errors: string[] = [];
  const descriptions = dimension.levels.map((level) => level.description.trim());
  if (!dimension.title.trim()) errors.push("请填写评价维度名称。");
  if (descriptions.length !== 3 || descriptions.some((description) => !description)) errors.push("三个阶段都需要写出可观察行为。");
  if (new Set(descriptions).size !== descriptions.length) errors.push("阶段描述不能重复，请写出行为差异。");
  if (descriptions.some((description) => /^(很好|一般|较差|优秀|合格|不合格)[。！ ]*$/.test(description))) errors.push("不能只用空泛等级词，请描述学生实际做出的证据行为。");
  const activityIds = new Set(activities.map((activity) => activity.id));
  if (!dimension.activityIds.length || dimension.activityIds.some((id) => !activityIds.has(id))) errors.push("这一维没有对齐当前课堂活动。");
  if (dimension.status === "needs-review") errors.push("对应活动已经变化，请检查这一维后重新确认。");
  return errors;
}

export function getRubricSummary(draft: RubricDraft, activities: LessonActivity[]) {
  const errors = Object.fromEntries(draft.dimensions.map((dimension) => [dimension.id, validateRubricDimension(dimension, activities)]));
  const mappedActivities = new Set(draft.dimensions.flatMap((dimension) => dimension.activityIds));
  const alignedDimensions = draft.dimensions.filter((dimension) => errors[dimension.id].length === 0).length;
  return {
    errors,
    dimensionCount: draft.dimensions.length,
    productCount: activities.filter((activity) => activity.evidenceProduct.trim()).length,
    mappedActivityCount: mappedActivities.size,
    alignedDimensions,
    omittedCoreDimension: draft.dimensions.length < 4,
    ready: activities.length > 0 && draft.dimensions.length > 0 && alignedDimensions === draft.dimensions.length,
  };
}

export function updateRubricDimension(draft: RubricDraft, dimensionId: string, change: Partial<Omit<RubricDimension, "id">>): RubricDraft {
  return {
    ...draft,
    confirmed: false,
    dimensions: draft.dimensions.map((dimension) => dimension.id === dimensionId
      ? { ...dimension, ...change, teacherEdited: true, status: "ready" }
      : dimension),
  };
}

export function updateRubricLevel(draft: RubricDraft, dimensionId: string, levelIndex: number, description: string): RubricDraft {
  const dimension = draft.dimensions.find((item) => item.id === dimensionId);
  if (!dimension) return draft;
  const levels = dimension.levels.map((level, index) => index === levelIndex ? { ...level, description } : level);
  return updateRubricDimension(draft, dimensionId, { levels });
}

export function normalizeRubricDraft(draft: RubricDraft, activities: LessonActivity[]): RubricDraft {
  if (draft.fixtureVersion !== 1) return createRubricDraft(activities);
  const previous = new Map(draft.activitySnapshot.map((item) => [item.id, item.fingerprint]));
  const nextSnapshot = snapshotActivities(activities);
  const next = new Map(nextSnapshot.map((item) => [item.id, item.fingerprint]));
  const changed = new Set([...previous.keys(), ...next.keys()].filter((id) => previous.get(id) !== next.get(id)));
  if (!changed.size) return draft;
  return {
    ...draft,
    confirmed: false,
    activitySnapshot: nextSnapshot,
    dimensions: draft.dimensions.map((dimension) => dimension.activityIds.some((id) => changed.has(id))
      ? { ...dimension, status: "needs-review" }
      : dimension),
  };
}

export function createRubricAlternative(dimension: RubricDimension) {
  return dimension.levels.map((level, index) => index === 2
    ? { ...level, description: `${level.description.replace(/。$/, "")}，并用一句话说明判断仍可能如何被新证据修正。` }
    : level);
}
