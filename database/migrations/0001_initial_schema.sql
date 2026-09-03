DO $$ BEGIN CREATE ROLE tracepbl_owner NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE tracepbl_migrator NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE tracepbl_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE tracepbl_worker NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE tracepbl_backup NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT tracepbl_owner, tracepbl_migrator, tracepbl_app, tracepbl_worker, tracepbl_backup TO CURRENT_USER;
GRANT tracepbl_owner TO tracepbl_migrator;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS core AUTHORIZATION tracepbl_owner;
CREATE SCHEMA IF NOT EXISTS rag AUTHORIZATION tracepbl_owner;
CREATE SCHEMA IF NOT EXISTS ops AUTHORIZATION tracepbl_owner;
CREATE SCHEMA IF NOT EXISTS agent AUTHORIZATION tracepbl_owner;

SET LOCAL ROLE tracepbl_owner;

CREATE TABLE core.workspaces (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  mode text NOT NULL DEFAULT 'local_single_user' CHECK (mode = 'local_single_user'),
  display_name text NOT NULL DEFAULT '本地工作区' CHECK (length(display_name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.tasks (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120), workflow_state text NOT NULL DEFAULT 'draft' CHECK (workflow_state IN ('draft','designing','review_ready','approved')),
  lock_version bigint NOT NULL DEFAULT 0 CHECK (lock_version >= 0), revision_seq bigint NOT NULL DEFAULT 0 CHECK (revision_seq >= 0),
  last_activity_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, purge_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id), CHECK ((deleted_at IS NULL AND purge_after IS NULL) OR (deleted_at IS NOT NULL AND purge_after = deleted_at + interval '24 hours'))
);
CREATE INDEX tasks_active_idx ON core.tasks (workspace_id,updated_at DESC,id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_purge_idx ON core.tasks (purge_after) WHERE purge_after IS NOT NULL;

CREATE TABLE core.task_contexts (
  task_id uuid PRIMARY KEY, workspace_id uuid NOT NULL, stage text NOT NULL CHECK (stage IN ('junior','senior')),
  grade text NOT NULL CHECK ((stage='junior' AND grade IN ('七年级','八年级','九年级')) OR (stage='senior' AND grade IN ('高一','高二','高三'))),
  textbook text NOT NULL CHECK (length(textbook) BETWEEN 1 AND 160), lesson text NOT NULL CHECK (length(lesson) BETWEEN 1 AND 160),
  lesson_types text[] NOT NULL DEFAULT '{}', minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 180), inquiry_direction text CHECK (length(inquiry_direction)<=500),
  prior_knowledge text, learning_needs text[] NOT NULL DEFAULT '{}', profile_note text CHECK (length(profile_note)<=2000), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE core.inquiry_questions (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, parent_id uuid,
  kind text NOT NULL CHECK (kind IN ('central','sub')), ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 3),
  question_text text NOT NULL CHECK (length(question_text) BETWEEN 1 AND 1000), input_type text, evidence_outcome text, scope_boundary text,
  confirmed_at timestamptz, review_state text NOT NULL DEFAULT 'ready' CHECK (review_state IN ('ready','needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,task_id,id), UNIQUE (task_id,kind,ordinal),
  FOREIGN KEY (workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,task_id,parent_id) REFERENCES core.inquiry_questions(workspace_id,task_id,id) ON DELETE RESTRICT,
  CHECK ((kind='central' AND parent_id IS NULL AND ordinal=0) OR (kind='sub' AND parent_id IS NOT NULL AND ordinal BETWEEN 1 AND 3))
);

CREATE TABLE core.sources (
  id uuid PRIMARY KEY DEFAULT uuidv7(), scope text NOT NULL CHECK (scope IN ('catalog','task_private')), workspace_id uuid, task_id uuid,
  material_kind text NOT NULL CHECK (material_kind IN ('catalog','url','text')), title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  canonical_url text, data_class text NOT NULL CHECK (data_class IN ('synthetic','public_licensed','public_unknown')), retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (workspace_id,task_id,id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE,
  CHECK ((scope='catalog' AND workspace_id IS NULL AND task_id IS NULL AND material_kind='catalog') OR (scope='task_private' AND workspace_id IS NOT NULL AND task_id IS NOT NULL AND material_kind IN ('url','text'))),
  CHECK (material_kind <> 'url' OR canonical_url IS NOT NULL)
);
CREATE UNIQUE INDEX sources_private_url_idx ON core.sources (workspace_id,task_id,canonical_url) WHERE scope='task_private' AND canonical_url IS NOT NULL;

CREATE TABLE core.source_versions (
  id uuid PRIMARY KEY DEFAULT uuidv7(), source_id uuid NOT NULL REFERENCES core.sources(id) ON DELETE CASCADE, version_no bigint NOT NULL CHECK (version_no>0),
  creator_or_institution text NOT NULL, period_label text, source_type text NOT NULL, identifier text, locator text NOT NULL,
  accessed_at timestamptz, language_code text NOT NULL DEFAULT 'zh-CN', content_text text, context_note text, meaning_note text, interpretation_note text, limitation_note text,
  rights_state text NOT NULL CHECK (rights_state IN ('verified_reusable','restricted_metadata_only','unknown','not_allowed')), rights_basis text NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('candidate','pending','verified','conditional','excluded')),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id,version_no), UNIQUE (source_id,content_hash), UNIQUE (id,source_id),
  CHECK (NOT (rights_state='not_allowed' AND verification_state='verified')),
  CHECK (rights_state NOT IN ('restricted_metadata_only','not_allowed') OR content_text IS NULL)
);

CREATE TABLE core.task_sources (
  workspace_id uuid NOT NULL, task_id uuid NOT NULL, source_version_id uuid NOT NULL, selection_order integer NOT NULL CHECK (selection_order>=0),
  selected_by text NOT NULL DEFAULT 'teacher' CHECK (selected_by='teacher'), selected_at timestamptz NOT NULL DEFAULT now(), review_state text NOT NULL DEFAULT 'ready' CHECK (review_state IN ('ready','needs_review')),
  PRIMARY KEY (task_id,source_version_id), UNIQUE (workspace_id,task_id,source_version_id), UNIQUE (task_id,selection_order),
  FOREIGN KEY (workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (source_version_id) REFERENCES core.source_versions(id) ON DELETE RESTRICT
);

CREATE FUNCTION core.enforce_task_source_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_scope text; source_workspace uuid; source_task uuid;
BEGIN
  SELECT s.scope,s.workspace_id,s.task_id INTO source_scope,source_workspace,source_task FROM core.source_versions sv JOIN core.sources s ON s.id=sv.source_id WHERE sv.id=NEW.source_version_id;
  IF source_scope='task_private' AND (source_workspace IS DISTINCT FROM NEW.workspace_id OR source_task IS DISTINCT FROM NEW.task_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='task_sources_scope_guard', MESSAGE='task-private source belongs to another task';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER task_sources_scope_guard AFTER INSERT OR UPDATE ON core.task_sources DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION core.enforce_task_source_scope();

CREATE FUNCTION core.prevent_source_scope_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.scope,OLD.workspace_id,OLD.task_id,OLD.material_kind) IS DISTINCT FROM (NEW.scope,NEW.workspace_id,NEW.task_id,NEW.material_kind) THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='sources_scope_immutable', MESSAGE='source scope is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sources_scope_immutable BEFORE UPDATE ON core.sources FOR EACH ROW EXECUTE FUNCTION core.prevent_source_scope_change();

CREATE TABLE core.evidence_claims (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, question_id uuid, claim_text text NOT NULL CHECK (length(claim_text) BETWEEN 1 AND 2000),
  ordinal integer NOT NULL CHECK (ordinal>=0), gap_accepted boolean NOT NULL DEFAULT false, review_state text NOT NULL DEFAULT 'ready' CHECK (review_state IN ('ready','needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,task_id,id), UNIQUE(task_id,ordinal),
  FOREIGN KEY (workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,task_id,question_id) REFERENCES core.inquiry_questions(workspace_id,task_id,id) ON DELETE RESTRICT
);

CREATE TABLE core.evidence_relations (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, claim_id uuid NOT NULL, source_version_id uuid NOT NULL,
  relation_kind text NOT NULL CHECK (relation_kind IN ('background','supports','turning_point','consequence','challenges_or_limits')), reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  review_state text NOT NULL DEFAULT 'ready' CHECK (review_state IN ('ready','needs_review')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,task_id,id), UNIQUE(task_id,claim_id,source_version_id,relation_kind),
  FOREIGN KEY (workspace_id,task_id,claim_id) REFERENCES core.evidence_claims(workspace_id,task_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,task_id,source_version_id) REFERENCES core.task_sources(workspace_id,task_id,source_version_id) ON DELETE RESTRICT
);

CREATE TABLE core.learning_activities (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, ordinal integer NOT NULL CHECK (ordinal>=0), title text NOT NULL,
  activity_minutes integer NOT NULL CHECK (activity_minutes>=0), transition_minutes integer NOT NULL CHECK (transition_minutes>=0), student_action text NOT NULL,
  evidence_product text NOT NULL, difficulty text NOT NULL, scaffold text NOT NULL, teacher_edited boolean NOT NULL DEFAULT false,
  review_state text NOT NULL DEFAULT 'ready' CHECK (review_state IN ('ready','needs_review')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,task_id,id), UNIQUE(task_id,ordinal), FOREIGN KEY (workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE core.activity_sources (
  workspace_id uuid NOT NULL, task_id uuid NOT NULL, activity_id uuid NOT NULL, source_version_id uuid NOT NULL, PRIMARY KEY(activity_id,source_version_id),
  FOREIGN KEY (workspace_id,task_id,activity_id) REFERENCES core.learning_activities(workspace_id,task_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,task_id,source_version_id) REFERENCES core.task_sources(workspace_id,task_id,source_version_id) ON DELETE RESTRICT
);

CREATE TABLE core.rubric_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal>=0), title text NOT NULL,
  teacher_edited boolean NOT NULL DEFAULT false, review_state text NOT NULL DEFAULT 'ready' CHECK (review_state IN ('ready','needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,task_id,id), UNIQUE(task_id,ordinal),
  FOREIGN KEY (workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE core.rubric_levels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, rubric_item_id uuid NOT NULL REFERENCES core.rubric_items(id) ON DELETE CASCADE,
  level_key text NOT NULL CHECK(level_key IN ('support','expected','strong')), ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 2), label text NOT NULL, description text NOT NULL,
  UNIQUE(rubric_item_id,level_key), UNIQUE(rubric_item_id,ordinal)
);
CREATE INDEX rubric_levels_item_idx ON core.rubric_levels(rubric_item_id);
CREATE TABLE core.rubric_activities (
  workspace_id uuid NOT NULL, task_id uuid NOT NULL, rubric_item_id uuid NOT NULL, activity_id uuid NOT NULL, PRIMARY KEY(rubric_item_id,activity_id),
  FOREIGN KEY (workspace_id,task_id,rubric_item_id) REFERENCES core.rubric_items(workspace_id,task_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,task_id,activity_id) REFERENCES core.learning_activities(workspace_id,task_id,id) ON DELETE RESTRICT
);

CREATE TABLE core.verification_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, run_kind text NOT NULL CHECK(run_kind IN ('source_check','design_audit')),
  input_lock_version bigint NOT NULL CHECK(input_lock_version>=0), status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled','stale')),
  started_at timestamptz, completed_at timestamptz, reused_from_run_id uuid REFERENCES core.verification_runs(id) ON DELETE RESTRICT, summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,task_id,id), FOREIGN KEY(workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX verification_runs_latest_idx ON core.verification_runs(task_id,run_kind,created_at DESC);
CREATE TABLE core.verification_findings (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, run_id uuid NOT NULL,
  severity text NOT NULL CHECK(severity IN ('blocking','teacher_confirmation','suggestion','pass','unknown')), category text NOT NULL, subject_kind text NOT NULL, subject_id uuid,
  title text NOT NULL, basis text NOT NULL, impact text NOT NULL, recommendation text, resolution_state text NOT NULL DEFAULT 'pending' CHECK(resolution_state IN ('pending','accepted','resolved','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,task_id,id),
  FOREIGN KEY(workspace_id,task_id,run_id) REFERENCES core.verification_runs(workspace_id,task_id,id) ON DELETE CASCADE
);

CREATE TABLE core.task_revisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, revision_no bigint NOT NULL CHECK(revision_no>0),
  reason text NOT NULL CHECK(reason IN ('generated','teacher_confirmed','audit_completed','final_approved','exported')), schema_version integer NOT NULL CHECK(schema_version>0),
  base_lock_version bigint NOT NULL CHECK(base_lock_version>=0), snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL CHECK(created_by IN ('teacher','system','worker')), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,task_id,id), UNIQUE(task_id,revision_no), UNIQUE(task_id,content_hash,reason), FOREIGN KEY(workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE core.teacher_decisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, finding_id uuid, task_revision_id uuid,
  decision_kind text NOT NULL CHECK(decision_kind IN ('accept_risk','request_changes','approve','revoke')), reason text, decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,task_id,id),
  FOREIGN KEY(workspace_id,task_id,finding_id) REFERENCES core.verification_findings(workspace_id,task_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,task_id,task_revision_id) REFERENCES core.task_revisions(workspace_id,task_id,id) ON DELETE RESTRICT,
  CHECK ((finding_id IS NOT NULL AND task_revision_id IS NULL AND decision_kind IN ('accept_risk','request_changes')) OR (finding_id IS NULL AND task_revision_id IS NOT NULL AND decision_kind IN ('approve','revoke')))
);
CREATE TABLE core.export_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, task_revision_id uuid NOT NULL, format text NOT NULL CHECK(format IN ('docx','pdf')),
  file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 120), status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled','stale')),
  idempotency_key text NOT NULL, error_code text, started_at timestamptz, completed_at timestamptz, UNIQUE(workspace_id,task_id,id), UNIQUE(workspace_id,idempotency_key),
  FOREIGN KEY(workspace_id,task_id,task_revision_id) REFERENCES core.task_revisions(workspace_id,task_id,id) ON DELETE CASCADE
);
CREATE INDEX export_runs_latest_idx ON core.export_runs(task_id,started_at DESC);

CREATE TABLE rag.embedding_profiles (
  id uuid PRIMARY KEY DEFAULT uuidv7(), provider text NOT NULL CHECK(provider='zhipu'), model text NOT NULL CHECK(model='embedding-3'), dimensions integer NOT NULL CHECK(dimensions=1024),
  distance text NOT NULL CHECK(distance='cosine'), chunker_version text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,model,dimensions,distance,chunker_version)
);
CREATE TABLE rag.source_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source_version_id uuid NOT NULL REFERENCES core.source_versions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal>=0), heading text, content_text text NOT NULL CHECK(length(content_text)>0), char_start integer, char_end integer, locator jsonb NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_version_id,ordinal), UNIQUE(source_version_id,content_hash), UNIQUE(id,source_version_id),
  CHECK((char_start IS NULL AND char_end IS NULL) OR (char_start>=0 AND char_end>char_start))
);
CREATE FUNCTION rag.enforce_chunkable_source_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_rights text; source_content text;
BEGIN
  SELECT rights_state,content_text INTO source_rights,source_content FROM core.source_versions WHERE id=NEW.source_version_id;
  IF source_rights IN ('restricted_metadata_only','not_allowed') OR source_content IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='source_chunks_rights_guard', MESSAGE='source version is not eligible for chunking';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_chunks_rights_guard BEFORE INSERT OR UPDATE ON rag.source_chunks FOR EACH ROW EXECUTE FUNCTION rag.enforce_chunkable_source_version();
CREATE TABLE rag.chunk_embeddings (
  chunk_id bigint NOT NULL REFERENCES rag.source_chunks(id) ON DELETE CASCADE, embedding_profile_id uuid NOT NULL REFERENCES rag.embedding_profiles(id) ON DELETE RESTRICT,
  embedding vector(1024) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(chunk_id,embedding_profile_id)
);
CREATE TABLE rag.model_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, task_revision_id uuid, purpose text NOT NULL CHECK(purpose IN ('question_guidance','source_analysis','evidence_analysis','lesson','rubric','audit')),
  provider text NOT NULL, model text NOT NULL, prompt_template_version text NOT NULL, input_fingerprint text NOT NULL CHECK(input_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled','stale')), result_summary jsonb, input_tokens integer CHECK(input_tokens>=0), output_tokens integer CHECK(output_tokens>=0),
  total_tokens integer CHECK(total_tokens>=0), estimated_cost numeric(12,6) CHECK(estimated_cost>=0), error_code text, external_thread_id text,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,task_id,id),
  FOREIGN KEY(workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,task_id,task_revision_id) REFERENCES core.task_revisions(workspace_id,task_id,id) ON DELETE RESTRICT
);
CREATE TABLE rag.retrieval_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id uuid NOT NULL, task_id uuid NOT NULL, model_run_id uuid NOT NULL, source_version_id uuid NOT NULL, chunk_id bigint NOT NULL,
  rank integer NOT NULL CHECK(rank>0), cosine_distance double precision NOT NULL CHECK(cosine_distance BETWEEN 0 AND 2), keyword_score double precision,
  selected_for_context boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(model_run_id,rank), UNIQUE(model_run_id,chunk_id),
  FOREIGN KEY(workspace_id,task_id,model_run_id) REFERENCES rag.model_runs(workspace_id,task_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,task_id,source_version_id) REFERENCES core.task_sources(workspace_id,task_id,source_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(chunk_id,source_version_id) REFERENCES rag.source_chunks(id,source_version_id) ON DELETE CASCADE
);

CREATE TABLE core.evidence_citations (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid NOT NULL, relation_id uuid NOT NULL, source_version_id uuid NOT NULL, chunk_id bigint,
  locator_text text NOT NULL, quoted_text text, quote_hash text CHECK(quote_hash IS NULL OR quote_hash ~ '^[0-9a-f]{64}$'), ordinal integer NOT NULL CHECK(ordinal>=0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,task_id,id), UNIQUE(relation_id,ordinal),
  FOREIGN KEY(workspace_id,task_id,relation_id) REFERENCES core.evidence_relations(workspace_id,task_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,task_id,source_version_id) REFERENCES core.task_sources(workspace_id,task_id,source_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(chunk_id,source_version_id) REFERENCES rag.source_chunks(id,source_version_id) ON DELETE RESTRICT,
  CHECK((quoted_text IS NULL AND quote_hash IS NULL) OR (quoted_text IS NOT NULL AND quote_hash IS NOT NULL))
);

CREATE TABLE ops.jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL, task_id uuid, model_run_id uuid, job_kind text NOT NULL CHECK(job_kind IN ('source_check','embedding','model','audit','export','purge')),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled','stale')), priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10), available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz, locked_by text, idempotency_key text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', error_code text, error_summary text CHECK(length(error_summary)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,idempotency_key), UNIQUE(workspace_id,task_id,id),
  FOREIGN KEY(workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT, FOREIGN KEY(workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,task_id,model_run_id) REFERENCES rag.model_runs(workspace_id,task_id,id) ON DELETE CASCADE,
  CHECK((job_kind='purge' AND task_id IS NOT NULL) OR job_kind<>'purge')
);
CREATE INDEX jobs_claim_idx ON ops.jobs(status,available_at,priority DESC,id) WHERE status='queued';
CREATE TABLE ops.command_receipts (
  id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT, task_id uuid, idempotency_key text NOT NULL,
  operation text NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'), status text NOT NULL CHECK(status IN ('processing','succeeded','failed')),
  resource_kind text, resource_id uuid, response_summary jsonb, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,idempotency_key), FOREIGN KEY(workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE ops.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT, task_id uuid,
  actor_kind text NOT NULL CHECK(actor_kind IN ('teacher','api','worker','system')), action text NOT NULL, entity_kind text NOT NULL, entity_id uuid, correlation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(workspace_id,task_id) REFERENCES core.tasks(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX audit_events_task_idx ON ops.audit_events(workspace_id,task_id,occurred_at DESC);

CREATE FUNCTION ops.prevent_terminal_state_revival() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('succeeded','failed','cancelled','stale') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='terminal_state_immutable', MESSAGE='terminal operation state cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_runs_terminal_state BEFORE UPDATE OF status ON core.verification_runs FOR EACH ROW EXECUTE FUNCTION ops.prevent_terminal_state_revival();
CREATE TRIGGER export_runs_terminal_state BEFORE UPDATE OF status ON core.export_runs FOR EACH ROW EXECUTE FUNCTION ops.prevent_terminal_state_revival();
CREATE TRIGGER model_runs_terminal_state BEFORE UPDATE OF status ON rag.model_runs FOR EACH ROW EXECUTE FUNCTION ops.prevent_terminal_state_revival();
CREATE TRIGGER jobs_terminal_state BEFORE UPDATE OF status ON ops.jobs FOR EACH ROW EXECUTE FUNCTION ops.prevent_terminal_state_revival();

RESET ROLE;

REVOKE ALL ON SCHEMA core,rag,ops,agent FROM PUBLIC;
GRANT USAGE ON SCHEMA core,rag,ops TO tracepbl_app;
GRANT USAGE ON SCHEMA core,rag,ops,agent TO tracepbl_worker;
GRANT USAGE ON SCHEMA core,rag,ops,agent TO tracepbl_backup;

GRANT SELECT,INSERT,UPDATE ON core.tasks,core.task_contexts,core.inquiry_questions,core.evidence_claims,core.evidence_relations,core.evidence_citations,core.learning_activities,core.activity_sources,core.rubric_items,core.rubric_levels,core.rubric_activities,core.verification_runs,core.verification_findings,core.teacher_decisions,core.export_runs,core.task_sources,core.sources TO tracepbl_app;
GRANT DELETE ON core.task_contexts,core.inquiry_questions,core.evidence_claims,core.evidence_relations,core.evidence_citations,core.learning_activities,core.activity_sources,core.rubric_items,core.rubric_levels,core.rubric_activities,core.task_sources TO tracepbl_app;
GRANT SELECT ON core.workspaces,core.source_versions,core.task_revisions,rag.embedding_profiles,rag.source_chunks,rag.model_runs,rag.retrieval_hits,ops.jobs,ops.command_receipts,ops.audit_events TO tracepbl_app;
GRANT INSERT ON core.source_versions TO tracepbl_app;
REVOKE UPDATE,DELETE ON core.teacher_decisions,core.source_versions,core.task_revisions FROM tracepbl_app;
GRANT INSERT ON core.task_revisions,ops.command_receipts,ops.audit_events TO tracepbl_app;
GRANT INSERT,UPDATE ON ops.command_receipts TO tracepbl_app;

GRANT SELECT ON ALL TABLES IN SCHEMA core,rag,ops TO tracepbl_worker;
GRANT INSERT,UPDATE ON core.verification_runs,core.verification_findings,core.export_runs,rag.embedding_profiles,rag.source_chunks,rag.chunk_embeddings,rag.model_runs,rag.retrieval_hits,ops.jobs,ops.audit_events TO tracepbl_worker;
GRANT INSERT ON core.source_versions,core.task_revisions TO tracepbl_worker;
GRANT DELETE ON rag.source_chunks,rag.chunk_embeddings,rag.retrieval_hits,ops.jobs TO tracepbl_worker;
GRANT DELETE ON core.tasks TO tracepbl_worker;
REVOKE INSERT,UPDATE,DELETE ON core.teacher_decisions FROM tracepbl_worker;
REVOKE UPDATE,DELETE ON core.source_versions,core.task_revisions,rag.embedding_profiles FROM tracepbl_worker;

GRANT SELECT ON ALL TABLES IN SCHEMA core,rag,ops,agent TO tracepbl_backup;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA core,rag,ops TO tracepbl_app,tracepbl_worker;
