import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { IndexedDoc } from "../corpus/schema";
import { getEmbedder } from "./embed";
import { docEmbedText } from "./docText";

/**
 * Semantic index over the corpus docs using Gemini embeddings.
 *
 * Vectors are precomputed offline (scripts/embed-corpus.mjs) and shipped in
 * web/data/embeddings.json, keyed by doc id, so runtime never re-embeds the
 * corpus in the common case. Any doc id missing from the file (e.g. a brand
 * new live-API entry) is embedded lazily and cached in memory.
 *
 * Semantic similarity is used ONLY as a ranking signal on top of the
 * deterministic retrieval — it never bypasses the strict grounding gates.
 */

export interface SemanticHit {
  doc: IndexedDoc;
  score: number;
}

/** Encode a Float32 vector as compact base64 for the vector cache file. */
export function encodeVector(vec: number[]): string {
  const buf = Buffer.from(new Float32Array(vec).buffer);
  return buf.toString("base64");
}

/** Decode a base64 Float32 vector. */
export function decodeVector(encoded: string): number[] {
  const buf = Buffer.from(encoded, "base64");
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

const VECTOR_CANDIDATES = [
  path.resolve(process.cwd(), "data", "embeddings.json"),
  path.resolve(process.cwd(), "..", "data", "embeddings.json"),
  path.resolve(process.cwd(), "web", "data", "embeddings.json"),
];

function findVectorFile(): string | null {
  const found = VECTOR_CANDIDATES.find((p) => existsSync(p));
  return found ?? null;
}

export function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length !== a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const QUERY_CACHE_SIZE = 256;

export class SemanticIndex {
  private docs: IndexedDoc[];
  private vectors = new Map<string, number[]>();
  private ready = false;
  private loading: Promise<void> | null = null;
  private queryCache = new Map<string, number[]>();
  /** Last failure that degraded the semantic layer ("" when healthy). */
  lastError = "";

  constructor(docs: IndexedDoc[]) {
    this.docs = docs;
    this.loadFromFile();
  }

  /** How many docs have an available vector (0..1). */
  get coverage(): number {
    if (this.docs.length === 0) return 0;
    return this.vectors.size / this.docs.length;
  }

  private loadFromFile(): void {
    const file = findVectorFile();
    if (!file) return;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        docs?: Record<string, string>;
      };
      for (const [id, encoded] of Object.entries(parsed.docs ?? {})) {
        try {
          this.vectors.set(id, decodeVector(encoded));
        } catch {
          // skip corrupt vector
        }
      }
    } catch {
      // ignore unreadable cache; lazy embedding will fill gaps
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const missing = this.docs.filter((d) => !this.vectors.has(d.id));
      if (missing.length > 0) {
        try {
          const embedder = getEmbedder();
          const texts = missing.map((d) => docEmbedText(d));
          const vecs = await embedder.embedTexts(texts);
          missing.forEach((d, i) => {
            if (vecs[i]?.length) this.vectors.set(d.id, vecs[i]);
          });
        } catch (err) {
          // embeddings unavailable — semantic search degrades to empty
          this.lastError = err instanceof Error ? err.message : String(err);
          console.warn(
            `[semantic] ${missing.length} docs missing vectors; lazy embed failed: ${this.lastError}`,
          );
        }
      }
      this.ready = true;
    })();
    return this.loading;
  }

  private async embedQuery(query: string): Promise<number[] | null> {
    const cached = this.queryCache.get(query);
    if (cached) return cached;
    try {
      const embedder = getEmbedder();
      const [vec] = await embedder.embedTexts([query]);
      if (!vec?.length) return null;
      if (this.queryCache.size >= QUERY_CACHE_SIZE) {
        const first = this.queryCache.keys().next().value;
        if (first !== undefined) this.queryCache.delete(first);
      }
      this.queryCache.set(query, vec);
      return vec;
    } catch (err) {
      // Not silent: the hybrid engine could not embed this query — log why so
      // a rate-limit / key issue is visible instead of a quiet BM25 fallback.
      this.lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[semantic] query embed failed: ${this.lastError}`);
      return null;
    }
  }

  /** Semantic top-K over the corpus. Returns [] when embeddings fail. */
  async search(query: string, topK = 8): Promise<SemanticHit[]> {
    await this.ensureReady();
    const qvec = await this.embedQuery(query);
    if (!qvec) return [];
    const scored: SemanticHit[] = [];
    for (const doc of this.docs) {
      const vec = this.vectors.get(doc.id);
      if (!vec) continue;
      const sim = cosine(qvec, vec);
      if (sim > 0) scored.push({ doc, score: sim });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}