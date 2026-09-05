import { EvidenceMapSchema, LessonDesignSchema, QuestionSetSchema, RubricSchema } from "@tracepbl/contracts";
import type { SourceRecord } from "./source-discovery";
import { relationNames } from "./local-view-model";

/** Only known, validated fields become review content; never flatten arbitrary model data. */
export function localProposalContent(purpose: string, value: unknown, sources: SourceRecord[]) {
  const sourceName = (id: string) => sources.find(source => source.id === id)?.title ?? "来源不可用，请勿采用";
  const sourceNotes = (ids: string[]) => <div className="proposal-sources">{[...new Set(ids)].map(id => {
    const source = sources.find(item => item.id === id);
    return <details key={id}><summary>来源与边界 · {sourceName(id)}</summary>{source ? <dl><dt>定位</dt><dd>{source.locator}</dd><dt>使用边界</dt><dd>{source.limitation}</dd><dt>权利说明</dt><dd>{source.rights}</dd><dt>核验状态</dt><dd>{source.statusNote}</dd></dl> : <p>当前任务中找不到该来源版本，不能据此作出判断。</p>}</details>;
  })}</div>;
  if (purpose === "evidenceAnalysis") {
    const result = EvidenceMapSchema.safeParse(value); if (!result.success) return null;
    return <>{result.data.claims.map((claim, index) => <article className="proposal-card" key={index}><p className="eyebrow">问题 {index + 1}</p><h4>{claim.text}</h4>{claim.relations.length ? claim.relations.map((relation, ordinal) => <div className="proposal-relation" key={ordinal}><p><strong>{sourceName(relation.sourceVersionId)}</strong><span className="proposal-kind">建议关系：{relationNames[relation.kind]}</span></p><p><strong>建议理由</strong> {relation.reason}</p>{relation.citations.some(citation => citation.quotedText) ? relation.citations.map((citation, i) => citation.quotedText ? <blockquote key={i}>{citation.quotedText}<small>引自：{sourceName(citation.sourceVersionId)}</small></blockquote> : null) : <p className="proposal-caution">尚未提供原文短引，请对照材料确认，不能仅凭这条建议认定证据成立。</p>}</div>) : <p>尚无关联材料，需要补充证据。</p>}{claim.gapAccepted ? <p>此判断包含已标记的证据缺口，仍需教师复核。</p> : null}</article>)}{sourceNotes(result.data.claims.flatMap(claim => claim.relations.flatMap(relation => [relation.sourceVersionId, ...relation.citations.map(citation => citation.sourceVersionId)])))}</>;
  }
  if (purpose === "questionGuidance") {
    const result = QuestionSetSchema.safeParse(value); if (!result.success) return null;
    const item = result.data;
    return <article className="proposal-card"><p className="eyebrow">核心问题</p><h4>{item.centralQuestion}</h4>{item.subQuestions.length ? <ol>{item.subQuestions.map((question, index) => <li key={index}>{question}</li>)}</ol> : null}<dl><dt>学生交付</dt><dd>{item.evidenceOutcome || "尚未设置"}</dd><dt>范围边界</dt><dd>{item.scopeBoundary || "尚未设置"}</dd></dl></article>;
  }
  if (purpose === "lesson") {
    const result = LessonDesignSchema.safeParse(value); if (!result.success) return null;
    return <>{result.data.activities.map((item, index) => <article className="proposal-card" key={index}><p className="eyebrow">活动 {index + 1} · {item.activityMinutes} 分钟{item.transitionMinutes ? ` · 转场 ${item.transitionMinutes} 分钟` : ""}</p><h4>{item.title}</h4><dl><dt>学生动作</dt><dd>{item.studentAction}</dd><dt>课堂成果</dt><dd>{item.evidenceProduct}</dd><dt>学习难点</dt><dd>{item.difficulty || "未说明"}</dd><dt>教师支持</dt><dd>{item.scaffold || "未说明"}</dd><dt>使用材料</dt><dd>{item.sourceVersionIds.map(sourceName).join("、") || "未关联材料"}</dd></dl></article>)}{sourceNotes(result.data.activities.flatMap(item => item.sourceVersionIds))}</>;
  }
  if (purpose === "rubric") {
    const result = RubricSchema.safeParse(value); if (!result.success) return null;
    return <>{result.data.items.map((item, index) => <article className="proposal-card" key={index}><h4>{item.title}</h4><p>对应活动：{item.activityOrdinals.map(ordinal => `活动 ${ordinal + 1}`).join("、") || "未关联"}</p><dl>{item.levels.map(level => <div key={level.key}><dt>{level.label}</dt><dd>{level.description}</dd></div>)}</dl></article>)}</>;
  }
  return null;
}
