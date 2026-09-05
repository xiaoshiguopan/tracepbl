import { describe, expect, it } from "vitest";
import { MaterialInputSchema, ProblemSchema, QuestionSetSchema, TeachingContextSchema, parseTaskEtag, taskEtag } from "../src/index.js";

describe("public contracts", () => {
  it("accepts the approved single and whole-lesson question sizes", () => {
    for (const count of [0, 2, 3, 4]) {
      expect(QuestionSetSchema.safeParse({ centralQuestion: "合成开放问题？", focus: count === 0 ? "single" : "whole-lesson", subQuestions: Array.from({ length: count }, (_, i) => `子问题${i}？`), confirmed: true }).success).toBe(true);
    }
    expect(QuestionSetSchema.safeParse({ centralQuestion: "合成开放问题？", focus: "single", subQuestions: ["不应出现？"], confirmed: true }).success).toBe(false);
    expect(QuestionSetSchema.safeParse({ centralQuestion: "合成开放问题？", focus: "whole-lesson", subQuestions: [], confirmed: true }).success).toBe(false);
  });
  it("keeps lesson types optional", () => {
    expect(TeachingContextSchema.safeParse({ stage: "初中", grade: "七年级", textbook: "合成教材", lesson: "合成课次", lessonTypes: [], minutes: 45, inquiryDirection: null, priorKnowledge: null, learningNeeds: [], profileNote: null }).success).toBe(true);
  });
  it("round-trips task ETags and rejects malformed forms", () => {
    expect(taskEtag(3)).toBe('"task-lv-3"');
    expect(parseTaskEtag('"task-lv-3"')).toBe(3);
    expect(parseTaskEtag("task-lv-3")).toBeNull();
  });

  it("rejects a grade outside the selected stage", () => {
    const result = TeachingContextSchema.safeParse({ stage: "初中", grade: "高一", textbook: "合成教材", lesson: "合成课次", lessonTypes: ["新授"], minutes: 45, inquiryDirection: null, priorKnowledge: null, learningNeeds: [], profileNote: null });
    expect(result.success).toBe(false);
  });

  it("does not accept unknown material fields", () => {
    expect(MaterialInputSchema.safeParse({ kind: "text", name: "合成材料", text: "合成正文", rightsAttestation: "authorizedForCurrentTask", sensitiveInformationConfirmedAbsent: true, workspaceId: crypto.randomUUID() }).success).toBe(false);
  });

  it("keeps problem details free of internal extensions", () => {
    expect(ProblemSchema.safeParse({ type: "https://tracepbl.local/problems/resource-not-found", title: "未找到资源", status: 404, code: "RESOURCE_NOT_FOUND", detail: "该资源不存在或不可访问。", traceId: crypto.randomUUID(), sql: "select" }).success).toBe(false);
  });
});
