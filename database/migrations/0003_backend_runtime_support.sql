SET LOCAL ROLE tracepbl_owner;

ALTER TABLE ops.jobs
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS wait_state text,
  ADD COLUMN IF NOT EXISTS progress_current integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_total integer;

ALTER TABLE ops.jobs
  ADD CONSTRAINT jobs_lease_shape CHECK (
    (status = 'running' AND wait_state IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status = 'running' AND wait_state = 'teacher' AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (status <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL AND wait_state IS NULL)
  ),
  ADD CONSTRAINT jobs_wait_state CHECK (wait_state IS NULL OR wait_state = 'teacher'),
  ADD CONSTRAINT jobs_progress_current CHECK (progress_current >= 0),
  ADD CONSTRAINT jobs_progress_total CHECK (progress_total IS NULL OR (progress_total >= 0 AND progress_current <= progress_total));

DROP INDEX IF EXISTS ops.jobs_claim_idx;
CREATE INDEX jobs_claim_idx ON ops.jobs(priority DESC, available_at, id)
  WHERE status = 'queued';
CREATE INDEX jobs_expired_lease_idx ON ops.jobs(lease_expires_at, priority DESC, id)
  WHERE status = 'running' AND wait_state IS NULL;

CREATE TABLE ops.job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL,
  job_id uuid,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  event_type text NOT NULL CHECK (event_type IN (
    'operation.queued','operation.running','operation.progress','operation.paused',
    'operation.succeeded','operation.failed','operation.cancelled','operation.stale',
    'task.deleted','stream.reset'
  )),
  payload jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, task_id) REFERENCES core.tasks(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, task_id, job_id) REFERENCES ops.jobs(workspace_id, task_id, id) ON DELETE CASCADE
);
CREATE INDEX job_events_replay_idx ON ops.job_events(workspace_id, task_id, id);
CREATE INDEX job_events_retention_idx ON ops.job_events(occurred_at);

CREATE TABLE ops.usage_ledger (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL,
  job_id uuid NOT NULL,
  usage_day date NOT NULL,
  usage_kind text NOT NULL CHECK (usage_kind IN ('generation','embedding')),
  status text NOT NULL CHECK (status IN ('reserved','settled','released')),
  reserved_calls integer NOT NULL DEFAULT 0 CHECK (reserved_calls >= 0),
  reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  reserved_cny_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_cny_micros >= 0),
  actual_calls integer CHECK (actual_calls IS NULL OR actual_calls >= 0),
  actual_tokens integer CHECK (actual_tokens IS NULL OR actual_tokens >= 0),
  actual_cny_micros bigint CHECK (actual_cny_micros IS NULL OR actual_cny_micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, job_id, usage_kind),
  FOREIGN KEY (workspace_id, task_id, job_id) REFERENCES ops.jobs(workspace_id, task_id, id) ON DELETE CASCADE,
  CHECK ((status = 'reserved' AND actual_calls IS NULL AND actual_tokens IS NULL AND actual_cny_micros IS NULL)
    OR (status IN ('settled','released') AND actual_calls IS NOT NULL AND actual_tokens IS NOT NULL AND actual_cny_micros IS NOT NULL))
);
CREATE INDEX usage_ledger_daily_idx ON ops.usage_ledger(workspace_id, usage_day, usage_kind, status);

ALTER TABLE rag.model_runs
  ADD COLUMN IF NOT EXISTS output_task_revision_id uuid,
  ADD COLUMN IF NOT EXISTS actual_model text,
  ADD COLUMN IF NOT EXISTS price_profile_version text,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE rag.model_runs
  ADD CONSTRAINT model_runs_output_revision_fk FOREIGN KEY (workspace_id, task_id, output_task_revision_id)
    REFERENCES core.task_revisions(workspace_id, task_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT model_runs_actual_model CHECK (actual_model IS NULL OR actual_model = 'GLM-5.3-Flash'),
  ADD CONSTRAINT model_runs_currency CHECK (currency IS NULL OR currency = 'CNY');

CREATE TABLE ops.runtime_components (
  component text PRIMARY KEY,
  version text NOT NULL,
  initialized_at timestamptz NOT NULL DEFAULT now(),
  CHECK (component IN ('backend_schema','langgraph_checkpointer'))
);
INSERT INTO ops.runtime_components(component, version) VALUES ('backend_schema', '0003')
ON CONFLICT (component) DO UPDATE SET version = excluded.version, initialized_at = now();

INSERT INTO rag.embedding_profiles(provider,model,dimensions,distance,chunker_version,active)
VALUES ('zhipu','embedding-3',1024,'cosine','chunk-v1',true)
ON CONFLICT(provider,model,dimensions,distance,chunker_version) DO UPDATE SET active=true;

CREATE OR REPLACE FUNCTION core.current_task_snapshot(p_workspace_id uuid,p_task_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,core AS $$
  SELECT jsonb_build_object(
    'schemaVersion',1,'title',t.title,
    'context',(SELECT jsonb_build_object('stage',c.stage,'grade',c.grade,'textbook',c.textbook,'lesson',c.lesson,'lessonTypes',c.lesson_types,'minutes',c.minutes,'inquiryDirection',c.inquiry_direction,'priorKnowledge',c.prior_knowledge,'learningNeeds',c.learning_needs,'profileNote',c.profile_note) FROM core.task_contexts c WHERE c.workspace_id=t.workspace_id AND c.task_id=t.id),
    'questionSet',(SELECT jsonb_build_object('centralQuestion',q.question_text,'subQuestions',COALESCE((SELECT jsonb_agg(s.question_text ORDER BY s.ordinal) FROM core.inquiry_questions s WHERE s.workspace_id=q.workspace_id AND s.task_id=q.task_id AND s.kind='sub'),'[]'::jsonb),'inputType',q.input_type,'evidenceOutcome',q.evidence_outcome,'scopeBoundary',q.scope_boundary,'confirmed',q.confirmed_at IS NOT NULL) FROM core.inquiry_questions q WHERE q.workspace_id=t.workspace_id AND q.task_id=t.id AND q.kind='central'),
    'sourceSelection',jsonb_build_object('sourceVersionIds',COALESCE((SELECT jsonb_agg(ts.source_version_id ORDER BY ts.selection_order) FROM core.task_sources ts WHERE ts.workspace_id=t.workspace_id AND ts.task_id=t.id),'[]'::jsonb)),
    'evidenceMap',jsonb_build_object('claims',COALESCE((SELECT jsonb_agg(jsonb_build_object('text',ec.claim_text,'gapAccepted',ec.gap_accepted,'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceVersionId',er.source_version_id,'kind',er.relation_kind,'reason',er.reason,'citations',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceVersionId',ci.source_version_id,'chunkId',ci.chunk_id,'quotedText',ci.quoted_text) ORDER BY ci.ordinal) FROM core.evidence_citations ci WHERE ci.workspace_id=er.workspace_id AND ci.task_id=er.task_id AND ci.relation_id=er.id),'[]'::jsonb)) ORDER BY er.created_at,er.id) FROM core.evidence_relations er WHERE er.workspace_id=ec.workspace_id AND er.task_id=ec.task_id AND er.claim_id=ec.id),'[]'::jsonb)) ORDER BY ec.ordinal) FROM core.evidence_claims ec WHERE ec.workspace_id=t.workspace_id AND ec.task_id=t.id),'[]'::jsonb)),
    'lessonDesign',jsonb_build_object('activities',COALESCE((SELECT jsonb_agg(jsonb_build_object('title',la.title,'activityMinutes',la.activity_minutes,'transitionMinutes',la.transition_minutes,'studentAction',la.student_action,'evidenceProduct',la.evidence_product,'difficulty',la.difficulty,'scaffold',la.scaffold,'sourceVersionIds',COALESCE((SELECT jsonb_agg(a.source_version_id ORDER BY a.source_version_id) FROM core.activity_sources a WHERE a.workspace_id=la.workspace_id AND a.task_id=la.task_id AND a.activity_id=la.id),'[]'::jsonb)) ORDER BY la.ordinal) FROM core.learning_activities la WHERE la.workspace_id=t.workspace_id AND la.task_id=t.id),'[]'::jsonb)),
    'rubric',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object('title',ri.title,'activityOrdinals',COALESCE((SELECT jsonb_agg(la.ordinal ORDER BY la.ordinal) FROM core.rubric_activities ra JOIN core.learning_activities la ON la.workspace_id=ra.workspace_id AND la.task_id=ra.task_id AND la.id=ra.activity_id WHERE ra.workspace_id=ri.workspace_id AND ra.task_id=ri.task_id AND ra.rubric_item_id=ri.id),'[]'::jsonb),'levels',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',rl.level_key,'label',rl.label,'description',rl.description) ORDER BY rl.ordinal) FROM core.rubric_levels rl WHERE rl.rubric_item_id=ri.id),'[]'::jsonb)) ORDER BY ri.ordinal) FROM core.rubric_items ri WHERE ri.workspace_id=t.workspace_id AND ri.task_id=t.id),'[]'::jsonb))
  ) FROM core.tasks t WHERE t.workspace_id=p_workspace_id AND t.id=p_task_id;
$$;

CREATE OR REPLACE FUNCTION ops.enqueue_job(
  p_workspace_id uuid, p_task_id uuid, p_model_run_id uuid, p_job_kind text,
  p_idempotency_key text, p_payload jsonb DEFAULT '{}', p_priority integer DEFAULT 0,
  p_max_attempts integer DEFAULT 3
) RETURNS ops.jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, rag, ops AS $$
DECLARE created ops.jobs;
BEGIN
  IF p_task_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM core.tasks WHERE workspace_id = p_workspace_id AND id = p_task_id AND deleted_at IS NULL
  ) THEN RETURN NULL; END IF;
  INSERT INTO ops.jobs(workspace_id, task_id, model_run_id, job_kind, idempotency_key, payload, priority, max_attempts)
  VALUES (p_workspace_id, p_task_id, p_model_run_id, p_job_kind, p_idempotency_key, p_payload, p_priority, p_max_attempts)
  RETURNING * INTO created;
  INSERT INTO ops.job_events(workspace_id, task_id, job_id, event_type, payload)
  VALUES (p_workspace_id, p_task_id, created.id, 'operation.queued', jsonb_build_object('operationId', created.id, 'kind', CASE created.job_kind WHEN 'source_check' THEN 'sourceCheck' ELSE created.job_kind END, 'attempt', 0, 'canCancel', true));
  RETURN created;
END $$;

CREATE OR REPLACE FUNCTION ops.request_job_cancellation(p_workspace_id uuid, p_task_id uuid, p_job_id uuid)
RETURNS ops.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, ops AS $$
DECLARE changed ops.jobs;
BEGIN
  SELECT * INTO changed FROM ops.jobs WHERE workspace_id=p_workspace_id AND task_id=p_task_id AND id=p_job_id FOR UPDATE;
  IF changed.id IS NULL OR changed.status IN ('succeeded','failed','cancelled','stale') THEN RETURN changed; END IF;
  IF changed.status='queued' OR changed.wait_state='teacher' THEN
    UPDATE ops.jobs SET status='cancelled',wait_state=NULL,lease_token=NULL,lease_expires_at=NULL,locked_by=NULL,updated_at=now() WHERE id=p_job_id RETURNING * INTO changed;
    INSERT INTO ops.job_events(workspace_id, task_id, job_id, event_type, payload)
    VALUES (p_workspace_id, p_task_id, p_job_id, 'operation.cancelled', jsonb_build_object('operationId', p_job_id, 'kind', CASE changed.job_kind WHEN 'source_check' THEN 'sourceCheck' ELSE changed.job_kind END, 'attempt', changed.attempts, 'canCancel', false));
  ELSE
    UPDATE ops.jobs SET cancel_requested_at=COALESCE(cancel_requested_at,now()),updated_at=now() WHERE id=p_job_id RETURNING * INTO changed;
  END IF;
  RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION ops.schedule_task_purge(p_workspace_id uuid, p_task_id uuid, p_idempotency_key text)
RETURNS ops.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, ops AS $$
DECLARE created ops.jobs; deadline timestamptz;
BEGIN
  SELECT purge_after INTO deadline FROM core.tasks
    WHERE workspace_id=p_workspace_id AND id=p_task_id AND deleted_at IS NOT NULL FOR UPDATE;
  IF deadline IS NULL THEN RETURN NULL; END IF;
  INSERT INTO ops.jobs(workspace_id,task_id,job_kind,status,available_at,idempotency_key,payload)
  VALUES (p_workspace_id,p_task_id,'purge','queued',deadline,p_idempotency_key,'{}') RETURNING * INTO created;
  INSERT INTO ops.job_events(workspace_id,task_id,job_id,event_type,payload)
  VALUES (p_workspace_id,p_task_id,created.id,'task.deleted',jsonb_build_object('operationId',created.id,'kind','purge','canCancel',false));
  RETURN created;
END $$;

CREATE OR REPLACE FUNCTION ops.enqueue_model_job(
  p_workspace_id uuid, p_task_id uuid, p_input_lock_version bigint, p_purpose text,
  p_prompt_template_version text, p_input_fingerprint text, p_idempotency_key text,
  p_payload jsonb, p_price_profile_version text, p_reserved_cny_micros bigint
) RETURNS TABLE(job_id uuid, model_run_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, rag, ops AS $$
DECLARE input_revision uuid; created_run uuid; created_job uuid; used_calls bigint; used_tokens bigint; used_cny bigint; usage_date date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.tasks WHERE workspace_id=p_workspace_id AND id=p_task_id AND deleted_at IS NULL AND lock_version=p_input_lock_version FOR UPDATE) THEN
    IF EXISTS (SELECT 1 FROM core.tasks WHERE workspace_id=p_workspace_id AND id=p_task_id AND deleted_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='VERSION_CONFLICT'; END IF;
    RETURN;
  END IF;
  SELECT id INTO input_revision FROM core.task_revisions WHERE workspace_id=p_workspace_id AND task_id=p_task_id ORDER BY revision_no DESC LIMIT 1;
  IF input_revision IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVALID_STATE'; END IF;
  usage_date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || usage_date::text,0));
  SELECT COALESCE(sum(CASE WHEN status='reserved' THEN reserved_calls WHEN status='settled' THEN actual_calls ELSE 0 END),0),
         COALESCE(sum(CASE WHEN status='reserved' THEN reserved_tokens WHEN status='settled' THEN actual_tokens ELSE 0 END),0),
         COALESCE(sum(CASE WHEN status='reserved' THEN reserved_cny_micros WHEN status='settled' THEN actual_cny_micros ELSE 0 END),0)
    INTO used_calls,used_tokens,used_cny FROM ops.usage_ledger WHERE workspace_id=p_workspace_id AND usage_day=usage_date AND usage_kind='generation';
  IF used_calls+2>20 OR used_tokens+28000>200000 OR used_cny+p_reserved_cny_micros>2000000 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  INSERT INTO rag.model_runs(workspace_id,task_id,task_revision_id,purpose,provider,model,prompt_template_version,input_fingerprint,status,external_thread_id,price_profile_version,currency)
    VALUES (p_workspace_id,p_task_id,input_revision,p_purpose,'zhipu','GLM-5.3-Flash',p_prompt_template_version,p_input_fingerprint,'queued',uuidv7()::text,p_price_profile_version,'CNY') RETURNING id INTO created_run;
  INSERT INTO ops.jobs(workspace_id,task_id,model_run_id,job_kind,idempotency_key,payload,max_attempts)
    VALUES (p_workspace_id,p_task_id,created_run,'model',p_idempotency_key,p_payload,2) RETURNING id INTO created_job;
  INSERT INTO ops.usage_ledger(workspace_id,task_id,job_id,usage_day,usage_kind,status,reserved_calls,reserved_tokens,reserved_cny_micros)
    VALUES (p_workspace_id,p_task_id,created_job,usage_date,'generation','reserved',2,28000,p_reserved_cny_micros);
  INSERT INTO ops.job_events(workspace_id,task_id,job_id,event_type,payload)
    VALUES (p_workspace_id,p_task_id,created_job,'operation.queued',jsonb_build_object('operationId',created_job,'kind','model','attempt',0,'canCancel',true));
  RETURN QUERY SELECT created_job,created_run;
END $$;

CREATE OR REPLACE FUNCTION ops.commit_generated_revision(
  p_job_id uuid, p_lease_token uuid, p_snapshot jsonb, p_content_hash text,
  p_actual_model text, p_input_tokens integer, p_output_tokens integer,
  p_total_tokens integer, p_actual_cny_micros bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, rag, ops AS $$
DECLARE current_job ops.jobs; expected_lock bigint; next_revision bigint; created_revision uuid;
BEGIN
  SELECT * INTO current_job FROM ops.jobs WHERE id=p_job_id AND status='running' AND lease_token=p_lease_token AND cancel_requested_at IS NULL FOR UPDATE;
  IF current_job.id IS NULL OR current_job.model_run_id IS NULL THEN RETURN NULL; END IF;
  expected_lock := (current_job.payload->>'baseLockVersion')::bigint;
  UPDATE core.tasks SET revision_seq=revision_seq+1,updated_at=now() WHERE workspace_id=current_job.workspace_id AND id=current_job.task_id AND deleted_at IS NULL AND lock_version=expected_lock RETURNING revision_seq INTO next_revision;
  IF next_revision IS NULL THEN RETURN NULL; END IF;
  IF p_actual_model<>'GLM-5.3-Flash' OR p_input_tokens<0 OR p_output_tokens<0 OR p_total_tokens<>p_input_tokens+p_output_tokens THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PROVIDER_OUTPUT_INVALID'; END IF;
  UPDATE ops.usage_ledger SET status='settled',actual_calls=1,actual_tokens=p_total_tokens,actual_cny_micros=p_actual_cny_micros,updated_at=now()
    WHERE workspace_id=current_job.workspace_id AND task_id=current_job.task_id AND job_id=current_job.id AND usage_kind='generation' AND status='reserved'
      AND p_total_tokens<=reserved_tokens AND p_actual_cny_micros<=reserved_cny_micros;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  INSERT INTO core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by)
    VALUES (current_job.workspace_id,current_job.task_id,next_revision,'generated',1,expected_lock,p_snapshot,p_content_hash,'worker') RETURNING id INTO created_revision;
  UPDATE rag.model_runs SET status='succeeded',output_task_revision_id=created_revision,actual_model=p_actual_model,input_tokens=p_input_tokens,output_tokens=p_output_tokens,total_tokens=p_total_tokens,estimated_cost=p_actual_cny_micros::numeric/1000000,completed_at=now()
    WHERE workspace_id=current_job.workspace_id AND task_id=current_job.task_id AND id=current_job.model_run_id AND status='running';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVALID_STATE'; END IF;
  RETURN created_revision;
END $$;

CREATE OR REPLACE FUNCTION ops.restore_task(p_workspace_id uuid,p_task_id uuid,p_expected_lock_version bigint)
RETURNS core.tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,core,ops AS $$
DECLARE restored core.tasks; purge_job ops.jobs;
BEGIN
  SELECT * INTO restored FROM core.tasks WHERE workspace_id=p_workspace_id AND id=p_task_id AND deleted_at IS NOT NULL FOR UPDATE;
  IF restored.id IS NULL THEN RETURN NULL; END IF;
  IF restored.lock_version<>p_expected_lock_version THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='VERSION_CONFLICT'; END IF;
  SELECT * INTO purge_job FROM ops.jobs WHERE workspace_id=p_workspace_id AND task_id=p_task_id AND job_kind='purge' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF restored.purge_after<=now() OR purge_job.status='running' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PURGE_ALREADY_STARTED'; END IF;
  IF purge_job.status='queued' THEN UPDATE ops.jobs SET status='cancelled',updated_at=now() WHERE id=purge_job.id; END IF;
  UPDATE core.tasks SET deleted_at=NULL,purge_after=NULL,lock_version=lock_version+1,updated_at=now() WHERE id=p_task_id RETURNING * INTO restored;
  INSERT INTO ops.audit_events(workspace_id,task_id,actor_kind,action,entity_kind,entity_id,metadata) VALUES (p_workspace_id,p_task_id,'teacher','task.restored','task',p_task_id,'{}');
  RETURN restored;
END $$;

CREATE OR REPLACE FUNCTION ops.purge_task(p_job_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,core,rag,ops AS $$
DECLARE target ops.jobs; removed bigint;
BEGIN
  SELECT * INTO target FROM ops.jobs WHERE id=p_job_id AND job_kind='purge' AND status='running' AND lease_token=p_lease_token FOR UPDATE;
  IF target.id IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM core.tasks WHERE workspace_id=target.workspace_id AND id=target.task_id AND deleted_at IS NOT NULL AND purge_after<=now() FOR UPDATE) THEN RETURN false; END IF;
  DELETE FROM core.teacher_decisions WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.export_runs WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM ops.job_events WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM ops.usage_ledger WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM rag.retrieval_hits WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM ops.jobs WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM rag.model_runs WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.verification_findings WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.verification_runs WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.rubric_activities WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.rubric_items WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.activity_sources WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.learning_activities WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.evidence_citations WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.evidence_relations WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.evidence_claims WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.inquiry_questions WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.task_sources WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.task_revisions WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM ops.command_receipts WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM ops.audit_events WHERE workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.sources WHERE scope='task_private' AND workspace_id=target.workspace_id AND task_id=target.task_id;
  DELETE FROM core.tasks WHERE workspace_id=target.workspace_id AND id=target.task_id;
  GET DIAGNOSTICS removed=ROW_COUNT;
  IF removed=1 THEN INSERT INTO ops.audit_events(workspace_id,actor_kind,action,entity_kind,metadata) VALUES(target.workspace_id,'system','task.purged','purge',jsonb_build_object('checkpointDeletionCompleted',true)); END IF;
  RETURN removed=1;
END $$;

CREATE OR REPLACE FUNCTION ops.complete_export(p_job_id uuid,p_lease_token uuid,p_export_id uuid,p_expected_lock_version bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,core,ops AS $$
DECLARE target ops.jobs; source_revision core.task_revisions; next_revision bigint; exported_id uuid; snapshot_hash text;
BEGIN
  SELECT * INTO target FROM ops.jobs WHERE id=p_job_id AND job_kind='export' AND status='running' AND lease_token=p_lease_token AND cancel_requested_at IS NULL FOR UPDATE;
  IF target.id IS NULL THEN RETURN NULL; END IF;
  SELECT tr.* INTO source_revision FROM core.export_runs er JOIN core.task_revisions tr ON tr.workspace_id=er.workspace_id AND tr.task_id=er.task_id AND tr.id=er.task_revision_id WHERE er.workspace_id=target.workspace_id AND er.task_id=target.task_id AND er.id=p_export_id AND er.status='queued' AND tr.reason='final_approved' FOR UPDATE OF er;
  IF source_revision.id IS NULL THEN RETURN NULL; END IF;
  UPDATE core.tasks SET revision_seq=revision_seq+1,updated_at=now() WHERE workspace_id=target.workspace_id AND id=target.task_id AND deleted_at IS NULL AND workflow_state='approved' AND lock_version=p_expected_lock_version RETURNING revision_seq INTO next_revision;
  IF next_revision IS NULL THEN RETURN NULL; END IF;
  snapshot_hash:=encode(sha256(convert_to(source_revision.snapshot::text,'UTF8')),'hex');
  INSERT INTO core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by)
    VALUES(target.workspace_id,target.task_id,next_revision,'exported',source_revision.schema_version,p_expected_lock_version,source_revision.snapshot,snapshot_hash,'worker')
    ON CONFLICT(task_id,content_hash,reason) DO NOTHING RETURNING id INTO exported_id;
  IF exported_id IS NULL THEN SELECT id INTO exported_id FROM core.task_revisions WHERE task_id=target.task_id AND content_hash=snapshot_hash AND reason='exported'; END IF;
  UPDATE core.export_runs SET task_revision_id=exported_id,status='succeeded',started_at=coalesce(started_at,now()),completed_at=now() WHERE workspace_id=target.workspace_id AND task_id=target.task_id AND id=p_export_id AND status='queued';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN exported_id;
END $$;

CREATE OR REPLACE FUNCTION ops.lock_audit_commit(p_job_id uuid,p_lease_token uuid,p_run_id uuid,p_expected_lock_version bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,core,ops AS $$
DECLARE locked_job uuid;
BEGIN
  SELECT j.id INTO locked_job FROM ops.jobs j
    JOIN core.tasks t ON t.workspace_id=j.workspace_id AND t.id=j.task_id
    JOIN core.verification_runs vr ON vr.workspace_id=j.workspace_id AND vr.task_id=j.task_id AND vr.id=p_run_id
    WHERE j.id=p_job_id AND j.job_kind='audit' AND j.status='running' AND j.lease_token=p_lease_token
      AND j.cancel_requested_at IS NULL AND t.deleted_at IS NULL AND t.lock_version=p_expected_lock_version
      AND vr.status='running'
    FOR UPDATE OF j,t,vr;
  RETURN locked_job IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION ops.resume_model_job(p_workspace_id uuid,p_task_id uuid,p_generated_revision_id uuid,p_decision_id uuid)
RETURNS ops.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,core,rag,ops AS $$
DECLARE resumed ops.jobs;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM core.tasks WHERE workspace_id=p_workspace_id AND id=p_task_id AND deleted_at IS NULL) THEN RETURN NULL; END IF;
  UPDATE ops.jobs j SET status='queued',wait_state=NULL,available_at=now(),payload=j.payload||jsonb_build_object('decisionId',p_decision_id),updated_at=now()
    FROM rag.model_runs mr WHERE mr.workspace_id=p_workspace_id AND mr.task_id=p_task_id AND mr.output_task_revision_id=p_generated_revision_id AND j.workspace_id=mr.workspace_id AND j.task_id=mr.task_id AND j.model_run_id=mr.id AND j.status='running' AND j.wait_state='teacher' RETURNING j.* INTO resumed;
  IF resumed.id IS NOT NULL THEN INSERT INTO ops.job_events(workspace_id,task_id,job_id,event_type,payload) VALUES(p_workspace_id,p_task_id,resumed.id,'operation.queued',jsonb_build_object('operationId',resumed.id,'kind','model','attempt',resumed.attempts,'canCancel',true)); END IF;
  RETURN resumed;
END $$;

CREATE OR REPLACE FUNCTION ops.clone_private_source_version(p_workspace_id uuid,p_source_task_id uuid,p_target_task_id uuid,p_source_version_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,core,rag,ops AS $$
DECLARE old_source core.sources; old_version core.source_versions; new_source_id uuid; new_version_id uuid; old_chunk record; new_chunk_id bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM core.tasks WHERE workspace_id=p_workspace_id AND id=p_source_task_id AND deleted_at IS NULL) OR NOT EXISTS(SELECT 1 FROM core.tasks WHERE workspace_id=p_workspace_id AND id=p_target_task_id AND deleted_at IS NULL) THEN RETURN NULL; END IF;
  SELECT s.* INTO old_source FROM core.sources s JOIN core.source_versions sv ON sv.source_id=s.id WHERE s.scope='task_private' AND s.workspace_id=p_workspace_id AND s.task_id=p_source_task_id AND sv.id=p_source_version_id;
  SELECT * INTO old_version FROM core.source_versions WHERE id=p_source_version_id;
  IF old_source.id IS NULL OR old_version.id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO core.sources(scope,workspace_id,task_id,material_kind,title,canonical_url,data_class,retired_at) VALUES('task_private',p_workspace_id,p_target_task_id,old_source.material_kind,old_source.title,old_source.canonical_url,old_source.data_class,old_source.retired_at) RETURNING id INTO new_source_id;
  INSERT INTO core.source_versions(source_id,version_no,creator_or_institution,period_label,source_type,identifier,locator,accessed_at,language_code,content_text,context_note,meaning_note,interpretation_note,limitation_note,rights_state,rights_basis,verification_state,content_hash)
    VALUES(new_source_id,1,old_version.creator_or_institution,old_version.period_label,old_version.source_type,old_version.identifier,old_version.locator,old_version.accessed_at,old_version.language_code,old_version.content_text,old_version.context_note,old_version.meaning_note,old_version.interpretation_note,old_version.limitation_note,old_version.rights_state,old_version.rights_basis,old_version.verification_state,old_version.content_hash) RETURNING id INTO new_version_id;
  FOR old_chunk IN SELECT * FROM rag.source_chunks WHERE source_version_id=p_source_version_id ORDER BY ordinal LOOP
    INSERT INTO rag.source_chunks(source_version_id,ordinal,heading,content_text,char_start,char_end,locator,content_hash) VALUES(new_version_id,old_chunk.ordinal,old_chunk.heading,old_chunk.content_text,old_chunk.char_start,old_chunk.char_end,old_chunk.locator,old_chunk.content_hash) RETURNING id INTO new_chunk_id;
    INSERT INTO rag.chunk_embeddings(chunk_id,embedding_profile_id,embedding) SELECT new_chunk_id,embedding_profile_id,embedding FROM rag.chunk_embeddings WHERE chunk_id=old_chunk.id;
  END LOOP;
  RETURN new_version_id;
END $$;


REVOKE ALL ON ops.job_events, ops.usage_ledger, ops.runtime_components FROM PUBLIC;
GRANT SELECT ON ops.job_events, ops.runtime_components TO tracepbl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.job_events, ops.usage_ledger TO tracepbl_worker;
GRANT DELETE ON core.verification_findings TO tracepbl_worker;
REVOKE DELETE ON core.tasks FROM tracepbl_worker;
GRANT SELECT ON ops.usage_ledger TO tracepbl_app;
GRANT SELECT ON ops.job_events, ops.usage_ledger, ops.runtime_components TO tracepbl_backup;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ops TO tracepbl_app, tracepbl_worker;
REVOKE ALL ON FUNCTION ops.enqueue_job(uuid,uuid,uuid,text,text,jsonb,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.request_job_cancellation(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.schedule_task_purge(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.enqueue_model_job(uuid,uuid,bigint,text,text,text,text,jsonb,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.commit_generated_revision(uuid,uuid,jsonb,text,text,integer,integer,integer,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.restore_task(uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.purge_task(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.complete_export(uuid,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.lock_audit_commit(uuid,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.resume_model_job(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.clone_private_source_version(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.current_task_snapshot(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.enqueue_job(uuid,uuid,uuid,text,text,jsonb,integer,integer) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION ops.request_job_cancellation(uuid,uuid,uuid) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION ops.schedule_task_purge(uuid,uuid,text) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION ops.enqueue_model_job(uuid,uuid,bigint,text,text,text,text,jsonb,text,bigint) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION ops.commit_generated_revision(uuid,uuid,jsonb,text,text,integer,integer,integer,bigint) TO tracepbl_worker;
GRANT EXECUTE ON FUNCTION ops.restore_task(uuid,uuid,bigint) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION ops.purge_task(uuid,uuid) TO tracepbl_worker;
GRANT EXECUTE ON FUNCTION ops.complete_export(uuid,uuid,uuid,bigint) TO tracepbl_worker;
GRANT EXECUTE ON FUNCTION ops.lock_audit_commit(uuid,uuid,uuid,bigint) TO tracepbl_worker;
GRANT EXECUTE ON FUNCTION ops.resume_model_job(uuid,uuid,uuid,uuid) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION ops.clone_private_source_version(uuid,uuid,uuid,uuid) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION core.current_task_snapshot(uuid,uuid) TO tracepbl_app,tracepbl_worker,tracepbl_backup;

RESET ROLE;
