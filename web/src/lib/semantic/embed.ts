/**
 * Gemini embeddings client (via the existing LLM gateway API key).
 *
 * Uses the native batchEmbedContents endpoint with a configurable model
 * (default: gemini-embedding-001, 3072-dim). All calls are wrapped so any
 * failure throws; callers treat embeddings as a best-effort RANKING signal
 * and fall back to the deterministic retrieval when unavailable.
 */

const EMBED_MODEL = process.env.EMBEDDINGS_MODEL || "gemini-embedding-001";
const API_KEY = process.env.EMBEDDINGS_API_KEY || process.env.LLM_API_KEY || "";

const EMBED_BASE =
  process.env.EMBEDDINGS_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta";

export function isEmbeddingsConfigured(): boolean {
  return API_KEY.length > 0;
}

export interface EmbeddingProvider {
  /** Embed a list of texts, returning one vector (number[]) per text. */
  embedTexts(texts: string[]): Promise<number[][]>;
}

/** Real provider backed by the Gemini API. */
class GeminiEmbedder implements EmbeddingProvider {
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!isEmbeddingsConfigured()) throw new Error("embeddings not configured");
    if (texts.length === 0) return [];
    const vectors: number[][] = [];
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const chunk = texts.slice(i, i + batchSize);
      vectors.push(...(await this.embedBatch(chunk)));
    }
    return vectors;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const requests = texts.map((text) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
    }));
    let lastErr: unknown;
    // The Gemini batch endpoint rate-limits aggressively (429), and transient
    // 5xx errors happen under load. Retry with backoff instead of silently
    // dropping the semantic layer on the first failure.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(
          `${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": API_KEY,
            },
            body: JSON.stringify({ model: `models/${EMBED_MODEL}`, requests }),
            signal: AbortSignal.timeout(30000),
          },
        );
        if (!res.ok) {
          const detail = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          const retryable = res.status === 429 || res.status >= 500;
          if (!retryable || attempt === 2) {
            throw new Error(
              `embed HTTP ${res.status}: ${detail?.error?.message ?? res.statusText}`,
            );
          }
          // Respect the server's Retry-After hint when present, else back off.
          const retryAfter = Number(res.headers.get("retry-after"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
          lastErr = new Error(`embed HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as { embeddings?: Array<{ values?: number[] }> };
        const values = (json.embeddings ?? []).map((e) => e.values ?? []);
        if (values.length !== texts.length) throw new Error("embed count mismatch");
        return values;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    // Not silent: the hybrid engine dropped out — surface why in the server log.
    console.warn(`[semantic] embeddings unavailable after retries: ${msg}`);
    throw lastErr instanceof Error ? lastErr : new Error(msg);
  }
}

let singleton: EmbeddingProvider | null = null;

/** Returns a shared embedder (real Gemini, or a stub when no key is set). */
export function getEmbedder(): EmbeddingProvider {
  if (!singleton) singleton = isEmbeddingsConfigured() ? new GeminiEmbedder() : new StubEmbedder();
  return singleton;
}

/** No-op provider used when embeddings are not configured (fails loudly). */
class StubEmbedder implements EmbeddingProvider {
  async embedTexts(): Promise<number[][]> {
    throw new Error("embeddings not configured");
  }
}

export { EMBED_MODEL };