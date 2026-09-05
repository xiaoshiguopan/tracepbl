import { ExportManifestSchema } from "@tracepbl/contracts";
import { localViewModel, localSources } from "./local-view-model";
import type { LocalTaskData } from "./local-task-data";
import type { TeachingPackExport } from "./teaching-pack-export";

export function exportManifestPack(value: unknown): TeachingPackExport {
  const manifest = ExportManifestSchema.parse(value);
  const content = manifest.content;
  const data: LocalTaskData = { task: { id: manifest.exportId, title: manifest.fileName, workflowState: "approved", lockVersion: 0, createdAt: manifest.generatedAt, updatedAt: manifest.generatedAt, deletedAt: null, latestTeacherRevisionId: null, latestApprovedRevisionId: manifest.revisionId, latestAuditId: null, reviewStates: { questionSet: "ready", sourceSelection: "ready", evidenceMap: "ready", lessonDesign: "ready", rubric: "ready" } }, context: content.context, question: content.questionSet, sources: content.sources, evidence: content.evidenceMap, lesson: content.lessonDesign, rubric: content.rubric, audit: null };
  const view = localViewModel(data);
  const sources = localSources(data);
  return { context: view.context, input: { question: view.question.centralQuestion, selectedSourceIds: sources.map(source => source.id), lesson: view.lesson, rubric: view.rubric, audit: view.audit }, fileName: manifest.fileName, sources, subQuestions: content.questionSet.subQuestions,
    evidenceNotes: content.evidenceMap.claims.flatMap(claim => [`判断问题：${claim.text}${claim.gapAccepted ? "（教师已标记证据缺口）" : ""}`, ...claim.relations.map(relation => `依据：${sources.find(source => source.id === relation.sourceVersionId)?.title ?? "未知来源"}；${relation.reason}${relation.citations.filter(citation => citation.quotedText).map(citation => `；引文：${citation.quotedText}`).join("")}`)]),
    revisionLabel: `本地教学包；冻结修订 ${manifest.revisionId}；生成时间 ${manifest.generatedAt}。内容来自教师签发时的服务器快照。`,
  };
}
