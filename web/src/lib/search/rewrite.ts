/**
 * Lightweight LLM query normalization for the retrieval layer.
 *
 * The raw user query (Roman Urdu, slang, or indirect English) is rewritten
 * into a clean, search-friendly English string before BM25 + semantic search.
 * The rewrite is used ONLY for retrieval — language detection and answer
 * generation still use the original query, so responses keep mirroring the
 * user's language.
 *
 * Everything here is best-effort: any failure (no key, timeout, bad output)
 * falls back to the original query, and the grounding gates downstream never
 * trust the rewrite alone.
 */

const SYSTEM_PROMPT = `You convert a user's question about the Prophet Muhammad (Islamic Seerah/Shamail) into a clean English search query for a retrieval system. Rules:
- Output a short, factual, search-friendly English phrase (3-12 words). No question form, no explanation, no quotes, no punctuation.
- Keep proper nouns and religious references (Prophet, Messenger, Madinah, Badr, Khaybar, hijrah, Allah, Kaaba).
- Map Roman Urdu / Urdu / slang to standard English terms, e.g. "pehnawa/poshaak/libas/kapray" -> clothing, "zirah/jangi libas" -> armor, "salan" -> gravy, "qad/hulya" -> stature and appearance, "khaate/peete/khana" -> food and drink, "jung" -> battle, "huzoor/aqa/aap" -> Prophet.
- Be faithful: never add facts, names, or topics not present in the question.
- Output ONLY the rewritten query.`;

const CACHE = new Map<string, string>();
const MODEL_CACHE = new Map<string, boolean>();

function modelCandidates(): string[] {
  const fromEnv = [
    process.env.LLM_MODEL,
    ...(process.env.LLM_MODEL_FALLBACKS ?? "").split(",").map((s) => s.trim()),
  ].filter((s) => s && s.length > 0) as string[];
  const seen = new Set<string>();
  return fromEnv.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));
}

export function isRewriteConfigured(): boolean {
  return Boolean(
    process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL,
  );
}

function clean(output: string): string {
  return output
    .replace(/["'.!?;:]+$/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

/**
 * Rewrite a raw question into an optimized English search string.
 * Returns the original question unchanged when the LLM is unavailable or fails.
 */
export async function rewriteSearchQuery(raw: string): Promise<string> {
  if (!isRewriteConfigured()) return raw;
  const cached = CACHE.get(raw);
  if (cached) return cached;

  const base = `${(process.env.LLM_BASE_URL ?? "").replace(/\/+$/, "")}/chat/completions`;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.LLM_API_KEY}`,
  };

  // Transient failures (timeout, 5xx, 429) are retried once per model with a
  // short backoff, and a permanently failing model is skipped for the next
  // candidate — the rewrite is only abandoned after every model failed.
  let lastErr: unknown = null;
  for (const model of modelCandidates()) {
    // Skip models already known to be unavailable (e.g. deprecated names).
    if (MODEL_CACHE.get(model) === false) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(base, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: raw },
            ],
            temperature: 0,
            max_tokens: 48,
          }),
          // Retries share a smaller budget so a slow backend doesn't blow the
          // whole serverless function timeout.
          signal: AbortSignal.timeout(attempt === 0 ? 15000 : 8000),
        });
        if (!res.ok) {
          // 404 for an unavailable model: remember and try the next candidate.
          if (res.status === 404) {
            MODEL_CACHE.set(model, false);
            break;
          }
          const retryable = res.status === 429 || res.status >= 500;
          if (!retryable || attempt === 1) {
            throw new Error(`rewrite HTTP ${res.status}`);
          }
          lastErr = new Error(`rewrite HTTP ${res.status} (retryable)`);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const out = clean(json?.choices?.[0]?.message?.content ?? "");
        if (!out) throw new Error("empty rewrite");
        if (CACHE.size >= 512) CACHE.clear();
        CACHE.set(raw, out);
        return out;
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // Not silent: surface why the rewrite path degraded so a quota/network issue
  // is visible in the server log instead of a quiet deterministic fallback.
  console.warn(
    `[rewrite] LLM query rewrite failed (${lastErr instanceof Error ? lastErr.message : String(lastErr)}); using original query`,
  );
  return raw;
}