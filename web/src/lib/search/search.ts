import { loadCorpus, fetchCorpusFromAPI, type Corpus } from "../corpus/load";
import { BM25Index, type SearchHit, type SearchParams } from "./bm25";
import { expandQuestion } from "./tokenize";
import { SemanticIndex, type SemanticHit } from "../semantic/index";

let corpusSingleton: Corpus | null = null;
let indexSingleton: BM25Index | null = null;
let semanticSingleton: SemanticIndex | null = null;

/** TTL for the live corpus in memory (spec API is rate-limited to 60 req/min/IP). */
const LIVE_CORPUS_TTL_MS = 15 * 60 * 1000;
let liveCorpusLoadedAt = 0;
let liveCorpusAttempted = false;

/** Get the shared in-memory corpus + BM25 index (lazy, cached). */
export function getEngine(): { corpus: Corpus; index: BM25Index } {
  if (!corpusSingleton) corpusSingleton = loadCorpus();
  if (!indexSingleton) indexSingleton = new BM25Index(corpusSingleton.docs);
  return { corpus: corpusSingleton, index: indexSingleton };
}

/**
 * Get the shared semantic (embedding) index. Built over the same docs as the
 * BM25 index. Best-effort: when embeddings are unavailable the semantic
 * search returns [] and the deterministic pipeline is unaffected.
 */
export function getSemantic(): SemanticIndex | null {
  if (!corpusSingleton) corpusSingleton = loadCorpus();
  if (!semanticSingleton) semanticSingleton = new SemanticIndex(corpusSingleton.docs);
  return semanticSingleton;
}

/** Semantic (embedding) search over the corpus. Returns [] on any failure. */
export async function searchSemantic(
  query: string,
  topK = 8,
): Promise<SemanticHit[]> {
  try {
    const sem = getSemantic();
    if (!sem) return [];
    return await sem.search(query, topK);
  } catch {
    return [];
  }
}

/**
 * Warm the corpus from the live /api/seerathon/corpus API (spec-mandated
 * runtime source). Fails closed to the frozen snapshot on any error, and is
 * cached in memory for LIVE_CORPUS_TTL_MS to respect the API rate limit.
 * Callers awaiting this before serving an answer get the freshest corpus.
 */
export async function ensureLiveCorpus(): Promise<void> {
  if (corpusSingleton && Date.now() - liveCorpusLoadedAt < LIVE_CORPUS_TTL_MS) return;
  if (liveCorpusAttempted && !corpusSingleton) return;
  liveCorpusAttempted = true;
  try {
    const live = await fetchCorpusFromAPI();
    corpusSingleton = live;
    indexSingleton = new BM25Index(live.docs);
    semanticSingleton = new SemanticIndex(live.docs);
    liveCorpusLoadedAt = Date.now();
    console.log(
      `[corpus] live API loaded: ${live.counts.shamail} shamail, ${live.counts.timeline} timeline, ` +
        `v${live.corpusVersion} (${live.generatedAt})`,
    );
  } catch (err) {
    console.error(
      `[corpus] live API fetch failed — using frozen snapshot: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface SearchResult {
  hits: SearchHit[];
  query: string;
  expandedQuery: string;
  matchedCategories: string[];
  matchedSections: string[];
  corpus: {
    shamail: number;
    timeline: number;
    courses: number;
    version: string;
  };
}

/** Ranked retrieval across the whole corpus (Shamail + Timeline). */
export function search(query: string, params: SearchParams = {}): SearchResult {
  const { corpus, index } = getEngine();
  // Synonym-mapping layer: normalize + expand roman-Urdu/Urdu synonyms to
  // their canonical English corpus keywords before lexical retrieval.
  const expandedQuery = expandQuestion(query);
  const hits = index.search(expandedQuery, params);

  const matchedCategories = new Set<string>();
  const matchedSections = new Set<string>();
  for (const h of hits) {
    if (h.doc.source === "shamail" && h.doc.citation.category) {
      matchedCategories.add(h.doc.citation.category.id);
    } else if (h.doc.source === "timeline" && h.doc.citation.section) {
      matchedSections.add(h.doc.citation.section);
    }
  }

  return {
    hits,
    query,
    expandedQuery,
    matchedCategories: [...matchedCategories],
    matchedSections: [...matchedSections],
    corpus: {
      shamail: corpus.counts.shamail,
      timeline: corpus.counts.timeline,
      courses: corpus.counts.courses,
      version: corpus.corpusVersion,
    },
  };
}

export { BM25Index };
export type { SearchHit, SearchParams };
