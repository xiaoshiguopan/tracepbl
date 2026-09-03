INSERT INTO core.workspaces(id,mode,display_name)
VALUES ('01990000-0000-7000-8000-000000000001','local_single_user','本地工作区')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rag.embedding_profiles(id,provider,model,dimensions,distance,chunker_version,active)
VALUES ('01990000-0000-7000-8000-000000000002','zhipu','embedding-3',1024,'cosine','tracepbl-text-v1',true)
ON CONFLICT (provider,model,dimensions,distance,chunker_version) DO NOTHING;
