import type { TeachingContextDraft } from "./teaching-context";

export const inputTypes = ["因果解释", "变化解释", "证据支持", "史料比较"] as const;
export type InputType = (typeof inputTypes)[number];
export type QuestionFocus = "whole-lesson" | "single";

export type QuestionProposal = {
  id: QuestionFocus;
  question: string;
  subQuestions: string[];
  evidenceOutcome: string;
  scopeBoundary: string;
  fitReason: string;
  omission: string;
};

export type QuestionWorkspaceDraft = {
  contextSnapshot: TeachingContextDraft;
  originalInput: string;
  inputType: InputType | "";
  typeReason: string;
  focus: QuestionFocus;
  centralQuestion: string;
  subQuestions: string[];
  evidenceOutcome: string;
  scopeBoundary: string;
  confirmed: boolean;
};

export type QuestionField = "originalInput" | "inputType" | "centralQuestion" | "evidenceOutcome" | "scopeBoundary";
export type QuestionErrors = Partial<Record<QuestionField, string>>;

function inferInputType(text: string): InputType {
  if (/(比较|异同|不同史料)/.test(text)) return "史料比较";
  if (/(证明|支持|依据|史料)/.test(text)) return "证据支持";
  if (/(变化|转折|演变|盛衰)/.test(text)) return "变化解释";
  return "因果解释";
}

export function createQuestionGuidance(originalInput: string, context: TeachingContextDraft) {
  const inputType = inferInputType(originalInput);
  const text = originalInput.trim().replace(/[？?]$/, "");
  const isTangDecline = /(唐|盛衰|由盛转衰|安史)/.test(`${originalInput}${context.lesson}`);
  const primary: QuestionProposal = {
    id: "whole-lesson",
    question: isTangDecline ? "唐朝为何由盛转衰？" : `${text || context.lesson}可以从哪些相互关联的因素来解释？`,
    subQuestions: isTangDecline ? [
      "唐朝前期的盛世局面建立在怎样的政治、经济与社会条件上？",
      "安史之乱为什么成为唐朝由盛转衰的关键转折？",
      "安史之乱后，哪些长期问题使唐朝难以恢复并最终灭亡？",
    ] : ["这一历史现象形成的背景与条件是什么？", "哪些变化构成了关键转折？", "不同因素如何共同影响最终结果？"],
    evidenceOutcome: "小组形成一张带史料编号的由盛转衰因果链；个人完成一段120—150字解释，至少引用两条史料。",
    scopeBoundary: "作为整节课的线索问题，使用三个递进子问题组织证据与活动。",
    fitReason: `${context.minutes || "45"} 分钟适合用2—4个子问题展开一条完整线索。`,
    omission: "不在这一课时重新讲授隋唐全部基础史实。",
  };
  const alternative: QuestionProposal = {
    id: "single",
    question: text ? `${text}？` : "安史之乱为何成为唐朝由盛转衰的重要转折？",
    subQuestions: [],
    evidenceOutcome: "选择3—5条相关史料，形成一项有证据支持并说明限制的历史解释。",
    scopeBoundary: "按单个问题处理，不再拆分子问题。",
    fitReason: "适合3—15分钟的小问题探究，减少材料和课堂步骤。",
    omission: "不承担整节课的知识线索。",
  };
  return { inputType, reason: `系统判断它更接近“${inputType}”，并根据45分钟课时推荐整课线索模式。`, primary, alternative };
}

export function createQuestionDraft(context: TeachingContextDraft): QuestionWorkspaceDraft {
  const originalInput = context.inquiryQuestion.trim();
  const guidance = createQuestionGuidance(originalInput || "唐朝为何由盛转衰", context);
  return {
    contextSnapshot: { ...context, lessonTypes: [...context.lessonTypes], learningNeeds: [...context.learningNeeds] },
    originalInput,
    inputType: guidance.inputType,
    typeReason: guidance.reason,
    focus: guidance.primary.id,
    centralQuestion: guidance.primary.question,
    subQuestions: [...guidance.primary.subQuestions],
    evidenceOutcome: guidance.primary.evidenceOutcome,
    scopeBoundary: guidance.primary.scopeBoundary,
    confirmed: false,
  };
}

export function normalizeQuestionDraft(value: QuestionWorkspaceDraft, context: TeachingContextDraft) {
  const initial = createQuestionDraft(context);
  const legacyQuestions = [
    "依据政治运行、经济发展与社会生活等不同类型的史料，“盛世”能在多大程度上概括唐朝前期？",
    "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？",
    "唐朝的盛世局面为何未能持续，并最终走向衰亡？",
  ];
  const legacySubQuestions = new Set([
    "唐朝盛世局面依靠哪些条件建立和维持？",
    "哪些变化破坏了这些条件，安史之乱为何构成重要转折？",
    "安史之乱后唐朝为何还能延续，却始终未恢复盛世并最终灭亡？",
  ]);
  const savedSubQuestions = Array.isArray(value.subQuestions) && value.subQuestions.length ? value.subQuestions : initial.subQuestions;
  return {
    ...initial,
    ...value,
    contextSnapshot: value.contextSnapshot || initial.contextSnapshot,
    centralQuestion: legacyQuestions.includes(value.centralQuestion) ? initial.centralQuestion : value.centralQuestion || initial.centralQuestion,
    subQuestions: savedSubQuestions.some((question) => legacySubQuestions.has(question)) ? initial.subQuestions : savedSubQuestions,
    inputType: inputTypes.includes(value.inputType as InputType) ? value.inputType : initial.inputType,
    focus: value.focus === "single" ? "single" : "whole-lesson",
  } satisfies QuestionWorkspaceDraft;
}

export function applyQuestionProposal(draft: QuestionWorkspaceDraft, proposal: QuestionProposal): QuestionWorkspaceDraft {
  return { ...draft, focus: proposal.id, centralQuestion: proposal.question, subQuestions: [...proposal.subQuestions], evidenceOutcome: proposal.evidenceOutcome, scopeBoundary: proposal.scopeBoundary, confirmed: false };
}

export function validateQuestionInput(value: string): QuestionErrors {
  const text = value.trim();
  if (!text) return { originalInput: "请写下这节课最想让学生解释或比较的方向。" };
  if (text.length > 1000) return { originalInput: "初步方向请控制在1000字以内。" };
  if (!/[\p{L}\p{N}]/u.test(text) || text.length < 2) return { originalInput: "请补充一个有实际含义的历史教学方向。" };
  if (/(身份证|手机号|联系电话|学生姓名|班级名单|家庭住址)/.test(text)) return { originalInput: "请移除姓名、联系方式或其他个人信息。" };
  return {};
}

export function validateQuestionConfirmation(draft: QuestionWorkspaceDraft, context: TeachingContextDraft): QuestionErrors {
  const errors: QuestionErrors = {};
  if (!draft.centralQuestion.trim()) errors.centralQuestion = "请保留或修改中心问题。";
  else if (draft.centralQuestion.length > 180) errors.centralQuestion = "中心问题请控制在180字以内。";
  else if (/(必然|当然|证明.+正确|毫无疑问)/.test(draft.centralQuestion)) errors.centralQuestion = "问题预设了答案，请改为允许证据支持、质疑或限定的问法。";
  if (draft.focus === "whole-lesson" && (draft.subQuestions.length < 2 || draft.subQuestions.length > 4)) errors.centralQuestion = "整课线索建议保留2—4个子问题。";
  if (!draft.evidenceOutcome.trim()) errors.evidenceOutcome = "请保留学生最终需要完成的证据产物。";
  if (Number(context.minutes) <= 10 && draft.focus === "whole-lesson") errors.centralQuestion = "当前时间更适合单个问题，请缩小范围或增加课时。";
  return errors;
}
