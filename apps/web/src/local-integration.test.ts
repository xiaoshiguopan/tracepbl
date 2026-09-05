import { afterEach, describe, expect, it, vi } from "vitest";
import { localViewModel } from "./local-view-model";
import type { LocalTaskData } from "./local-task-data";
import { ContractVersion, RuntimeSchema } from "@tracepbl/contracts";
import { generatedInlineDraft, mergeInlineDraft, restoreInlineDraft, reviewedInlineContent } from "./inline-ai-draft";

const id = "11000000-0000-4000-8000-000000000001";
const blank: LocalTaskData = { task: {id,title:"合成新任务",workflowState:"draft",lockVersion:0,createdAt:"2026-09-05T00:00:00Z",updatedAt:"2026-09-05T00:00:00Z",deletedAt:null,latestTeacherRevisionId:null,latestApprovedRevisionId:null,latestAuditId:null,reviewStates:{questionSet:"ready",sourceSelection:"ready",evidenceMap:"ready",lessonDesign:"ready",rubric:"ready"}},context:null,question:null,sources:[],evidence:{claims:[]},lesson:{activities:[]},rubric:{items:[]},audit:null };
const runtime = { mode:"local",contractVersion:ContractVersion,fixtureVersion:"synthetic-v1",ai:{execution:"fake",available:true,provider:"zhipu",generationModel:"GLM-5.3-Flash",embeddingModel:"embedding-3",reason:null},limits:{generationInputTokens:24000,generationOutputTokens:4000,callsPerAction:2,dailyGenerationCalls:20,dailyGenerationTokens:200000,dailyEmbeddingTokens:200000,dailyCny:2,deleteGraceHours:24} };
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe("complete mode data boundaries", () => {
  it("fills and undoes only the chosen question field while preserving other teacher edits", () => {
    const before = { ...localViewModel(blank).question, centralQuestion: "教师原问题？", evidenceOutcome: "教师原交付" };
    const generated = { ...before, centralQuestion: "合成新问题？", evidenceOutcome: "不得误覆盖" };
    const filled = mergeInlineDraft("questionGuidance", before, generated, "centralQuestion");
    expect(filled.centralQuestion).toBe("合成新问题？"); expect(filled.evidenceOutcome).toBe("教师原交付");
    const restored = restoreInlineDraft("questionGuidance", { ...filled, evidenceOutcome: "之后手工修改交付" }, before, "centralQuestion");
    expect(restored.centralQuestion).toBe("教师原问题？"); expect(restored.evidenceOutcome).toBe("之后手工修改交付");
  });
  it("preserves citation text when the teacher edits an AI relationship reason", () => {
    const generated = { claims: [{ text: "合成判断", gapAccepted: false, relations: [{ sourceVersionId: id, kind: "supports", reason: "合成理由", citations: [{ sourceVersionId: id, chunkId: 1, quotedText: "合成引文" }] }] }] };
    const draft = generatedInlineDraft("evidenceAnalysis", generated, blank) as ReturnType<typeof localViewModel>["evidence"];
    draft.relations[0]!.reason = "教师修改后的理由";
    const content = reviewedInlineContent("evidenceAnalysis", draft, blank, generated);
    expect(content).toMatchObject({ claims: [{ relations: [{ reason: "教师修改后的理由", citations: [{ quotedText: "合成引文", sourceVersionId: id, chunkId: 1 }] }] }] });
  });
  it("replaces one activity without changing other activities or its time allocation", () => {
    const original = { ...localViewModel(blank).lesson, activities: [{ id:"A", title:"原活动", minutes:10,transitionMinutes:1,sourceIds:[],studentAction:"动作",evidenceProduct:"成果",difficulty:"难点",scaffold:"支持",teacherEdited:true,status:"ready" as const },{ id:"B", title:"保留活动", minutes:20,transitionMinutes:0,sourceIds:[],studentAction:"动作",evidenceProduct:"成果",difficulty:"难点",scaffold:"支持",teacherEdited:true,status:"ready" as const }] };
    const candidate = { ...original, activities: [{ ...original.activities[0]!, title:"新活动",minutes:15 }] };
    const next = mergeInlineDraft("lesson",original,candidate,"A");
    expect(next.activities[0]).toMatchObject({title:"新活动",minutes:10,transitionMinutes:1}); expect(next.activities[1]).toEqual(original.activities[1]);
  });
  it("bounds service waits and allows a failed runtime request to be retried", async () => {
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1", protocol: "http:" } });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetch = vi.fn().mockRejectedValueOnce(new DOMException("test timeout", "TimeoutError")).mockResolvedValueOnce(new Response(JSON.stringify(runtime)));
    vi.stubGlobal("fetch", fetch);
    try {
      const { localSession, localRequest } = await import("./local-api");
      await expect(localSession()).rejects.toMatchObject({ code: "UNAVAILABLE" });
      await expect(localSession()).resolves.toMatchObject({ mode: "local" });
      fetch.mockRejectedValueOnce(new DOMException("test timeout", "TimeoutError"));
      await expect(localRequest("/api/v1/tasks", { parse: value => value }, { method: "POST", key: "retry-key", body: {} })).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(timeout).toHaveBeenCalledWith(10000);
      expect(timeout).toHaveBeenCalledWith(15000);
    } finally { timeout.mockRestore(); }
  });
  it("does not populate empty server tasks from Demo fixtures or mark missing audit as passed", () => {
    const view=localViewModel(blank);
    expect(view.context.lesson).toBe("");expect(view.question.centralQuestion).toBe("");expect(view.question.subQuestions).toEqual([]);
    expect(view.source.selectedIds).toEqual([]);expect(view.evidence.claims).toEqual([]);expect(view.lesson.activities).toEqual([]);expect(view.rubric.dimensions).toEqual([]);
    expect(view.audit.completed).toBe(false);expect(view.audit.findings[0]?.severity).toBe("unknown");expect(view.review.approved).toBe(false);
    expect(view.audit.staleCategories).toEqual([]);
  });
  it("preserves the actual single-question structure and server review state", () => {
    const data={...blank,question:{centralQuestion:"合成问题？",subQuestions:[],confirmed:true}};
    expect(localViewModel(data).question).toMatchObject({focus:"single",subQuestions:[],confirmed:true});
    expect(localViewModel({...data,task:{...data.task,reviewStates:{...data.task.reviewStates,questionSet:"needs_review"}}}).question.confirmed).toBe(false);
  });
  it("restores the server teacher reason verbatim and rejects stale audit readiness", () => {
    const data: LocalTaskData = {...blank,audit:{id,inputLockVersion:0,status:"succeeded",summary:null,createdAt:"2026-09-05T00:00:00Z",completedAt:"2026-09-05T00:00:00Z",findings:[{id,severity:"teacher_confirmation",category:"feasibility",subjectKind:"task",subjectId:null,title:"合成条件",basis:"合成依据",impact:"合成影响",recommendation:null,resolutionState:"accepted",teacherReason:"教师原话：保留独立阅读时间。"}]}};
    expect(localViewModel(data).audit.findings[0]?.teacherReason).toBe("教师原话：保留独立阅读时间。");
    expect(localViewModel(data).audit.findings[0]?.stage).toBe("活动");
    expect(localViewModel({...data,task:{...data.task,lockVersion:1}}).audit.completed).toBe(false);
  });
  it("refuses complete mode on public origins before making any request", async () => {
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);vi.stubGlobal("window",{location:{hostname:"example.github.io",protocol:"https:"}});
    const {localRequest}=await import("./local-api");await expect(localRequest("/api/v1/runtime",RuntimeSchema)).rejects.toMatchObject({code:"MODE_MISMATCH"});expect(fetch).not.toHaveBeenCalled();
  });
  it("deduplicates simultaneous identical commands and never silently falls back after a conflict", async () => {
    vi.stubGlobal("window",{location:{hostname:"127.0.0.1",protocol:"http:"}});
    const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(runtime))).mockResolvedValueOnce(new Response(JSON.stringify({ok:true})));
    vi.stubGlobal("fetch",fetch);
    const {localRequest}=await import("./local-api");const parser={parse:(value:unknown)=>value};
    const command={method:"POST" as const,key:"synthetic-command-0001",body:{title:"合成任务"}};
    await Promise.all([localRequest("/api/v1/tasks",parser,command),localRequest("/api/v1/tasks",parser,command)]);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({type:"https://tracepbl.local/problems/version-conflict",title:"Conflict",status:412,code:"VERSION_CONFLICT",detail:"untrusted server detail",traceId:id}),{status:412}));
    await expect(localRequest(`/api/v1/tasks/${id}/context`,parser,{method:"PUT",version:0,body:{}})).rejects.toMatchObject({code:"VERSION_CONFLICT"});
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
