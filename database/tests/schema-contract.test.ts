import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationFiles, migrationsDirectory } from "../scripts/database.js";

const expectedTables = [
  "core.workspaces", "core.tasks", "core.task_contexts", "core.inquiry_questions", "core.sources", "core.source_versions", "core.task_sources",
  "core.evidence_claims", "core.evidence_relations", "core.evidence_citations", "core.learning_activities", "core.activity_sources", "core.rubric_items",
  "core.rubric_levels", "core.rubric_activities", "core.verification_runs", "core.verification_findings", "core.teacher_decisions", "core.task_revisions",
  "core.export_runs", "rag.embedding_profiles", "rag.source_chunks", "rag.chunk_embeddings", "rag.model_runs", "rag.retrieval_hits", "ops.jobs",
  "ops.command_receipts", "ops.audit_events",
];

describe("approved database contract", () => {
  it("keeps migrations ordered and immutable by checksum at runtime", async () => {
    expect(await migrationFiles()).toEqual(["0001_initial_schema.sql", "0002_seed_defaults.sql"]);
  });

  it("creates every approved relation and the four schema boundaries", async () => {
    const sql = await readFile(join(migrationsDirectory, "0001_initial_schema.sql"), "utf8");
    for (const schema of ["core", "rag", "ops", "agent"]) expect(sql).toContain(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    for (const table of expectedTables) expect(sql).toMatch(new RegExp(`CREATE TABLE ${table.replace(".", "\\.")} \\(`));
  });

  it("retains isolation, deletion, provenance, and exact-vector guards", async () => {
    const sql = (await readFile(join(migrationsDirectory, "0001_initial_schema.sql"), "utf8")).toLowerCase();
    expect(sql).toContain("task_sources_scope_guard");
    expect(sql).toContain("purge_after = deleted_at + interval '24 hours'");
    expect(sql).toContain("embedding vector(1024)");
    expect(sql).toContain("foreign key(chunk_id,source_version_id)");
    expect(sql).not.toMatch(/hnsw|ivfflat|enable row level security|create policy/);
  });

  it("contains only non-secret idempotent defaults", async () => {
    const seed = await readFile(join(migrationsDirectory, "0002_seed_defaults.sql"), "utf8");
    expect(seed).toContain("ON CONFLICT");
    expect(seed).toContain("embedding-3");
    expect(seed).not.toMatch(/api[_-]?key|authorization|password|student|学生/i);
  });
});
