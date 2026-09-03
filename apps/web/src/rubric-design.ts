import type { LessonActivity } from "./lesson-design";

export type RubricLevel = { key: "support" | "expected" | "strong"; label: "需要支持" | "达到要求" | "表现充分"; description: string };
export type RubricDimension = { id: string; title: string; activityIds: string[]; levels: RubricLevel[]; teacherEdited: boolean; status: "ready" | "needs-review" };
type ActivitySnapshot = { id: string; fingerprint: string };
export type RubricDraft = { fixtureVersion: 3; dimensions: RubricDimension[]; confirmed: boolean; activitySnapshot: ActivitySnapshot[] };

const level = (key: RubricLevel["key"], label: RubricLevel["label"], description: string): RubricLevel => ({ key, label, description });
const snapshotActivities = (activities: LessonActivity[]): ActivitySnapshot[] => activities.map((activity) => ({ id: activity.id, fingerprint: [activity.studentAction, activity.evidenceProduct, activity.sourceIds.join(","), activity.status].join("|") }));

export function createRubricDraft(activities: LessonActivity[]): RubricDraft {
  const activityIds = activities.map((activity) => activity.id);
  return { fixtureVersion: 3, confirmed: false, activitySnapshot: snapshotActivities(activities), dimensions: [
    { id: "RUBRIC-CHRONOLOGY", title: "时空定位与阶段变化", activityIds, levels: [
      level("support", "需要支持", "混淆唐前期、安史之乱与唐后期，或把安史之乱等同于唐朝立即灭亡。"),
      level("expected", "达到要求", "能按唐前期—安史之乱—唐后期排列变化，并指出唐朝此后仍延续。"),
      level("strong", "表现充分", "能用时间、空间或区域变化解释不同阶段之间的联系。"),
    ], teacherEdited: false, status: "ready" },
    { id: "RUBRIC-SOURCES", title: "史料辨析与证据使用", activityIds, levels: [
      level("support", "需要支持", "只复述结论或罗列材料，引用无法定位。"),
      level("expected", "达到要求", "至少引用 2 条编号史料，说明材料信息怎样支持判断。"),
      level("strong", "表现充分", "比较来源、时代语境和局限，解释材料如何互证或冲突。"),
    ], teacherEdited: false, status: "ready" },
    { id: "RUBRIC-CAUSES", title: "多重因果解释", activityIds, levels: [
      level("support", "需要支持", "只给出单一原因，或停留在人物好坏的判断。"),
      level("expected", "达到要求", "能区分长期背景、关键转折与后续直接原因。"),
      level("strong", "表现充分", "能解释政治、军事、财政与社会因素如何相互作用，并比较其作用。"),
    ], teacherEdited: false, status: "ready" },
    { id: "RUBRIC-EXPLANATION", title: "论证、反证与结论边界", activityIds, levels: [
      level("support", "需要支持", "把结果说成必然，也没有解释唐朝为何仍延续。"),
      level("expected", "达到要求", "能依据史料回答问题，并区分由盛转衰与唐朝灭亡。"),
      level("strong", "表现充分", "能回应反证或其他解释，并说明结论适用的范围与局限。"),
    ], teacherEdited: false, status: "ready" },
    { id: "RUBRIC-EXPRESSION", title: "历史认识与观点表达", activityIds, levels: [
      level("support", "需要支持", "观点与问题联系不清，或只表达态度而没有史实和史料依据。"),
      level("expected", "达到要求", "能围绕问题清楚表达观点，使用准确史实和史料依据，并区分转衰与灭亡。"),
      level("strong", "表现充分", "能在尊重史实的基础上比较不同解释，反思简单归因，并以完整、审慎的语言作出判断。"),
    ], teacherEdited: false, status: "ready" },
  ] };
}

export function validateRubricDimension(dimension: RubricDimension) {
  const errors: string[] = [];
  const descriptions = dimension.levels.map((item) => item.description.trim());
  if (!dimension.title.trim()) errors.push("请写出评价维度名称。");
  if (descriptions.length !== 3 || descriptions.some((description) => !description)) errors.push("三个表现层级都需要写出可观察行为。");
  if (new Set(descriptions).size !== descriptions.length) errors.push("三个层级需要体现不同的学生表现。");
  if (descriptions.some((description) => /^(很好|一般|较差|优秀|合格|不合格)[。！ ]*$/.test(description))) errors.push("请描述学生实际表现，不要只写空泛等级词。");
  return errors;
}

export function getRubricSummary(draft: RubricDraft, activities: LessonActivity[]) {
  const errors = Object.fromEntries(draft.dimensions.map((dimension) => [dimension.id, validateRubricDimension(dimension)]));
  const alignedDimensions = draft.dimensions.filter((dimension) => errors[dimension.id].length === 0).length;
  const activityIds = new Set(activities.map((activity) => activity.id));
  const reviewCount = draft.dimensions.filter((dimension) => dimension.status === "needs-review" || dimension.activityIds.some((id) => !activityIds.has(id))).length;
  return { errors, dimensionCount: draft.dimensions.length, alignedDimensions, reviewCount, ready: activities.length > 0 && draft.dimensions.length > 0 && alignedDimensions === draft.dimensions.length };
}

export function updateRubricDimension(draft: RubricDraft, dimensionId: string, change: Partial<Omit<RubricDimension, "id">>): RubricDraft {
  return { ...draft, confirmed: false, dimensions: draft.dimensions.map((dimension) => dimension.id === dimensionId ? { ...dimension, ...change, teacherEdited: true, status: "ready" } : dimension) };
}
export function updateRubricLevel(draft: RubricDraft, dimensionId: string, levelIndex: number, description: string): RubricDraft {
  const dimension = draft.dimensions.find((item) => item.id === dimensionId);
  return dimension ? updateRubricDimension(draft, dimensionId, { levels: dimension.levels.map((item, index) => index === levelIndex ? { ...item, description } : item) }) : draft;
}
export function normalizeRubricDraft(draft: RubricDraft, activities: LessonActivity[]): RubricDraft {
  if (draft.fixtureVersion !== 3) return createRubricDraft(activities);
  const previous = new Map(draft.activitySnapshot.map((item) => [item.id, item.fingerprint]));
  const nextSnapshot = snapshotActivities(activities);
  const changed = new Set(nextSnapshot.filter((item) => previous.get(item.id) !== item.fingerprint).map((item) => item.id));
  if (!changed.size && previous.size === nextSnapshot.length) return draft;
  return { ...draft, confirmed: false, activitySnapshot: nextSnapshot, dimensions: draft.dimensions.map((dimension) => dimension.activityIds.some((id) => changed.has(id) || !previous.has(id)) ? { ...dimension, status: "needs-review" } : dimension) };
}
export function createRubricAlternative(dimension: RubricDimension) {
  return dimension.levels.map((item, index) => index === 2 ? { ...item, description: `${item.description.replace(/。$/, "")}，并说明哪些新证据可能改变这一判断。` } : item);
}
