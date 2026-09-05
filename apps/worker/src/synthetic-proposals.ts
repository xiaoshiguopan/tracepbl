import type { GenerateRequest } from "@tracepbl/ai";

/** Deterministic local integration suggestions; never historical assertions. */
export function syntheticProposal(request: GenerateRequest<unknown>) {
  const prompt = JSON.parse(request.input) as { templateVersion: string; teacherInput: string };
  const snapshot = JSON.parse(prompt.teacherInput);
  const sources: string[] = snapshot.sourceSelection?.sourceVersionIds ?? [];
  const question = snapshot.questionSet?.centralQuestion ?? snapshot.context?.inquiryDirection ?? "这些合成材料可以支持什么判断？";
  let proposal: unknown;
  if (prompt.templateVersion === "question-guidance.v1") proposal = { centralQuestion: String(question).slice(0, 290), subQuestions: ["材料记录了哪些变化？", "不同材料的说法如何相互印证？", "现有证据还有哪些限制？"], focus: "whole-lesson", inputType: "证据支持", evidenceOutcome: "比较材料并写出有来源依据的解释。", scopeBoundary: "仅依据本任务提供的公开或合成材料，不形成未经核验的历史结论。", confirmed: false };
  else if (prompt.templateVersion === "evidence-analysis.v1") proposal = { claims: (snapshot.questionSet?.subQuestions?.length ? snapshot.questionSet.subQuestions : [question]).map((text: string, index: number) => ({ text, gapAccepted: false, relations: sources.length ? [{ sourceVersionId: sources[index % sources.length], kind: "supports", reason: "合成建议：请比较该材料的记录与当前问题，教师须确认是否支持此关系。", citations: [{ sourceVersionId: sources[index % sources.length], chunkId: null, quotedText: null }] }] : [] })) };
  else if (prompt.templateVersion === "lesson.v1") proposal = { activities: ["定位材料信息", "比较证据与限制", "形成可追溯解释"].map((title, index) => ({ title, activityMinutes: index === 2 ? Number(snapshot.context.minutes) - 2 * Math.floor(Number(snapshot.context.minutes) / 3) : Math.floor(Number(snapshot.context.minutes) / 3), transitionMinutes: 0, studentAction: ["阅读材料，标注与问题有关的记录和出处。", "比较不同材料，写出相互支持或限制的理由。", "引用材料形成解释，并说明证据仍不足之处。"][index], evidenceProduct: ["带来源定位的摘录单", "证据比较表", "包含依据与限制的解释短文"][index], difficulty: "容易把推断当成材料直接记录。", scaffold: "追问：这句话由哪项材料支持？材料没有说明什么？", sourceVersionIds: sources })) };
  else if (prompt.templateVersion === "rubric.v1") proposal = { items: ["来源定位与准确引用", "证据比较与历史解释", "证据限制与反思"].map(title => ({ title, activityOrdinals: (snapshot.lessonDesign?.activities ?? []).map((_: unknown, index: number) => index), levels: [{ key: "support", label: "需要支持", description: "在教师提示下标出材料出处，尝试用一条记录支持自己的判断。" }, { key: "expected", label: "达到要求", description: "准确标注来源，比较两项材料并用证据解释判断，指出一处限制。" }, { key: "strong", label: "表现充分", description: "综合不同来源形成有条件的解释，回应相反证据并说明还需补充的材料。" }] })) };
  else proposal = { summary: "合成建议：请教师检查材料及其适用边界。" };
  return { proposal, citations: [] };
}
