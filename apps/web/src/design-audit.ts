import type { EvidenceMapDraft } from "./evidence-map";
import type { LessonDesignDraft } from "./lesson-design";
import type { RubricDraft } from "./rubric-design";

export const auditCategories = ["来源完整性", "加工透明度", "证据充分性", "课堂可行性", "活动—评价一致性", "数据与范围"] as const;
export type AuditCategory = typeof auditCategories[number];
export type AuditSeverity = "blocker" | "confirmation" | "suggestion" | "unknown";

export type AuditInput = {
  question: string;
  selectedSourceIds: string[];
  evidence: EvidenceMapDraft;
  lesson: LessonDesignDraft;
  rubric: RubricDraft;
};

export type AuditFinding = {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  stage: "问题" | "史料" | "论证" | "活动" | "量规";
  title: string;
  objectLabel: string;
  basis: string;
  impact: string;
  recommendation?: string;
  teacherReason: string;
  resolution: "pending" | "accepted";
};

export type AuditCheck = { id: string; category: AuditCategory; label: string };

export type AuditDraft = {
  fixtureVersion: 1;
  findings: AuditFinding[];
  passedChecks: AuditCheck[];
  categorySnapshots: Record<AuditCategory, string>;
  staleCategories: AuditCategory[];
  completed: boolean;
};

const passedChecks: AuditCheck[] = [
  { id: "PASS-SOURCE-1", category: "来源完整性", label: "四条史料均有机构与定位" },
  { id: "PASS-SOURCE-2", category: "来源完整性", label: "必要短引可区分于馆方说明" },
  { id: "PASS-SOURCE-3", category: "来源完整性", label: "未知许可没有被标记为可复制" },
  { id: "PASS-PROCESS-1", category: "加工透明度", label: "删节与现代标点有说明" },
  { id: "PASS-PROCESS-2", category: "加工透明度", label: "合成建议与史料原文可区分" },
  { id: "PASS-PROCESS-3", category: "加工透明度", label: "图片未在许可未知时复制" },
  { id: "PASS-EVIDENCE-1", category: "证据充分性", label: "三个命题均有证据或明确缺口" },
  { id: "PASS-EVIDENCE-2", category: "证据充分性", label: "支持与质疑关系可以定位" },
  { id: "PASS-EVIDENCE-3", category: "证据充分性", label: "结论要求回应证据边界" },
  { id: "PASS-CLASS-1", category: "课堂可行性", label: "任务与转换完整计入 45 分钟" },
  { id: "PASS-CLASS-2", category: "课堂可行性", label: "每段活动都有困难与支架" },
  { id: "PASS-CLASS-3", category: "课堂可行性", label: "核心活动均绑定本课史料" },
  { id: "PASS-ALIGN-1", category: "活动—评价一致性", label: "四个维度映射到课堂成果" },
  { id: "PASS-ALIGN-2", category: "活动—评价一致性", label: "量规没有评价课堂未要求能力" },
  { id: "PASS-DATA-1", category: "数据与范围", label: "未包含学生姓名、作品或成绩" },
  { id: "PASS-DATA-2", category: "数据与范围", label: "前端状态未冒充安全授权" },
];

function makeSnapshots(input: AuditInput): Record<AuditCategory, string> {
  const source = input.selectedSourceIds.join("|");
  const evidence = JSON.stringify([input.question, input.evidence.claims, input.evidence.relations]);
  const lesson = JSON.stringify(input.lesson.activities);
  const rubric = JSON.stringify(input.rubric.dimensions);
  return {
    来源完整性: source,
    加工透明度: source,
    证据充分性: `${source}|${evidence}`,
    课堂可行性: lesson,
    "活动—评价一致性": `${lesson}|${rubric}`,
    数据与范围: JSON.stringify([input.question, input.evidence.claims, input.lesson.activities, input.rubric.dimensions]),
  };
}

export function createAuditDraft(input: AuditInput): AuditDraft {
  return {
    fixtureVersion: 1,
    completed: false,
    passedChecks,
    categorySnapshots: makeSnapshots(input),
    staleCategories: [],
    findings: [
      {
        id: "AUDIT-EVIDENCE-GAP",
        severity: "confirmation",
        category: "证据充分性",
        stage: "史料",
        title: "当前史料仍缺少部分群体和地区的直接材料",
        objectLabel: "证据 → 结论边界",
        basis: "现有材料能够支持政治运行与经济发展的判断，但不足以覆盖不同地区和普通群体。",
        impact: "若不限定结论，学生可能把局部材料扩写成对整个唐朝社会的绝对判断。",
        recommendation: "保留当前证据缺口，并要求学生在结论中限定群体、地区和时期。",
        teacherReason: "",
        resolution: "pending",
      },
      {
        id: "AUDIT-READING-LOAD",
        severity: "suggestion",
        category: "课堂可行性",
        stage: "活动",
        title: "活动二的阅读任务较集中",
        objectLabel: "课堂活动 · 活动二",
        basis: "15 分钟内比较两类史料可以完成，但需要保留现有标注支架。",
        impact: "若临时增加材料，学生可能只来得及摘抄，无法完成比较。",
        teacherReason: "",
        resolution: "pending",
      },
    ],
  };
}

export function getAuditSummary(draft: AuditDraft) {
  const blockerCount = draft.findings.filter((finding) => finding.severity === "blocker" && finding.resolution === "pending").length;
  const confirmationCount = draft.findings.filter((finding) => finding.severity === "confirmation" && finding.resolution === "pending").length;
  const suggestionCount = draft.findings.filter((finding) => finding.severity === "suggestion").length;
  const unknownCount = draft.findings.filter((finding) => finding.severity === "unknown").length;
  const acceptedCount = draft.findings.filter((finding) => finding.severity === "confirmation" && finding.resolution === "accepted").length;
  const reasonErrors = Object.fromEntries(draft.findings.filter((finding) => finding.severity === "confirmation" && finding.resolution === "accepted").flatMap((finding) => {
    const length = finding.teacherReason.trim().length;
    return length < 10 || length > 500 ? [[finding.id, "教师确认理由需要 10—500 字。"]] : [];
  }));
  return {
    totalCount: draft.passedChecks.length + draft.findings.length,
    passedCount: draft.passedChecks.length + acceptedCount,
    blockerCount,
    confirmationCount,
    suggestionCount,
    unknownCount,
    reasonErrors,
    ready: blockerCount === 0 && confirmationCount === 0 && unknownCount === 0 && Object.keys(reasonErrors).length === 0,
  };
}

export function acceptAuditRecommendation(draft: AuditDraft, findingId: string): AuditDraft {
  return {
    ...draft,
    completed: false,
    findings: draft.findings.map((finding) => finding.id === findingId && finding.severity === "confirmation" && finding.recommendation
      ? { ...finding, resolution: "accepted", teacherReason: finding.recommendation }
      : finding),
  };
}

export function updateAuditReason(draft: AuditDraft, findingId: string, teacherReason: string): AuditDraft {
  return { ...draft, completed: false, findings: draft.findings.map((finding) => finding.id === findingId ? { ...finding, teacherReason } : finding) };
}

export function normalizeAuditDraft(draft: AuditDraft, input: AuditInput): AuditDraft {
  if (draft.fixtureVersion !== 1) return createAuditDraft(input);
  const nextSnapshots = makeSnapshots(input);
  const staleCategories = auditCategories.filter((category) => draft.categorySnapshots[category] !== nextSnapshots[category]);
  if (!staleCategories.length) return draft;
  return { ...draft, staleCategories };
}

export function rerunAudit(draft: AuditDraft, input: AuditInput): AuditDraft {
  const fresh = createAuditDraft(input);
  const preservedFindings = fresh.findings.map((finding) => {
    const previous = draft.findings.find((item) => item.id === finding.id);
    return previous && !draft.staleCategories.includes(finding.category) ? previous : finding;
  });
  return { ...fresh, findings: preservedFindings };
}
