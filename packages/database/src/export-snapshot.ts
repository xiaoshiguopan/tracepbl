import { DomainError } from "@tracepbl/domain";

// No reads of mutable task/source rows: a historical export has one frozen input.
export function projectExportSnapshot(snapshot: Record<string, unknown>) {
  if (snapshot.exportContentVersion !== 1 || !Array.isArray(snapshot.frozenSources)) {
    throw new DomainError("INVALID_STATE", "此历史版本缺少完整导出内容，请重新复核并签发。");
  }
  const context = record(snapshot.context);
  const question = record(snapshot.questionSet);
  const sources = snapshot.frozenSources.map(record);
  const permitted = new Set(sources.filter(source => source.rightsState === "verified_reusable").map(source => source.versionId));
  const evidence = record(snapshot.evidenceMap);
  const content = {
    context: { ...context, stage: context.stage === "junior" ? "初中" : context.stage === "senior" ? "高中" : context.stage },
    questionSet: { ...question, evidenceOutcome: question.evidenceOutcome ?? undefined, scopeBoundary: question.scopeBoundary ?? undefined },
    evidenceMap: { ...evidence, claims: array(evidence.claims).map(value => {
      const claim = record(value);
      return { ...claim, relations: array(claim.relations).map(value => {
        const relation = record(value);
        return { ...relation, citations: array(relation.citations).map(value => {
          const citation = record(value);
          return permitted.has(citation.sourceVersionId) ? citation : { ...citation, chunkId: null, quotedText: null };
        }) };
      }) };
    }) },
    lessonDesign: snapshot.lessonDesign,
    rubric: snapshot.rubric,
    sources: sources.map(source => permitted.has(source.versionId) ? source : { ...source, contentText: null, contextNote: null, meaningNote: null, interpretationNote: null }),
  };
  return { content, citations: sources.map(source => ({ title: source.title, locator: source.locator, url: source.url })) };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("INVALID_STATE", "批准版本的导出内容不完整，请重新复核并签发。");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new DomainError("INVALID_STATE", "批准版本的导出内容不完整，请重新复核并签发。");
  return value;
}
