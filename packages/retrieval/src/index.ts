import { createHash } from "node:crypto";

export const CHUNKER_VERSION = "chunk-v1";
export const CHUNK_TARGET = 800;
export const CHUNK_OVERLAP = 120;
export const CHUNK_MAX = 1600;

export type Chunk = Readonly<{ ordinal: number; contentText: string; charStart: number; charEnd: number; contentHash: string }>;

export function normalizeSourceText(input: string) {
  return input.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }

export function chunkSource(input: string): Chunk[] {
  const normalized = normalizeSourceText(input);
  const points = Array.from(normalized);
  if (points.length === 0) return [];
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < points.length) {
    const hardEnd = Math.min(points.length, start + CHUNK_MAX);
    const targetEnd = Math.min(points.length, start + CHUNK_TARGET);
    let end = targetEnd;
    if (targetEnd < points.length) {
      const floor = Math.min(targetEnd, start + Math.floor(CHUNK_TARGET * 0.65));
      for (let i = targetEnd; i >= floor; i -= 1) {
        if (["\n", "。", "！", "？", ";", "；"].includes(points[i - 1] ?? "")) { end = i; break; }
      }
      if (end <= start) end = hardEnd;
    }
    const contentText = points.slice(start, end).join("");
    chunks.push({ ordinal: chunks.length, contentText, charStart: start, charEnd: end, contentHash: sha256(contentText) });
    if (end === points.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

export type CitationCandidate = Readonly<{ modelRunId: string; taskId: string; sourceVersionId: string; chunkId: number; quotedText: string }>;
export type CitationHit = Readonly<{ modelRunId: string; taskId: string; sourceVersionId: string; chunkId: number; contentText: string; selectedForContext: boolean }>;
export function validateCitation(candidate: CitationCandidate, hit: CitationHit) {
  if (candidate.modelRunId !== hit.modelRunId || candidate.taskId !== hit.taskId || candidate.sourceVersionId !== hit.sourceVersionId || candidate.chunkId !== hit.chunkId || !hit.selectedForContext) return false;
  const quote = normalizeSourceText(candidate.quotedText);
  return quote.length > 0 && normalizeSourceText(hit.contentText).includes(quote);
}

export type RankedHit = Readonly<{ sourceVersionId: string; chunkId: number; cosineDistance: number; keywordScore: number }>;
export function selectContext(hits: readonly RankedHit[]) {
  const count = new Map<string, number>();
  return [...hits].sort((a, b) => a.cosineDistance - b.cosineDistance || b.keywordScore - a.keywordScore || a.chunkId - b.chunkId).filter((hit) => {
    const used = count.get(hit.sourceVersionId) ?? 0;
    if (used >= 3) return false;
    count.set(hit.sourceVersionId, used + 1); return true;
  }).slice(0, 8);
}

export { fetchPublicText, isBlockedAddress, validatePublicUrl, UrlFetchError, type Resolver, type ResolvedAddress } from "./url-fetch.ts";
