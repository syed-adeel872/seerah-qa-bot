import { search, getEngine, ensureLiveCorpus, searchSemantic } from "../search/search";
import { rewriteSearchQuery } from "../search/rewrite";
import { queryTokens, tokenize, ALIAS_GROUP_NAMES } from "../search/tokenize";
import { detectQueryLang, answerLang, type QueryLang } from "../l10n/detect";
import { checkBlockers, refusalText, type BlockKind } from "../guardrails/blockers";
import { generateDeterministicAnswer, type AnswerTarget } from "./generate";
import type { Citation, IndexedDoc } from "../corpus/schema";

/**
 * End-to-end question answering pipeline:
 *
 *   1. warm the corpus from the live /api/seerathon/corpus API (snapshot fallback)
 *   2. normalize + detect language
 *   3. deterministic blockers (fatwa / injection / empty)   <- fail closed
 *   4. retrieval on the ORIGINAL question (BM25 + semantic embeddings,
 *      multi-lingual conflation)
 *   5. out-of-corpus threshold (fail open politely, never fabricate)
 *   6. if not grounded, retry retrieval with an LLM-normalized English query
 *      (Roman Urdu / slang / indirect English) — search-only, never output
 *   7. deterministic grounded generation (zero-hallucination)
 */

export type AnswerStatus = "answered" | "blocked" | "out_of_corpus";

/**
 * Which retrieval path produced the answer:
 *  - "deterministic": BM25 keyword retrieval only (semantic layer unavailable or
 *    did not contribute to the winning candidate).
 *  - "hybrid": the embedding/semantic layer contributed — the winning candidate
 *    carried a real cosine score (semScore > 0), i.e. the hybrid engine ran.
 *
 * Generation is always the same deterministic, zero-hallucination generator;
 * this flag only reports the retrieval engine, so the UI can surface when the
 * semantic pipeline actually executed.
 */
export type AnswerEngine = "deterministic" | "hybrid";

export interface Answer {
  status: AnswerStatus;
  kind?: BlockKind | "out_of_corpus" | "no_support";
  text: string;
  lang: QueryLang;
  /** Ordered citations; the answer text references them as [1], [2], ... */
  citations: Citation[];
  engine: AnswerEngine;
  /**
   * When the LLM query rewriter was used to ground the answer (pass 2), the
   * search string it produced. Surfaced so the UI can log/show the rewrite.
   */
  rewrittenQuery?: string;
  /** Diagnostics for the semantic/hybrid retrieval layer. */
  semantic?: {
    /** Whether the embedding search returned any hits for this query. */
    available: boolean;
    /** Whether the winning candidate was ranked/grounded via embeddings. */
    used: boolean;
  };
  disclaimer: { en: string; ur: string };
  corpusVersion: string;
  matched?: {
    topScore: number;
    coverage: number;
    topDocId?: string;
    semScore?: number;
  };
}

/** Tunable thresholds for the out-of-corpus decision (calibrated in Phase 6). */
export const OUT_OF_CORPUS = {
  /** Absolute minimum top score to accept an answer. */
  minAbsScore: 8,
  /** Minimum fraction of content query tokens matched by the top hit. */
  minCoverage: 0.5,
  /**
   * When the best hit shares NO query token with its title (event/location
   * queries often match inside the body only), the BM25 score must clear this
   * higher bar to prove the match is topical rather than an incidental mention
   * of a name inside an unrelated narrative (e.g. "Khalid Bin Waleed" matching
   * inside the Conquest-of-Mecca entry). Incidental mentions score low; core
   * topics clear it. Calibrated against the live corpus (with include_hikayat):
   * Khalid mention 13.0 (must reject) vs Hira 19.8 / Hijrah 29.7 / Badr 37.0.
   */
  titlelessMinScore: 16,
  /**
   * A titleless hit may still be accepted when its semantic similarity to the
   * query is high enough AND the query shares a recognized topical group with
   * the document body (the relaxed title anchor). The topical-group condition
   * is what excludes pure proper-name queries ("Khalid Bin Waleed") whose
   * tokens map to no group. Calibrated on gemini-embedding-001: genuine body
   * topics (armor -> Battle of Uhud 0.76, clothing 0.78) clear it; incidental
   * matches do not.
   */
  semTitlelessMin: 0.62,
  /**
   * Semantic similarity (cosine) required before an embedding match may boost
   * a candidate's rank. 0.45 is well above the gemini-embedding cosine range
   * for unrelated texts (~0.3-0.4) while below clear topical matches (~0.55+).
   */
  semBoostThreshold: 0.45,
  /**
   * Cosine strength for the semantic boost per unit (scaled so a strong match
   * can overtake a BM25 gap of up to ~30 points on the same grounding tier).
   */
  semBoostScale: 120,
};

/**
 * Candidate document surfaced by the hybrid retrieval. `bm25Score` is 0 for
 * docs that only the semantic layer found; `semScore` is 0 for BM25-only docs.
 */
interface Candidate {
  doc: IndexedDoc;
  bm25Score: number;
  semScore: number;
  coverage: number;
  titleOverlap: number;
  hybridScore: number;
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

export async function answerQuestion(rawQuestion: string): Promise<Answer> {
  // Use the live spec corpus API when reachable; otherwise the frozen snapshot.
  await ensureLiveCorpus();

  const question = normalizeQuestion(rawQuestion);
  const lang = detectQueryLang(question);
  const target = answerLang(lang, question);

  const block = checkBlockers(question);
  if (block.blocked) return blockedAnswer(block.kind ?? "empty", lang);

  const originalSignificant = queryTokens(question);

  // Pass 1: retrieval on the ORIGINAL question — deterministic and identical
  // to the pre-rewrite pipeline. This is the primary path and never depends on
  // an LLM.
  const direct = await answerFromQuery(
    question,
    originalSignificant,
    new Map(search(question, { topK: 12 }).hits.map((h) => [h.doc.id, h.score])),
    lang,
    target,
  );
  if (direct.status === "answered") return direct;

  // Pass 2 (LLM query normalization) is a RETRIEVAL fallback for queries the
  // original couldn't ground — Roman Urdu slang or indirect English like
  // "metal gear" -> armor. It is only allowed when the user's OWN words carry
  // at least one recognized topical group; otherwise a name-only query
  // ("Khalid Bin Waleed") could have a topic invented for it by the rewrite.
  // The rewrite feeds BM25 + embeddings only; language detection, answer
  // generation, and mirroring still use the original question.
  const eligible = originalSignificant.some((t) => ALIAS_GROUP_NAMES.has(t));
  if (!eligible) return direct;

  const rewritten = await rewriteSearchQuery(question);
  if (rewritten === question) return direct;
  const fallbackSignificant = queryTokens(rewritten).filter(
    (t) => !GENERIC_REWRITE_TOKENS.has(t),
  );
  const fallback = await answerFromQuery(
    rewritten,
    fallbackSignificant,
    new Map(search(rewritten, { topK: 12 }).hits.map((h) => [h.doc.id, h.score])),
    lang,
    target,
    rewritten,
  );
  return fallback.status === "answered" ? fallback : direct;
}

/** Filler words the LLM rewrite tends to prepend; they carry no topical signal. */
const GENERIC_REWRITE_TOKENS = new Set([
  "prophet",
  "muhammad",
  "physical",
  "general",
  "description",
  "characteristics",
  "history",
  "beloved",
  "blessed",
  "dear",
  "noble",
]);

async function answerFromQuery(
  retrievalQuery: string,
  significant: string[],
  lexicalBm25ById: Map<string, number>,
  lang: QueryLang,
  target: AnswerTarget,
  rewrittenQuery?: string,
): Promise<Answer> {
  const result = search(retrievalQuery, { topK: 12 });
  const semanticHits = await searchSemantic(retrievalQuery, 8);

  if (significant.length === 0 || result.hits.length === 0) {
    return noSupportAnswer(lang, 0);
  }
  const semScoreById = new Map(semanticHits.map((s) => [s.doc.id, s.score]));
  const seen = new Set<string>();
  const pool: Candidate[] = [];
  // The "prophet" group appears in essentially every document, so counting it
  // towards coverage would let a doc "cover" a query it only matches via the
  // universal reference. Exclude it (from both the numerator and the
  // denominator) so coverage measures only the discriminating tokens.
  const coverageTokens = significant.filter((t) => t !== "prophet");

  for (const h of result.hits) {
    const docGroups = getEngine().index.docGroupsOf(h.doc.id);
    const coverage =
      coverageTokens.length === 0
        ? 0
        : coverageTokens.filter((t) => docGroups.has(t)).length /
          coverageTokens.length;
    const titleOverlap = titleTokenOverlap(h.doc, significant);
    const semScore = semScoreById.get(h.doc.id) ?? 0;
    const boost =
      semScore >= OUT_OF_CORPUS.semBoostThreshold
        ? (semScore - OUT_OF_CORPUS.semBoostThreshold) * OUT_OF_CORPUS.semBoostScale
        : 0;
    pool.push({
      doc: h.doc,
      bm25Score: h.score,
      semScore,
      coverage,
      titleOverlap,
      // The semantic boost re-ranks any candidate whose body is a strong enough
      // embedding match — a title anchor is no longer required. The relaxed
      // titleless guard below still stops incidental name mentions.
      hybridScore: h.score + boost,
    });
    seen.add(h.doc.id);
  }

  for (const s of semanticHits) {
    if (seen.has(s.doc.id)) continue;
    const docGroups = getEngine().index.docGroupsOf(s.doc.id);
    const coverage =
      coverageTokens.length === 0
        ? 0
        : coverageTokens.filter((t) => docGroups.has(t)).length /
          coverageTokens.length;
    const titleOverlap = titleTokenOverlap(s.doc, significant);
    const boost =
      s.score >= OUT_OF_CORPUS.semBoostThreshold
        ? (s.score - OUT_OF_CORPUS.semBoostThreshold) * OUT_OF_CORPUS.semBoostScale
        : 0;
    pool.push({
      doc: s.doc,
      bm25Score: 0,
      semScore: s.score,
      coverage,
      titleOverlap,
      hybridScore: s.score >= OUT_OF_CORPUS.semBoostThreshold ? boost : 0,
    });
    seen.add(s.doc.id);
  }

  // Grounding gate 1: a candidate must be substantive AND clear the absolute
  // minimum score via BM25 or a strong semantic match.
  const grounded = pool.filter(
    (c) =>
      c.coverage > 0 &&
      (c.bm25Score >= OUT_OF_CORPUS.minAbsScore || c.semScore >= 0.5),
  );

  // Rank: hybrid score first (BM25 + semantic boost reflects how strongly the
  // rewritten query matches the doc — the best discriminator when several
  // docs cover the same topical group), then coverage, then title overlap.
  const candidates = grounded
    .map((c) => ({ ...c, matchedGroups: significant.filter((t) => getEngine().index.docGroupsOf(c.doc.id).has(t)) }))
    .sort(
      (a, b) =>
        b.hybridScore - a.hybridScore ||
        b.coverage - a.coverage ||
        b.titleOverlap - a.titleOverlap,
    );

  const best = candidates[0];
  if (!best) {
    return noSupportAnswer(lang, 0);
  }
  const coverage = best.coverage;

  // Unified grounding proof — accepts the best candidate iff it satisfies
  // EITHER a lexical proof OR a semantic proof:
  //
  //  (A) Lexical proof: the doc covers >= half the grounding tokens AND its
  //      BM25 score (against the same query the tokens came from) clears the
  //      bar. Title-anchored matches need the absolute minimum; titleless
  //      matches must clear the higher incidental-mention bar ("Khalid Bin
  //      Waleed" -> Conquest of Mecca scores ~13, far below a real topical
  //      match).
  //
  //  (B) Semantic proof (the relaxed title anchor): a strong embedding body
  //      match that is anchored in a RECOGNIZED TOPICAL GROUP the query shares
  //      with the doc. Requiring a topical-group anchor is what keeps a pure
  //      proper-name query ("Khalid Bin Waleed") — whose tokens map to no group
  //      — from ever passing through the semantic door.
  const docGroups = getEngine().index.docGroupsOf(best.doc.id);
  const topicalMatch = significant.some(
    (t) => ALIAS_GROUP_NAMES.has(t) && docGroups.has(t),
  );
  const lexicalBm25 = lexicalBm25ById.get(best.doc.id) ?? 0;
  const lexicalOk =
    best.coverage >= OUT_OF_CORPUS.minCoverage &&
    lexicalBm25 >=
      (best.titleOverlap > 0
        ? OUT_OF_CORPUS.minAbsScore
        : OUT_OF_CORPUS.titlelessMinScore);
  const semanticOk =
    topicalMatch && best.semScore >= OUT_OF_CORPUS.semTitlelessMin;

  if (!lexicalOk && !semanticOk) {
    return noSupportAnswer(lang, best.bm25Score);
  }

  // confirmed support set: best doc + close runner-ups
  const confirmed = candidates
    .filter((c) => c.hybridScore >= best.hybridScore * 0.4)
    .slice(0, 3);

  const sourcesForText = confirmed.map((c) => ({ doc: c.doc }));

  // Deterministic grounded generation: the only answer path (zero-hallucination,
  // spec-mandated safe fallback). No external LLM is used.
  const text = generateDeterministicAnswer(sourcesForText, target);
  // Report the retrieval engine honestly: if the winning candidate carried a
  // real cosine score the hybrid/semantic pipeline executed, otherwise the
  // answer was grounded by BM25 alone.
  const engine: Answer["engine"] = best.semScore > 0 ? "hybrid" : "deterministic";

  const citations = confirmed.map((c) => c.doc.citation);

  return {
    status: "answered",
    text,
    lang,
    citations,
    engine,
    ...(rewrittenQuery ? { rewrittenQuery } : {}),
    semantic: {
      available: semanticHits.length > 0,
      used: best.semScore > 0,
    },
    disclaimer: getDisclaimer(),
    corpusVersion: getEngine().corpus.corpusVersion,
    matched: {
      topScore: best.bm25Score,
      coverage,
      topDocId: best.doc.id,
      semScore: best.semScore,
    },
  };
}