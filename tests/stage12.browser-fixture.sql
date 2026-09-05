-- Only apply to the new tracepbl-stage12-followup-postgres-1 synthetic test database.
BEGIN;
INSERT INTO core.sources(id,scope,material_kind,title,data_class)
SELECT ('01991201-0000-7000-8000-' || lpad(n::text,12,'0'))::uuid,'catalog','catalog','合成材料 ' || n || '（非真实史料）','synthetic'
FROM generate_series(1,6) n ON CONFLICT DO NOTHING;
INSERT INTO core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,content_text,rights_state,rights_basis,verification_state,content_hash)
SELECT ('01991201-0000-7000-8000-' || lpad(n::text,12,'0'))::uuid,1,'合成测试目录',CASE WHEN n%2=0 THEN '统计表述' ELSE '文字记录' END,'合成段落 ' || n,'合成练习材料 ' || n || '：仅用于程序验证，不是真实史料。','verified_reusable','synthetic test fixture','verified',encode(sha256(convert_to('合成练习材料 ' || n || '：仅用于程序验证，不是真实史料。','UTF8')),'hex')
FROM generate_series(1,6) n ON CONFLICT DO NOTHING;
INSERT INTO rag.source_chunks(source_version_id,ordinal,content_text,char_start,char_end,locator,content_hash)
SELECT v.id,0,v.content_text,0,char_length(v.content_text),jsonb_build_object('paragraph',1),v.content_hash
FROM core.source_versions v JOIN core.sources s ON s.id=v.source_id
WHERE s.id::text LIKE '01991201-0000-7000-8000-%' ON CONFLICT DO NOTHING;
INSERT INTO rag.chunk_embeddings(chunk_id,embedding_profile_id,embedding)
SELECT c.id,p.id,('[1,' || repeat('0,',1022) || '0]')::vector
FROM rag.source_chunks c JOIN core.source_versions v ON v.id=c.source_version_id JOIN core.sources s ON s.id=v.source_id CROSS JOIN rag.embedding_profiles p
WHERE s.id::text LIKE '01991201-0000-7000-8000-%' AND p.model='embedding-3' AND p.dimensions=1024 AND p.active ON CONFLICT DO NOTHING;
COMMIT;
