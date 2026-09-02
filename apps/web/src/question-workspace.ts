import type { TeachingContextDraft } from "./teaching-context";

export const inputTypes = ["主题", "事件", "概念", "观点"] as const;
export type InputType = (typeof inputTypes)[number];
export type QuestionFocus = "judgement" | "perspectives";

export type QuestionProposal = {
  id: QuestionFocus;
  question: string;
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
  evidenceOutcome: string;
  scopeBoundary: string;
  confirmed: boolean;
};

export type QuestionField = "originalInput" | "inputType" | "centralQuestion" | "evidenceOutcome" | "scopeBoundary";
export type QuestionErrors = Partial<Record<QuestionField, string>>;

function inferInputType(text: string): InputType {
  if (/(是否|能否|可以|称为|观点|认为|评价)/.test(text)) return "观点";
  if (/(事件|战争|改革|运动|起义|过程)/.test(text)) return "事件";
  if (/(概念|制度|思想|主义)/.test(text)) return "概念";
  return "主题";
}

function explainInputType(inputType: InputType) {
  if (inputType === "观点") return "其中包含一个需要证据支持、质疑或限定的判断。";
  if (inputType === "事件") return "它需要收束过程、因果与不同主体的视角。";
  if (inputType === "概念") return "它需要界定时代含义、变化与适用边界。";
  return "它目前更像一个宽泛方向，需要限定对象和证据范围。";
}

export function createQuestionGuidance(originalInput: string, context: TeachingContextDraft) {
  const text = originalInput.trim();
  const inputType = inferInputType(text);
  const lesson = context.lesson || "本课";
  const minutes = context.minutes || "当前";
  const isProsperousTang = /唐/.test(text) && /盛世/.test(text);
  const judgementQuestion = isProsperousTang
    ? "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？"
    : text.endsWith("？") || text.endsWith("?")
      ? text.replace(/\?$/, "？")
      : `依据哪些史料，我们可以判断：${text}？`;
  const primary: QuestionProposal = {
    id: "judgement",
    question: judgementQuestion,
    evidenceOutcome: isProsperousTang
      ? "比较至少两类史料，提出“盛世”判断，并说明一项支持依据和一项需要限定的方面。"
      : "比较至少两项材料依据，写出一项带有限定条件的历史判断。",
    scopeBoundary: `只处理${lesson}中能在 ${minutes} 分钟内完成比较的核心范围。`,
    fitReason: `紧扣${lesson}，把阅读、比较和表达控制在 ${minutes} 分钟内，并允许不同证据修正结论。`,
    omission: "不会覆盖本课的全部知识点。",
  };
  const alternative: QuestionProposal = {
    id: "perspectives",
    question: isProsperousTang
      ? "从统治者与普通民众等不同群体的处境看，唐朝前期的“盛世”判断需要怎样限定？"
      : "从不同群体或不同类型史料看，同一历史判断会出现哪些差异？",
    evidenceOutcome: "比较两种不同立场或类型的材料，说明共同点、差异及其原因。",
    scopeBoundary: `只选择${lesson}中的两个代表性视角，并在 ${minutes} 分钟内完成比较。`,
    fitReason: `适合把${lesson}从单一结论转成多视角比较，同时不扩大到整段历史。`,
    omission: "对事件完整过程和全部知识点梳理较少。",
  };
  return { inputType, reason: explainInputType(inputType), primary, alternative };
}

export function createQuestionDraft(context: TeachingContextDraft): QuestionWorkspaceDraft {
  const contextSnapshot = { ...context, lessonTypes: [...context.lessonTypes] };
  const originalInput = context.inquiryQuestion.trim();
  if (!originalInput) {
    return { contextSnapshot, originalInput: "", inputType: "", typeReason: "", focus: "judgement", centralQuestion: "", evidenceOutcome: "", scopeBoundary: "", confirmed: false };
  }
  const guidance = createQuestionGuidance(originalInput, context);
  return {
    contextSnapshot,
    originalInput,
    inputType: guidance.inputType,
    typeReason: guidance.reason,
    focus: guidance.primary.id,
    centralQuestion: guidance.primary.question,
    evidenceOutcome: guidance.primary.evidenceOutcome,
    scopeBoundary: guidance.primary.scopeBoundary,
    confirmed: false,
  };
}

export function normalizeQuestionDraft(value: QuestionWorkspaceDraft, context: TeachingContextDraft) {
  const initial = createQuestionDraft({ ...context, inquiryQuestion: value.originalInput || context.inquiryQuestion });
  const legacyDefaultQuestion = "依据政治运行、经济发展与社会生活等不同类型的史料，“盛世”能在多大程度上概括唐朝前期？";
  return {
    ...initial,
    ...value,
    contextSnapshot: value.contextSnapshot || initial.contextSnapshot,
    focus: value.focus || initial.focus,
    inputType: value.inputType || initial.inputType,
    typeReason: value.typeReason || initial.typeReason,
    centralQuestion: value.centralQuestion === legacyDefaultQuestion ? initial.centralQuestion : value.centralQuestion || initial.centralQuestion,
    evidenceOutcome: value.evidenceOutcome || initial.evidenceOutcome,
    scopeBoundary: value.scopeBoundary || initial.scopeBoundary,
  } satisfies QuestionWorkspaceDraft;
}

export function applyQuestionProposal(draft: QuestionWorkspaceDraft, proposal: QuestionProposal): QuestionWorkspaceDraft {
  return { ...draft, focus: proposal.id, centralQuestion: proposal.question, evidenceOutcome: proposal.evidenceOutcome, scopeBoundary: proposal.scopeBoundary, confirmed: false };
}

export function validateQuestionInput(value: string): QuestionErrors {
  const text = value.trim();
  if (!text) return { originalInput: "请写下一句话，说明这节课最想让学生判断或解释什么。" };
  if (text.length > 1000) return { originalInput: "初步方向请控制在 1000 字以内。" };
  if (!/[\p{L}\p{N}]/u.test(text) || text.length < 2) return { originalInput: "请补充一个有实际含义的历史教学方向。" };
  if (/(身份证|手机号|联系电话|学生姓名|班级名单|家庭住址)/.test(text)) return { originalInput: "请移除姓名、联系方式或其他个人信息。" };
  return {};
}

export function validateQuestionConfirmation(draft: QuestionWorkspaceDraft, context: TeachingContextDraft): QuestionErrors {
  const errors: QuestionErrors = {};
  if (!draft.inputType) errors.inputType = "请确认系统对初步方向的理解。";
  const question = draft.centralQuestion.trim();
  if (!question) errors.centralQuestion = "请保留或修改中心问题。";
  else if (question.length > 180) errors.centralQuestion = "中心问题请控制在 180 字以内。";
  else if (/(必然|当然|证明.+正确|毫无疑问)/.test(question)) errors.centralQuestion = "问题预设了答案，请改为允许证据支持、质疑或限定的问法。";
  if (!draft.evidenceOutcome.trim()) errors.evidenceOutcome = "请保留或修改学生的证据产物。";
  else if (draft.evidenceOutcome.trim().length > 240) errors.evidenceOutcome = "证据产物请控制在 240 字以内。";
  if (Number(context.minutes) <= 45 && /(从古至今|全部历史|所有方面|完整历史)/.test(question)) errors.centralQuestion = "这个范围难以在当前课时完成，请限定时间、对象或比较维度。";
  if (/(身份证|手机号|联系电话|学生姓名|班级名单|家庭住址)/.test([question, draft.evidenceOutcome].join(" "))) errors.centralQuestion = "请移除姓名、联系方式或其他个人信息。";
  return errors;
}
