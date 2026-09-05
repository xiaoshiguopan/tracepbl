import { createHash } from "node:crypto";
import { connect } from "./database.ts";

// Explicit opt-in seed only. These are fictitious classroom records, not historical sources.
if (process.env.TRACEPBL_SYNTHETIC_FIXTURES !== "true") throw new Error("Set TRACEPBL_SYNTHETIC_FIXTURES=true to install synthetic integration fixtures.");
const sql = connect(process.env.TRACEPBL_MIGRATOR_DATABASE_URL ?? process.env.TRACEPBL_DATABASE_URL);
try {
  await sql.begin(async tx => {
    for (let index = 1; index <= 6; index++) {
      const id = `11000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const text = `合成课堂练习材料 ${index}：虚构地区甲的记录提到运输、人口与交易发生变化。本段只用于软件集成和证据阅读练习，不对应真实历史、个人或学生。`;
      const hash = createHash("sha256").update(text).digest("hex");
      await tx`insert into core.sources(id,scope,material_kind,title,data_class) values (${id},'catalog','catalog',${`合成材料 ${index}（非真实史料）`},'synthetic') on conflict(id) do nothing`;
      const versions = await tx<{ id: string }[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,period_label,source_type,locator,content_text,context_note,meaning_note,interpretation_note,limitation_note,rights_state,rights_basis,verification_state,content_hash) values (${id},1,'TracePBL 合成夹具','虚构时期',${["文字记录","统计表述","观察笔记"][(index-1)%3]!},${`合成夹具第 ${index} 段`},${text},'仅为虚构练习情境。','描述虚构地区的若干变化。','可练习辨认记录、解释与推断。','不能用于真实历史论证。','verified_reusable','project_original_synthetic_fixture','verified',${hash}) on conflict(source_id,version_no) do nothing returning id`;
      const version = versions[0] ?? (await tx<{id:string}[]>`select id from core.source_versions where source_id=${id} and version_no=1`)[0]!;
      const chunks = await tx<{id:number}[]>`insert into rag.source_chunks(source_version_id,ordinal,content_text,locator,content_hash) values (${version.id},0,${text},${tx.json({ kind: "synthetic", paragraph: index })},${hash}) on conflict(source_version_id,ordinal) do nothing returning id`;
      const chunk = chunks[0] ?? (await tx<{id:number}[]>`select id from rag.source_chunks where source_version_id=${version.id} and ordinal=0`)[0]!;
      const vector = `[1,${Array(1023).fill(0).join(",")}]`;
      await tx`insert into rag.chunk_embeddings(chunk_id,embedding_profile_id,embedding) select ${chunk.id},id,${vector}::vector from rag.embedding_profiles where provider='zhipu' and model='embedding-3' and dimensions=1024 and distance='cosine' and chunker_version='chunk-v1' and active order by created_at desc,id desc limit 1 on conflict do nothing`;
    }
  });
  process.stdout.write("Six synthetic fixtures installed; no external requests.\n");
} finally { await sql.end(); }
