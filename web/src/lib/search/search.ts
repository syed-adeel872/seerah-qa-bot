import { loadCorpus, type Corpus } from "../corpus/load";
import { BM25Index, type SearchHit, type SearchParams } from "./bm25";

let corpusSingleton: Corpus | null = null;
let indexSingleton: BM25Index | null = null;

/** Get the shared in-memory corpus + BM25 index (lazy, cached). */
export function getEngine(): { corpus: Corpus; index: BM25Index } {
  if (!corpusSingleton) corpusSingleton = loadCorpus();
  if (!indexSingleton) indexSingleton = new BM25Index(corpusSingleton.docs);
  return { corpus: corpusSingleton, index: indexSingleton };
}

export interface SearchResult {
  hits: SearchHit[];
  query: string;
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
  const hits = index.search(query, params);

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
