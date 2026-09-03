import type { EvidenceRelation } from "./evidence-map";

export type LessonActivityStatus = "ready" | "needs-review";
export type LessonActivity = { id: string; title: string; minutes: number; transitionMinutes: number; sourceIds: string[]; studentAction: string; evidenceProduct: string; difficulty: string; scaffold: string; teacherEdited: boolean; status: LessonActivityStatus };
type RelationSnapshot = { id: string; sourceId: string; fingerprint: string };
export type LessonDesignDraft = { fixtureVersion: 2; activities: LessonActivity[]; confirmed: boolean; questionSnapshot: string; sourceSnapshot: string[]; relationSnapshot: RelationSnapshot[] };
export type ActivityErrors = Partial<Record<"title" | "minutes" | "transitionMinutes" | "sourceIds" | "studentAction" | "evidenceProduct" | "difficulty" | "scaffold", string>>;

const relationSnapshot = (relations: EvidenceRelation[]): RelationSnapshot[] => relations.map((relation) => ({ id: relation.id, sourceId: relation.sourceId, fingerprint: [relation.claimId, relation.sourceId, relation.kind, relation.status].join("|") }));
const available = (preferred: string[], selected: string[]) => preferred.filter((id) => selected.includes(id)).slice(0, 3).length ? preferred.filter((id) => selected.includes(id)).slice(0, 3) : selected.slice(0, 2);

export function createLessonDesignDraft(question: string, selectedIds: string[], relations: EvidenceRelation[]): LessonDesignDraft {
  const rows: Array<[string, number, string[], string, string, string, string]> = [
    ["从盛世到转折：建立时间坐标", 5, ["SRC-DU-FU", "SRC-ZZTJ-216"], "在时间带上标出开元盛世、安史之乱和唐朝灭亡，先提出变化猜想。", "一条三阶段时间带和一个待验证猜想。", "容易把安史之乱当作唐朝立即灭亡。", "先只追问两个日期之间相隔多久，不评价原因。"],
    ["回忆盛世依靠的条件", 8, ["SRC-DU-FU", "SRC-TD-FINANCE"], "从两条材料提取盛世所依靠的治理、财政和社会条件。", "小组写出三项条件并标注史料编号。", "容易只罗列繁荣表现，不解释维持条件。", "提示句：这一现象要持续，需要国家能够___。"],
    ["用史料解释条件如何运转", 7, ["SRC-TD-FINANCE", "SRC-BU-NIAN"], "比较制度记录和实物材料，判断它们分别能说明什么。", "一组“能说明／不能说明”的材料批注。", "容易把精英器物推成全社会普遍状况。", "先辨认材料性质，再圈出能够直接支持的词句。"],
    ["比较安史之乱前后的变化", 9, ["SRC-ZZTJ-216", "SRC-TD-HOUSEHOLDS", "SRC-DU-FU-WAR"], "比较兵权、户籍和基层生活材料，把变化归入军事、财政与社会。", "一张前后比较表和对转折点的解释。", "容易把户籍下降直接等同于死亡人数。", "追问：除了死亡，还有什么会让国家登记不到人口？"],
    ["分析乱后为何未能恢复盛世", 8, ["SRC-XTS-BING", "SRC-HESHUO", "SRC-LIUYAN"], "对照藩镇压力与乱后恢复材料，解释唐朝为何能延续却难以复原。", "一项包含反例的多重原因说明。", "学生可能只会回答“藩镇割据”，忽略妥协和制度韧性。", "先问“为何还能延续”，再问“延续为什么不等于恢复”。"],
    ["合成由盛转衰因果链", 5, ["SRC-TD-FINANCE", "SRC-ZZTJ-216", "SRC-XTS-BING", "SRC-HESHUO"], "把背景条件、结构变化、关键转折、后续影响和直接冲击连成因果链。", "一张带史料编号的由盛转衰因果链。", "容易把并列因素当作彼此没有联系的原因清单。", "提供五种关系词，不提供历史结论。"],
    ["个人解释与退出票", 3, ["SRC-TD-HOUSEHOLDS", "SRC-HESHUO"], "独立写120—150字解释，至少引用两条史料并说明一个限制。", "一段个人历史解释。", "时间紧时可能只复述小组结论。", "句式：依据史料__与__，我认为__；但__说明结论需要限定。"],
  ];
  return {
    fixtureVersion: 2, confirmed: false, questionSnapshot: question, sourceSnapshot: [...selectedIds], relationSnapshot: relationSnapshot(relations),
    activities: rows.map(([title, minutes, sources, studentAction, evidenceProduct, difficulty, scaffold], index) => ({ id: `ACT-${index + 1}`, title, minutes, transitionMinutes: 0, sourceIds: available(sources, selectedIds), studentAction, evidenceProduct, difficulty, scaffold, teacherEdited: false, status: "ready" })),
  };
}

export function validateLessonActivity(activity: LessonActivity, selectedIds: string[]): ActivityErrors {
  const errors: ActivityErrors = {};
  if (!activity.title.trim()) errors.title = "请填写活动名称。";
  if (!Number.isInteger(activity.minutes) || activity.minutes < 1 || activity.minutes > 60) errors.minutes = "活动时间应为1—60分钟的整数。";
  if (!activity.sourceIds.length) errors.sourceIds = "请为活动选择至少一条本课史料。";
  else if (activity.sourceIds.some((id) => !selectedIds.includes(id))) errors.sourceIds = "活动引用了已移出的史料，请重新选择。";
  if (!activity.studentAction.trim()) errors.studentAction = "请说明学生实际要做什么。";
  if (!activity.evidenceProduct.trim()) errors.evidenceProduct = "请写明能够观察到的课堂成果。";
  if (!activity.difficulty.trim()) errors.difficulty = "请指出学生最可能卡住的地方。";
  if (!activity.scaffold.trim()) errors.scaffold = "请提供对应引导问题或支架。";
  return errors;
}

export function getLessonDesignSummary(draft: LessonDesignDraft, availableMinutes: number) {
  const errors = Object.fromEntries(draft.activities.map((activity) => [activity.id, validateLessonActivity(activity, draft.sourceSnapshot)]));
  const taskMinutes = draft.activities.reduce((total, activity) => total + activity.minutes, 0);
  const transitionMinutes = draft.activities.reduce((total, activity) => total + activity.transitionMinutes, 0);
  const totalMinutes = taskMinutes + transitionMinutes;
  return { taskMinutes, transitionMinutes, totalMinutes, sourceCount: new Set(draft.activities.flatMap((activity) => activity.sourceIds)).size, reviewCount: draft.activities.filter((activity) => activity.status === "needs-review").length, overBy: Math.max(0, totalMinutes - availableMinutes), remaining: Math.max(0, availableMinutes - totalMinutes), errors, ready: draft.activities.length > 0 && totalMinutes <= availableMinutes && Object.values(errors).every((value) => Object.keys(value).length === 0) };
}

export function updateLessonActivity(draft: LessonDesignDraft, activityId: string, change: Partial<Omit<LessonActivity, "id">>): LessonDesignDraft {
  return { ...draft, confirmed: false, activities: draft.activities.map((activity) => activity.id === activityId ? { ...activity, ...change, teacherEdited: true, status: "ready" } : activity) };
}
export function moveLessonActivity(draft: LessonDesignDraft, activityId: string, offset: -1 | 1): LessonDesignDraft {
  const index = draft.activities.findIndex((activity) => activity.id === activityId); const target = index + offset;
  if (index < 0 || target < 0 || target >= draft.activities.length) return draft;
  const activities = [...draft.activities]; [activities[index], activities[target]] = [activities[target], activities[index]];
  return { ...draft, confirmed: false, activities };
}
export function normalizeLessonDesignDraft(draft: LessonDesignDraft, question: string, selectedIds: string[], relations: EvidenceRelation[]): LessonDesignDraft {
  if (draft.fixtureVersion !== 2) return createLessonDesignDraft(question, selectedIds, relations);
  const questionChanged = draft.questionSnapshot !== question;
  const changed = questionChanged || draft.sourceSnapshot.some((id) => !selectedIds.includes(id)) || selectedIds.some((id) => !draft.sourceSnapshot.includes(id));
  if (!changed) return draft;
  return { ...draft, confirmed: false, questionSnapshot: question, sourceSnapshot: [...selectedIds], relationSnapshot: relationSnapshot(relations), activities: draft.activities.map((activity) => ({ ...activity, status: questionChanged || activity.sourceIds.some((id) => !selectedIds.includes(id)) ? "needs-review" : activity.status })) };
}
export function createActivityAlternative(activity: LessonActivity) {
  return { studentAction: `${activity.studentAction.replace(/。$/, "")}，再由同伴指出其中一处证据边界。`, scaffold: "先独立标注，再两人互查；只提示检查步骤，不提供历史结论。" };
}
