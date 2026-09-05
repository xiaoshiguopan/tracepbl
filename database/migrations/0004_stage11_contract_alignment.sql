-- CP-11-01: approved 2026-09-05. Existing migrations and revision rows remain immutable.
SET LOCAL ROLE tracepbl_owner;
ALTER TABLE core.inquiry_questions DROP CONSTRAINT inquiry_questions_ordinal_check;
ALTER TABLE core.inquiry_questions DROP CONSTRAINT inquiry_questions_check;
ALTER TABLE core.inquiry_questions ADD CONSTRAINT inquiry_questions_ordinal_check CHECK (ordinal BETWEEN 0 AND 4);
ALTER TABLE core.inquiry_questions ADD CONSTRAINT inquiry_questions_check CHECK (
  (kind='central' AND parent_id IS NULL AND ordinal=0)
  OR (kind='sub' AND parent_id IS NOT NULL AND ordinal BETWEEN 1 AND 4)
);
CREATE OR REPLACE FUNCTION core.current_task_snapshot(p_workspace_id uuid,p_task_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,core AS $$
  SELECT jsonb_build_object(
    'schemaVersion',1,'title',t.title,
    'exportContentVersion',1,
    'frozenSources',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'versionId',sv.id,'title',s.title,'kind',s.material_kind,'url',s.canonical_url,
      'creatorOrInstitution',sv.creator_or_institution,'sourceType',sv.source_type,'locator',sv.locator,
      'periodLabel',sv.period_label,'contextNote',sv.context_note,'meaningNote',sv.meaning_note,
      'interpretationNote',sv.interpretation_note,'limitationNote',sv.limitation_note,'rightsBasis',sv.rights_basis,
      'contentText',CASE WHEN sv.rights_state='verified_reusable' THEN sv.content_text ELSE NULL END,
      'rightsState',sv.rights_state,'verificationState',sv.verification_state,
      'selected',true,'selectionOrder',ts.selection_order
    ) ORDER BY ts.selection_order) FROM core.task_sources ts JOIN core.source_versions sv ON sv.id=ts.source_version_id
      JOIN core.sources s ON s.id=sv.source_id WHERE ts.workspace_id=t.workspace_id AND ts.task_id=t.id),'[]'::jsonb),
    'context',(SELECT jsonb_build_object('stage',c.stage,'grade',c.grade,'textbook',c.textbook,'lesson',c.lesson,'lessonTypes',c.lesson_types,'minutes',c.minutes,'inquiryDirection',c.inquiry_direction,'priorKnowledge',c.prior_knowledge,'learningNeeds',c.learning_needs,'profileNote',c.profile_note) FROM core.task_contexts c WHERE c.workspace_id=t.workspace_id AND c.task_id=t.id),
    'questionSet',(SELECT jsonb_build_object('centralQuestion',q.question_text,'subQuestions',COALESCE((SELECT jsonb_agg(s.question_text ORDER BY s.ordinal) FROM core.inquiry_questions s WHERE s.workspace_id=q.workspace_id AND s.task_id=q.task_id AND s.kind='sub'),'[]'::jsonb),'inputType',q.input_type,'evidenceOutcome',q.evidence_outcome,'scopeBoundary',q.scope_boundary,'confirmed',q.confirmed_at IS NOT NULL) FROM core.inquiry_questions q WHERE q.workspace_id=t.workspace_id AND q.task_id=t.id AND q.kind='central'),
    'sourceSelection',jsonb_build_object('sourceVersionIds',COALESCE((SELECT jsonb_agg(ts.source_version_id ORDER BY ts.selection_order) FROM core.task_sources ts WHERE ts.workspace_id=t.workspace_id AND ts.task_id=t.id),'[]'::jsonb)),
    'evidenceMap',jsonb_build_object('claims',COALESCE((SELECT jsonb_agg(jsonb_build_object('text',ec.claim_text,'gapAccepted',ec.gap_accepted,'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceVersionId',er.source_version_id,'kind',er.relation_kind,'reason',er.reason,'citations',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceVersionId',ci.source_version_id,'chunkId',ci.chunk_id,'quotedText',ci.quoted_text) ORDER BY ci.ordinal) FROM core.evidence_citations ci WHERE ci.workspace_id=er.workspace_id AND ci.task_id=er.task_id AND ci.relation_id=er.id),'[]'::jsonb)) ORDER BY er.created_at,er.id) FROM core.evidence_relations er WHERE er.workspace_id=ec.workspace_id AND er.task_id=ec.task_id AND er.claim_id=ec.id),'[]'::jsonb)) ORDER BY ec.ordinal) FROM core.evidence_claims ec WHERE ec.workspace_id=t.workspace_id AND ec.task_id=t.id),'[]'::jsonb)),
    'lessonDesign',jsonb_build_object('activities',COALESCE((SELECT jsonb_agg(jsonb_build_object('title',la.title,'activityMinutes',la.activity_minutes,'transitionMinutes',la.transition_minutes,'studentAction',la.student_action,'evidenceProduct',la.evidence_product,'difficulty',la.difficulty,'scaffold',la.scaffold,'sourceVersionIds',COALESCE((SELECT jsonb_agg(a.source_version_id ORDER BY a.source_version_id) FROM core.activity_sources a WHERE a.workspace_id=la.workspace_id AND a.task_id=la.task_id AND a.activity_id=la.id),'[]'::jsonb)) ORDER BY la.ordinal) FROM core.learning_activities la WHERE la.workspace_id=t.workspace_id AND la.task_id=t.id),'[]'::jsonb)),
    'rubric',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object('title',ri.title,'activityOrdinals',COALESCE((SELECT jsonb_agg(la.ordinal ORDER BY la.ordinal) FROM core.rubric_activities ra JOIN core.learning_activities la ON la.workspace_id=ra.workspace_id AND la.task_id=ra.task_id AND la.id=ra.activity_id WHERE ra.workspace_id=ri.workspace_id AND ra.task_id=ri.task_id AND ra.rubric_item_id=ri.id),'[]'::jsonb),'levels',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',rl.level_key,'label',rl.label,'description',rl.description) ORDER BY rl.ordinal) FROM core.rubric_levels rl WHERE rl.rubric_item_id=ri.id),'[]'::jsonb)) ORDER BY ri.ordinal) FROM core.rubric_items ri WHERE ri.workspace_id=t.workspace_id AND ri.task_id=t.id),'[]'::jsonb))
  ) FROM core.tasks t WHERE t.workspace_id=p_workspace_id AND t.id=p_task_id;
$$;

UPDATE ops.runtime_components SET version='0004',initialized_at=now() WHERE component='backend_schema';
RESET ROLE;
