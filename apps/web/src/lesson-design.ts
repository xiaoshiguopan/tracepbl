import type { EvidenceRelation } from "./evidence-map";

export type LessonActivityStatus = "ready" | "needs-review";

export type LessonActivity = {
  id: string;
  title: string;
  minutes: number;
  transitionMinutes: number;
  sourceIds: string[];
  studentAction: string;
  evidenceProduct: string;
  difficulty: string;
  scaffold: string;
  teacherEdited: boolean;
  status: LessonActivityStatus;
};

type RelationSnapshot = { id: string; sourceId: string; fingerprint: string };

export type LessonDesignDraft = {
  fixtureVersion: 1;
  activities: LessonActivity[];
  confirmed: boolean;
  questionSnapshot: string;
  sourceSnapshot: string[];
  relationSnapshot: RelationSnapshot[];
};

export type ActivityErrors = Partial<Record<"title" | "minutes" | "transitionMinutes" | "sourceIds" | "studentAction" | "evidenceProduct" | "difficulty" | "scaffold" | "status", string>>;

const relationSnapshot = (relations: EvidenceRelation[]): RelationSnapshot[] => relations.map((relation) => ({
  id: relation.id,
  sourceId: relation.sourceId,
  fingerprint: [relation.claimId, relation.sourceId, relation.kind, relation.reason, relation.status].join("|"),
}));

const useAvailable = (preferred: string[], selectedIds: string[]) => {
  const available = preferred.filter((id) => selectedIds.includes(id));
  return available.length ? available : selectedIds.slice(0, 2);
};

export function createLessonDesignDraft(question: string, selectedIds: string[], relations: EvidenceRelation[]): LessonDesignDraft {
  return {
    fixtureVersion: 1,
    confirmed: false,
    questionSnapshot: question,
    sourceSnapshot: [...selectedIds],
    relationSnapshot: relationSnapshot(relations),
    activities: [
      {
        id: "ACT-001",
        title: "辨认史料在说什么",
        minutes: 8,
        transitionMinutes: 2,
        sourceIds: useAvailable(["AUTH-SRC-001", "AUTH-SRC-003"], selectedIds),
        studentAction: "标出材料信息、作者观点与暂不能证明的内容。",
        evidenceProduct: "每人留下两条材料标注，并写明属于信息、观点还是待证解释。",
        difficulty: "区分材料信息、观点与历史解释",
        scaffold: "使用“材料信息 / 作者观点 / 仍需证明”三栏标注提示。",
        teacherEdited: false,
        status: "ready",
      },
      {
        id: "ACT-002",
        title: "让不同史料互相质询",
        minutes: 15,
        transitionMinutes: 2,
        sourceIds: useAvailable(["AUTH-SRC-002", "AUTH-SRC-004"], selectedIds),
        studentAction: "比较至少两种不同类型史料，找出一项相互支持和一项需要限定之处。",
        evidenceProduct: "小组完成一份证据比较记录，写清支持、差异与限制。",
        difficulty: "比较不同类型证据，避免只把材料并列罗列",
        scaffold: "使用“相互支持 / 彼此差异 / 可能原因”证据表。",
        teacherEdited: false,
        status: "ready",
      },
      {
        id: "ACT-003",
        title: "写出有边界的判断",
        minutes: 16,
        transitionMinutes: 2,
        sourceIds: [...selectedIds],
        studentAction: "引用至少两条史料，写出 120—150 字判断，并主动限定结论。",
        evidenceProduct: "一段回应中心问题的个人判断，含两处史料依据和一项证据空缺。",
        difficulty: "把比较结果写成有依据、有限度的历史判断",
        scaffold: "句式提示：依据___与___，我认为___；但___仍不能由现有史料说明。",
        teacherEdited: false,
        status: "ready",
      },
    ],
  };
}

export function validateLessonActivity(activity: LessonActivity, selectedIds: string[]): ActivityErrors {
  const errors: ActivityErrors = {};
  if (!activity.title.trim()) errors.title = "请填写活动名称。";
  if (!Number.isInteger(activity.minutes) || activity.minutes < 1 || activity.minutes > 60) errors.minutes = "任务时间应为 1—60 分钟的整数。";
  if (!Number.isInteger(activity.transitionMinutes) || activity.transitionMinutes < 0 || activity.transitionMinutes > 15) errors.transitionMinutes = "转换时间应为 0—15 分钟的整数。";
  if (!activity.sourceIds.length) errors.sourceIds = "每个核心活动至少绑定一条本课史料。";
  else if (activity.sourceIds.some((id) => !selectedIds.includes(id))) errors.sourceIds = "活动仍引用已移出的史料，请重新选择。";
  if (!activity.studentAction.trim()) errors.studentAction = "请说明学生怎样使用证据。";
  else if (!/(史料|材料|证据|引用|比较|质疑|限定|标出|标注)/.test(activity.studentAction)) errors.studentAction = "这个动作没有要求使用证据，请加入选择、引用、比较、质疑或限定。";
  if (!activity.evidenceProduct.trim()) errors.evidenceProduct = "请写明课堂中能够看到的证据成果。";
  if (!activity.difficulty.trim()) errors.difficulty = "请指出学生最可能卡住的地方。";
  if (!activity.scaffold.trim()) errors.scaffold = "请提供与困难对应、但不直接给答案的支架。";
  if (activity.status === "needs-review") errors.status = "上游内容已变化，请重新确认这一段。";
  return errors;
}

export function getLessonDesignSummary(draft: LessonDesignDraft, availableMinutes: number) {
  const errors = Object.fromEntries(draft.activities.map((activity) => [activity.id, validateLessonActivity(activity, draft.sourceSnapshot)]));
  const taskMinutes = draft.activities.reduce((total, activity) => total + activity.minutes, 0);
  const transitionMinutes = draft.activities.reduce((total, activity) => total + activity.transitionMinutes, 0);
  const totalMinutes = taskMinutes + transitionMinutes;
  const sourceCount = new Set(draft.activities.flatMap((activity) => activity.sourceIds)).size;
  const hasErrors = Object.values(errors).some((activityErrors) => Object.keys(activityErrors).length > 0);
  return {
    taskMinutes,
    transitionMinutes,
    totalMinutes,
    sourceCount,
    overBy: Math.max(0, totalMinutes - availableMinutes),
    remaining: Math.max(0, availableMinutes - totalMinutes),
    errors,
    ready: draft.activities.length > 0 && totalMinutes <= availableMinutes && !hasErrors,
  };
}

export function updateLessonActivity(draft: LessonDesignDraft, activityId: string, change: Partial<Omit<LessonActivity, "id">>): LessonDesignDraft {
  return {
    ...draft,
    confirmed: false,
    activities: draft.activities.map((activity) => activity.id === activityId ? { ...activity, ...change, teacherEdited: true, status: "ready" } : activity),
  };
}

export function moveLessonActivity(draft: LessonDesignDraft, activityId: string, offset: -1 | 1): LessonDesignDraft {
  const index = draft.activities.findIndex((activity) => activity.id === activityId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= draft.activities.length) return draft;
  const activities = [...draft.activities];
  [activities[index], activities[target]] = [activities[target], activities[index]];
  return { ...draft, confirmed: false, activities };
}

export function normalizeLessonDesignDraft(draft: LessonDesignDraft, question: string, selectedIds: string[], relations: EvidenceRelation[]): LessonDesignDraft {
  if (draft.fixtureVersion !== 1) return createLessonDesignDraft(question, selectedIds, relations);
  const nextRelations = relationSnapshot(relations);
  const questionChanged = draft.questionSnapshot !== question;
  const removedSources = draft.sourceSnapshot.filter((id) => !selectedIds.includes(id));
  const previousRelations = new Map(draft.relationSnapshot.map((item) => [item.id, item]));
  const nextRelationMap = new Map(nextRelations.map((item) => [item.id, item]));
  const changedSources = new Set(removedSources);
  for (const item of [...draft.relationSnapshot, ...nextRelations]) {
    if (previousRelations.get(item.id)?.fingerprint !== nextRelationMap.get(item.id)?.fingerprint) changedSources.add(item.sourceId);
  }
  if (!questionChanged && changedSources.size === 0) return draft;
  return {
    ...draft,
    confirmed: false,
    questionSnapshot: question,
    sourceSnapshot: [...selectedIds],
    relationSnapshot: nextRelations,
    activities: draft.activities.map((activity) => questionChanged || activity.sourceIds.some((id) => changedSources.has(id))
      ? { ...activity, status: "needs-review" }
      : activity),
  };
}

export function createActivityAlternative(activity: LessonActivity) {
  return {
    studentAction: `${activity.studentAction.replace(/。$/, "")}，再由同伴指出其中一处证据边界。`,
    scaffold: "先独立标注，再两人互查；只提示检查步骤，不提供历史结论。",
  };
}
