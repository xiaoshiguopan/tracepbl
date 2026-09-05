SET LOCAL ROLE tracepbl_owner;

CREATE TABLE ops.recovery_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  epoch uuid NOT NULL DEFAULT uuidv7(),
  initialized boolean NOT NULL DEFAULT false,
  reconciling boolean NOT NULL DEFAULT false,
  real_ai_not_before timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO ops.recovery_control DEFAULT VALUES;
CREATE TABLE ops.recovery_events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_digest text NOT NULL CHECK (task_digest ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('delete','restore')),
  purge_after_ms bigint,
  CHECK ((action='delete' AND purge_after_ms IS NOT NULL AND purge_after_ms>0)
    OR (action='restore' AND purge_after_ms IS NULL))
);
CREATE INDEX recovery_events_task_idx ON ops.recovery_events(task_digest,seq DESC);

CREATE FUNCTION ops.record_recovery_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ops AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(120012);
  IF (SELECT reconciling FROM ops.recovery_control WHERE singleton) THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.purge_after IS DISTINCT FROM OLD.purge_after THEN
    INSERT INTO ops.recovery_events(task_digest,action,purge_after_ms)
      VALUES(encode(sha256(convert_to(NEW.workspace_id::text||':'||NEW.id::text,'UTF8')),'hex'),
        CASE WHEN NEW.deleted_at IS NULL THEN 'restore' ELSE 'delete' END,
        CASE WHEN NEW.deleted_at IS NULL THEN NULL ELSE floor(extract(epoch FROM NEW.purge_after)*1000)::bigint END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tasks_recovery_event AFTER UPDATE OF deleted_at,purge_after ON core.tasks
  FOR EACH ROW EXECUTE FUNCTION ops.record_recovery_event();
INSERT INTO ops.recovery_events(task_digest,action,purge_after_ms)
  SELECT encode(sha256(convert_to(workspace_id::text||':'||id::text,'UTF8')),'hex'),'delete',floor(extract(epoch FROM purge_after)*1000)::bigint
  FROM core.tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at,id;
REVOKE ALL ON ops.recovery_control,ops.recovery_events FROM PUBLIC;
GRANT SELECT ON ops.recovery_control,ops.recovery_events TO tracepbl_app,tracepbl_worker,tracepbl_backup;
GRANT SELECT ON SEQUENCE ops.recovery_events_seq_seq TO tracepbl_backup;
REVOKE ALL ON FUNCTION ops.record_recovery_event() FROM PUBLIC;

ALTER TABLE ops.usage_ledger ADD COLUMN price_profile jsonb NOT NULL DEFAULT
  '{"mode":"fake","version":"synthetic-zero-cost.v1","currency":"CNY","generationInput":0,"generationOutput":0,"embedding":0}',
  ADD COLUMN external_started boolean NOT NULL DEFAULT false;

CREATE FUNCTION ops.valid_price_profile(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT coalesce(jsonb_typeof(p)='object' AND p->>'mode' IN ('fake','real') AND p->>'currency'='CNY'
    AND length(p->>'version') BETWEEN 1 AND 100
    AND jsonb_typeof(p->'generationInput')='number' AND jsonb_typeof(p->'generationOutput')='number' AND jsonb_typeof(p->'embedding')='number'
    AND (p->>'generationInput')::numeric BETWEEN 0 AND 100000
    AND (p->>'generationOutput')::numeric BETWEEN 0 AND 100000
    AND (p->>'embedding')::numeric BETWEEN 0 AND 100000
    AND ((p->>'mode'='fake' AND (p->>'generationInput')::numeric=0 AND (p->>'generationOutput')::numeric=0 AND (p->>'embedding')::numeric=0)
      OR (p->>'mode'='real' AND (p->>'generationInput')::numeric>0 AND (p->>'generationOutput')::numeric>0 AND (p->>'embedding')::numeric>0)),false)
$$;
ALTER TABLE ops.usage_ledger ADD CONSTRAINT usage_price_valid CHECK (ops.valid_price_profile(price_profile));

CREATE FUNCTION ops.assert_daily_usage(p_workspace uuid,p_day date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ops AS $$
DECLARE spent numeric; generation_calls bigint; generation_tokens bigint; embedding_tokens bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace::text||p_day::text,0));
  SELECT coalesce(sum(CASE WHEN status='reserved' THEN reserved_cny_micros WHEN status='settled' THEN actual_cny_micros ELSE 0 END),0),
    coalesce(sum(CASE WHEN usage_kind='generation' THEN CASE WHEN status='reserved' THEN reserved_calls WHEN status='settled' THEN actual_calls ELSE 0 END ELSE 0 END),0),
    coalesce(sum(CASE WHEN usage_kind='generation' THEN CASE WHEN status='reserved' THEN reserved_tokens WHEN status='settled' THEN actual_tokens ELSE 0 END ELSE 0 END),0),
    coalesce(sum(CASE WHEN usage_kind='embedding' THEN CASE WHEN status='reserved' THEN reserved_tokens WHEN status='settled' THEN actual_tokens ELSE 0 END ELSE 0 END),0)
    INTO spent,generation_calls,generation_tokens,embedding_tokens FROM ops.usage_ledger WHERE workspace_id=p_workspace AND usage_day=p_day;
  IF spent>2000000 OR generation_calls>20 OR generation_tokens>200000 OR embedding_tokens>200000 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED';
  END IF;
END $$;

ALTER FUNCTION ops.enqueue_model_job(uuid,uuid,bigint,text,text,text,text,jsonb,text,bigint) RENAME TO enqueue_model_job_0003;
REVOKE ALL ON FUNCTION ops.enqueue_model_job_0003(uuid,uuid,bigint,text,text,text,text,jsonb,text,bigint) FROM PUBLIC,tracepbl_app,tracepbl_worker;
CREATE FUNCTION ops.enqueue_model_job(p_workspace_id uuid,p_task_id uuid,p_input_lock_version bigint,p_purpose text,
  p_prompt_template_version text,p_input_fingerprint text,p_idempotency_key text,p_payload jsonb,p_price_profile_version text,
  p_reserved_cny_micros bigint,p_profile jsonb DEFAULT NULL)
RETURNS TABLE(job_id uuid,model_run_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ops AS $$
DECLARE profile jsonb; reserved bigint; created record; day date;
BEGIN
  profile:=coalesce(p_profile,jsonb_build_object('mode','fake','version',p_price_profile_version,'currency','CNY','generationInput',0,'generationOutput',0,'embedding',0));
  IF NOT ops.valid_price_profile(profile) OR profile->>'version'<>p_price_profile_version THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRICE_PROFILE_INVALID'; END IF;
  IF profile->>'mode'='real' AND (SELECT real_ai_not_before>now() FROM ops.recovery_control WHERE singleton) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  reserved:=ceil(48000*(profile->>'generationInput')::numeric+8000*(profile->>'generationOutput')::numeric)::bigint;
  IF reserved<>p_reserved_cny_micros THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRICE_PROFILE_INVALID'; END IF;
  SELECT * INTO created FROM ops.enqueue_model_job_0003(p_workspace_id,p_task_id,p_input_lock_version,p_purpose,p_prompt_template_version,p_input_fingerprint,p_idempotency_key,p_payload,p_price_profile_version,reserved);
  IF created.job_id IS NULL THEN RETURN; END IF;
  UPDATE ops.usage_ledger AS usage SET price_profile=profile,reserved_tokens=CASE WHEN profile->>'mode'='real' THEN 56000 ELSE usage.reserved_tokens END
    WHERE usage.workspace_id=p_workspace_id AND usage.job_id=created.job_id AND usage.usage_kind='generation' RETURNING usage.usage_day INTO day;
  PERFORM ops.assert_daily_usage(p_workspace_id,day);
  RETURN QUERY SELECT created.job_id,created.model_run_id;
END $$;

CREATE FUNCTION ops.reserve_embedding(p_job uuid,p_lease uuid,p_tokens integer,p_calls integer,p_profile jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ops AS $$
DECLARE job ops.jobs; day date; prior ops.usage_ledger; frozen jsonb; amount bigint;
BEGIN
  SELECT * INTO job FROM ops.jobs WHERE id=p_job AND status='running' AND lease_token=p_lease AND lease_expires_at>now() AND cancel_requested_at IS NULL FOR UPDATE;
  IF job.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='LEASE_LOST'; END IF;
  IF p_tokens<1 OR p_tokens>200000 OR p_calls<1 OR NOT ops.valid_price_profile(p_profile) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRICE_PROFILE_INVALID'; END IF;
  IF p_profile->>'mode'='real' AND (SELECT real_ai_not_before>now() FROM ops.recovery_control WHERE singleton) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  SELECT price_profile INTO frozen FROM ops.usage_ledger WHERE job_id=p_job AND usage_kind='generation';
  IF frozen IS NOT NULL AND (frozen->>'mode'<>'fake' OR p_profile->>'mode'<>'fake') AND frozen<>p_profile THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRICE_PROFILE_INVALID'; END IF;
  day:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
  PERFORM pg_advisory_xact_lock(hashtextextended(job.workspace_id::text||day::text,0));
  SELECT * INTO prior FROM ops.usage_ledger WHERE workspace_id=job.workspace_id AND job_id=p_job AND usage_kind='embedding' FOR UPDATE;
  IF prior.id IS NOT NULL THEN
    IF prior.external_started OR prior.status<>'reserved' OR prior.price_profile<>p_profile OR prior.reserved_tokens<>p_tokens OR prior.reserved_calls<>p_calls THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PROVIDER_RESULT_UNKNOWN';
    END IF;
    RETURN;
  END IF;
  amount:=ceil(p_tokens*(p_profile->>'embedding')::numeric)::bigint;
  INSERT INTO ops.usage_ledger(workspace_id,task_id,job_id,usage_day,usage_kind,reserved_calls,reserved_tokens,reserved_cny_micros,price_profile,status)
    VALUES(job.workspace_id,job.task_id,p_job,day,'embedding',p_calls,p_tokens,amount,p_profile,'reserved');
  PERFORM ops.assert_daily_usage(job.workspace_id,day);
END $$;

CREATE FUNCTION ops.begin_usage(p_job uuid,p_lease uuid,p_kind text,p_profile jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ops AS $$
DECLARE target ops.usage_ledger; job ops.jobs;
BEGIN
  SELECT * INTO job FROM ops.jobs WHERE id=p_job AND status='running' AND lease_token=p_lease AND lease_expires_at>now() AND cancel_requested_at IS NULL FOR UPDATE;
  IF job.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='LEASE_LOST'; END IF;
  SELECT * INTO target FROM ops.usage_ledger WHERE workspace_id=job.workspace_id AND job_id=p_job AND usage_kind=p_kind FOR UPDATE;
  IF target.id IS NULL OR target.status<>'reserved' OR target.external_started THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PROVIDER_RESULT_UNKNOWN'; END IF;
  IF NOT ops.valid_price_profile(p_profile) OR (target.price_profile<>p_profile AND (target.price_profile->>'mode'<>'fake' OR p_profile->>'mode'<>'fake')) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRICE_PROFILE_INVALID'; END IF;
  IF p_profile->>'mode'='real' AND (SELECT real_ai_not_before>now() FROM ops.recovery_control WHERE singleton) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  IF target.usage_day<>(now() AT TIME ZONE 'Asia/Shanghai')::date THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  PERFORM ops.assert_daily_usage(job.workspace_id,target.usage_day);
  UPDATE ops.usage_ledger SET external_started=true WHERE id=target.id;
END $$;

CREATE FUNCTION ops.settle_embedding(p_job uuid,p_lease uuid,p_calls integer,p_tokens integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ops AS $$
DECLARE target ops.usage_ledger; job ops.jobs; amount bigint;
BEGIN
  SELECT * INTO job FROM ops.jobs WHERE id=p_job AND status='running' AND lease_token=p_lease AND lease_expires_at>now() AND cancel_requested_at IS NULL FOR UPDATE;
  IF job.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='LEASE_LOST'; END IF;
  SELECT * INTO target FROM ops.usage_ledger WHERE workspace_id=job.workspace_id AND job_id=p_job AND usage_kind='embedding' FOR UPDATE;
  IF target.id IS NULL OR target.status<>'reserved' OR NOT target.external_started OR p_calls<1 OR p_calls>target.reserved_calls OR p_tokens<0 OR p_tokens>target.reserved_tokens THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  amount:=ceil(p_tokens*(target.price_profile->>'embedding')::numeric)::bigint;
  IF amount>target.reserved_cny_micros THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='BUDGET_EXCEEDED'; END IF;
  UPDATE ops.usage_ledger SET status='settled',actual_calls=p_calls,actual_tokens=p_tokens,actual_cny_micros=amount,updated_at=now() WHERE id=target.id;
END $$;

ALTER FUNCTION ops.commit_generated_revision(uuid,uuid,jsonb,text,text,integer,integer,integer,bigint) RENAME TO commit_generated_revision_0003;
REVOKE ALL ON FUNCTION ops.commit_generated_revision_0003(uuid,uuid,jsonb,text,text,integer,integer,integer,bigint) FROM PUBLIC,tracepbl_app,tracepbl_worker;
CREATE FUNCTION ops.commit_generated_revision(p_job_id uuid,p_lease_token uuid,p_snapshot jsonb,p_content_hash text,p_actual_model text,p_input_tokens integer,p_output_tokens integer,p_total_tokens integer,p_actual_cny_micros bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ops AS $$
DECLARE profile jsonb; started boolean; amount bigint;
BEGIN
  SELECT price_profile,external_started INTO profile,started FROM ops.usage_ledger WHERE job_id=p_job_id AND usage_kind='generation';
  IF profile IS NULL OR (profile->>'mode'='real' AND NOT started) OR p_input_tokens<0 OR p_input_tokens>24000 OR p_output_tokens<0 OR p_output_tokens>4000 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PROVIDER_OUTPUT_INVALID'; END IF;
  amount:=ceil(p_input_tokens*(profile->>'generationInput')::numeric+p_output_tokens*(profile->>'generationOutput')::numeric)::bigint;
  IF p_actual_cny_micros<>amount THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRICE_PROFILE_INVALID'; END IF;
  RETURN ops.commit_generated_revision_0003(p_job_id,p_lease_token,p_snapshot,p_content_hash,p_actual_model,p_input_tokens,p_output_tokens,p_total_tokens,amount);
END $$;

REVOKE ALL ON FUNCTION ops.valid_price_profile(jsonb),ops.assert_daily_usage(uuid,date),ops.enqueue_model_job(uuid,uuid,bigint,text,text,text,text,jsonb,text,bigint,jsonb),ops.reserve_embedding(uuid,uuid,integer,integer,jsonb),ops.begin_usage(uuid,uuid,text,jsonb),ops.settle_embedding(uuid,uuid,integer,integer),ops.commit_generated_revision(uuid,uuid,jsonb,text,text,integer,integer,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.valid_price_profile(jsonb) TO tracepbl_app,tracepbl_worker;
GRANT EXECUTE ON FUNCTION ops.enqueue_model_job(uuid,uuid,bigint,text,text,text,text,jsonb,text,bigint,jsonb) TO tracepbl_app;
GRANT EXECUTE ON FUNCTION ops.reserve_embedding(uuid,uuid,integer,integer,jsonb),ops.begin_usage(uuid,uuid,text,jsonb),ops.settle_embedding(uuid,uuid,integer,integer),ops.commit_generated_revision(uuid,uuid,jsonb,text,text,integer,integer,integer,bigint) TO tracepbl_worker;
UPDATE ops.runtime_components SET version='0005' WHERE component='backend_schema';
RESET ROLE;
