import { search, getEngine } from "../search/search";
import { queryTokens, tokenize, ALIAS_GROUP_NAMES } from "../search/tokenize";
import { detectQueryLang, answerLang, type QueryLang } from "../l10n/detect";
import { checkBlockers, refusalText, type BlockKind } from "../guardrails/blockers";
import { generateDeterministicAnswer } from "./generate";
import { getLLMClient, type LLMChatMessage } from "../llm";
import type { Citation, IndexedDoc } from "../corpus/schema";

/**
 * End-to-end question answering pipeline:
 *
 *   1. normalize + detect language
 *   2. deterministic blockers (fatwa / injection / empty)   <- fail closed
 *   3. lexical retrieval (BM25, multi-lingual conflation)
 *   4. out-of-corpus threshold (fail open politely, never fabricate)
 *   5. deterministic grounded generation (default = offline)
 *      -> optional LLM presentation pass, guarded by post-verification
 *   6. citation post-verification (every cited id must be in the chosen set)
 */

export type AnswerStatus = "answered" | "blocked" | "out_of_corpus";

export interface Answer {
  status: AnswerStatus;
  kind?: BlockKind | "out_of_corpus" | "no_support";
  text: string;
  lang: QueryLang;
  /** Ordered citations; the answer text references them as [1], [2], ... */
  citations: Citation[];
  engine: "deterministic" | "llm";
  disclaimer: { en: string; ur: string };
  corpusVersion: string;
  matched?: { topScore: number; coverage: number; topDocId?: string };
}

/** Tunable thresholds for the out-of-corpus decision (calibrated in Phase 6). */
export const OUT_OF_CORPUS = {
  /** Absolute minimum top score to accept an answer. */
  minAbsScore: 8,
  /** Minimum fraction of content query tokens matched by the top hit. */
  minCoverage: 0.5,
  /**
   * Weak "name-only" guard: a query whose best hit scores below this AND has
   * no topical anchor (no conflation-group token, no token present in >=3
   * docs' bodies, no shared title token) is treated as an incidental mention
   * (e.g. "Khalid Bin Waleed" matching inside the Conquest-of-Mecca narrative)
   * and refused as out-of-corpus instead of answering with mismatched context.
   */
  weakNameOnlyScore: 12,
  /** A token appearing in this many docs' bodies counts as an established topic. */
  bodyDfTopical: 3,
};

/** Cached per-token document frequency over the body field (154 docs). */
let bodyDfCache: ReadonlyMap<string, number> | null = null;
function bodyDocFrequency(): ReadonlyMap<string, number> {
  if (!bodyDfCache) {
    const df = new Map<string, number>();
    for (const doc of getEngine().corpus.docs) {
      for (const t of new Set(tokenize(doc.fields.body))) {
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }
    bodyDfCache = df;
  }
  return bodyDfCache;
}

/** Does the query carry any "topical anchor" tying it to the corpus scope? */
function hasTopicalAnchor(token: string): boolean {
  if (ALIAS_GROUP_NAMES.has(token)) return true;
  return (bodyDocFrequency().get(token) ?? 0) >= OUT_OF_CORPUS.bodyDfTopical;
}

/** Number of significant query tokens also present in the doc title (en|ur). */
function titleTokenOverlap(doc: IndexedDoc, significant: string[]): number {
  const titleToks = new Set([...tokenize(doc.titleEn), ...tokenize(doc.titleUr)]);
  return significant.filter((t) => titleToks.has(t)).length;
}

function normalizeQuestion(q: string): string {
  return q.replace(/\s+/g, " ").trim();
}

function noSupportAnswer(q: QueryLang, topScore: number): Answer {
  const text =
    q === "ur"
      ? "میں صرف اسی سیرت و شمائل کے ذخیرے سے جواب دیتا ہوں، اور آپ کا سوال اس ذخیرے میں ہے نہیں۔ براہِ کرم نبی ﷺ کی زندگی، اوصاف، یا عادات سے متعلق کوئی سوال پوچھیں۔"
      : q === "roman-ur"
        ? "Main sirf Seerah aur Shamail corpus se jawab deta hoon. Aap ka sawal us mein nahi hai. Barah-e-meharbani Nabi ﷺ ki zindagi, ikhlaq ya aadaab se poochiye."
        : "I can only answer from the fixed Seerah & Shamail corpus, and your question doesn't match it. Please ask about the life, character, or habits of the Prophet ﷺ from this corpus.";
  return {
    status: "out_of_corpus",
    kind: "no_support",
    text,
    lang: q,
    citations: [],
    engine: "deterministic",
    disclaimer: getDisclaimer(),
    corpusVersion: getEngine().corpus.corpusVersion,
    matched: { topScore, coverage: 0 },
  };
}

function blockedAnswer(kind: BlockKind, q: QueryLang): Answer {
  return {
    status: "blocked",
    kind,
    text: refusalText(kind, q),
    lang: q,
    citations: [],
    engine: "deterministic",
    disclaimer: getDisclaimer(),
    corpusVersion: getEngine().corpus.corpusVersion,
  };
}

const DISCLAIMER = { en: "", ur: "" };
function getDisclaimer() {
  if (DISCLAIMER.en) return { ...DISCLAIMER };
  const meta = getEngine().corpus.meta;
  DISCLAIMER.en = meta?.disclaimer?.en || "";
  DISCLAIMER.ur = meta?.disclaimer?.ur || "";
  return { ...DISCLAIMER };
}

/**
 * Verify a candidate answer's citation claims against the allowed source ids.
 * Accepts two citation forms the pipeline uses:
 *   - the full 24-hex corpus id, e.g. 672b449ad458540020750f9f
 *   - the numbered form "[n]", which maps to allowedIds[n - 1] (the order the
 *     sources were passed to the answerer, matching the UI citation chips).
 * Empty result -> the answer cannot be trusted -> fallback.
 */
export function verifyCitations(raw: string, allowedIds: string[]): string[] {
  if (!raw) return [];
  const allowed = new Set(allowedIds);
  const found: string[] = [];
  const pushId = (id: string) => {
    if (allowed.has(id) && !found.includes(id)) found.push(id);
  };
  for (const m of raw.match(/[a-f0-9]{24}/gi) ?? []) {
    pushId(m);
  }
  for (const n of raw.match(/\[(\d{1,2})\]/g) ?? []) {
    const idx = Number.parseInt(n.slice(1, -1), 10) - 1;
    const id = allowedIds[idx];
    if (id) pushId(id);
  }
  return found;
}

function buildLLMPrompt(
  sources: Array<{ doc: { id: string; titleEn: string; titleUr: string; textEn: string; textUr: string } }>,
  question: string,
  lang: "en" | "ur",
): LLMChatMessage[] {
  const ur = lang === "ur";
  const blocks = sources
    .map((s, i) => {
      const title = ur ? s.doc.titleUr || s.doc.titleEn : s.doc.titleEn;
      const text = ur ? s.doc.textUr : s.doc.textEn;
      return `[${i + 1}] ${title}\n${text.slice(0, 1800)}`;
    })
    .join("\n\n---\n\n");
  const system =
    "You answer ONLY from the supplied corpus entries. Cite every claim with the entry number in square brackets, e.g. [1]. " +
    "Your answer MUST contain at least one citation marker in [n] format, otherwise it will be rejected. " +
    "Never invent hadith, Quran, or Seerah text. Answer concisely in clear, professional English. " +
    "Answer in Urdu script only if the user explicitly asks for Urdu. " +
    "Answer the user's question directly; when an entry is clearly relevant, use it and cite it. " +
    "Only say you cannot answer from the corpus if the supplied text genuinely does not cover the question.";
  const user = ur
    ? `سوال: ${question}\n\nذخیرہ:\n${blocks}\n\nجواب براہِ راست دیں، اسی اندراج سے ماخوذ ہو اور نمبروں کے ساتھ حوالہ دیں ([1] وغیرہ)۔`
    : `Question: ${question}\n\nCorpus:\n${blocks}\n\nAnswer directly from these entries, cite with [n], and do not hedge when an entry is relevant.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Attempt an optional LLM presentation pass. Fails closed: any missing
 * configuration, network error, or unverifiable citation falls back to the
 * deterministic answer.
 */
async function maybeLLMPass(
  question: string,
  lang: "en" | "ur",
  sources: Array<{ doc: IndexedDoc }>,
): Promise<string | null> {
  const client = getLLMClient();
  if (!client.available) {
    console.error("[llm] LLM not available — LLM_BASE_URL/LLM_API_KEY/LLM_MODEL or GEMINI_API_KEY not configured");
    return null;
  }
  try {
    const raw = await client.complete(buildLLMPrompt(sources, question, lang));
    if (!raw) {
      console.error(`[llm] ${client.provider} returned no content (all models in chain failed/404)`);
      return null;
    }
    const ids = verifyCitations(raw, sources.map((s) => s.doc.id));
    if (ids.length === 0) {
      console.error(`[llm] ${client.provider} output contained no verifiable citation — rejecting, falling back to deterministic`);
      return null;
    }
    return raw;
  } catch (err) {
    console.error(`[llm] ${client.provider} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function answerQuestion(rawQuestion: string): Promise<Answer> {
  const question = normalizeQuestion(rawQuestion);
  const lang = detectQueryLang(question);
  const target = answerLang(lang, question);

  const block = checkBlockers(question);
  if (block.blocked) return blockedAnswer(block.kind ?? "empty", lang);

  const result = search(question, { topK: 6 });
  const significant = queryTokens(question);

  if (significant.length === 0 || result.hits.length === 0) {
    return noSupportAnswer(lang, 0);
  }

  // Pick the hit that explains the most significant query tokens (coverage
  // first, score second). The top scorer may match only a single shared word
  // (e.g. "battle"), while the best-coverage doc is the true topical match.
  const candidates = result.hits
    .filter((h) => h.substantive && h.score >= OUT_OF_CORPUS.minAbsScore)
    .map((h) => ({
      hit: h,
      coverage:
        significant.filter((t) => h.matchedGroups.includes(t)).length / significant.length,
    }))
    .sort(
      (a, b) => b.coverage - a.coverage || b.hit.score - a.hit.score,
    );

  const best = candidates[0]?.hit;
  if (!best || candidates[0].coverage < OUT_OF_CORPUS.minCoverage) {
    return noSupportAnswer(lang, best?.score ?? 0);
  }
  const coverage = candidates[0].coverage;

  // Weak name-only guard: refuse when the query is just a name that happens to
  // appear inside a narrative (no topical anchor, no title support, low score).
  // e.g. "Khalid Bin Waleed" -> matched only because that name appears in the
  // Conquest of Mecca entry. Fails closed to the out-of-corpus redirect.
  if (
    best.score < OUT_OF_CORPUS.weakNameOnlyScore &&
    !significant.some(hasTopicalAnchor) &&
    titleTokenOverlap(best.doc, significant) === 0
  ) {
    return noSupportAnswer(lang, best.score);
  }

  // confirmed support set: best doc + close runner-ups
  const confirmed = [best, ...result.hits.slice(1)]
    .filter((h) => h.substantive && h.score >= best.score * 0.4)
    .slice(0, 3);

  const sourcesForText = confirmed.map((h) => ({ doc: h.doc }));

  // Primary answer: real LLM (RAG → Gemini) when configured. Every citation is
  // post-verified against the retrieved ids; unverifiable/failed LLM output
  // falls back to the deterministic grounded answer (spec-mandated safe
  // fallback), never to invented content.
  let text = "";
  let engine: Answer["engine"] = "deterministic";
  if (getLLMClient().available) {
    const llmText = await maybeLLMPass(question, target, confirmed);
    if (llmText) {
      text = llmText;
      engine = "llm";
    }
  }
  if (!text) {
    text = generateDeterministicAnswer(sourcesForText, target);
  }

  const citations = confirmed.map((h) => h.doc.citation);

  return {
    status: "answered",
    text,
    lang,
    citations,
    engine,
    disclaimer: getDisclaimer(),
    corpusVersion: getEngine().corpus.corpusVersion,
    matched: { topScore: best.score, coverage, topDocId: best.doc.id },
  };
}