import type { IndexedDoc } from "../corpus/schema";
import { tokenize, queryTokens } from "./tokenize";

/**
 * Weighted per-field BM25 retrieval over the normalized corpus.
 * Fields: title / keywords / body / slug, each with an idf-aware BM25 score.
 */

export interface SearchHit {
  doc: IndexedDoc;
  score: number;
  /** Conflated query groups that matched at least one field (for explainability). */
  matchedGroups: string[];
  /** True if a substantive field (title/body/keywords) matched — not just slug noise. */
  substantive: boolean;
}

export interface SearchParams {
  topK?: number;
  k1?: number;
  b?: number;
  fieldWeights?: Partial<Record<FieldName, number>>;
}

export type FieldName = "title" | "keywords" | "body" | "slug";

const FIELD_WEIGHTS: Record<FieldName, number> = {
  title: 4,
  keywords: 3,
  body: 2,
  slug: 1,
};

const SUBSTANTIVE_FIELDS: FieldName[] = ["title", "keywords", "body"];

export class BM25Index {
  private docs: IndexedDoc[];
  private tokenized: Map<string, Map<FieldName, string[]>>;
  private docCount = 0;
  private df = new Map<FieldName, Map<string, number>>();
  private docLen = new Map<string, Map<FieldName, number>>();
  private avgLen = new Map<FieldName, number>();
  /** Unique conflated token groups per doc across ALL fields (grounding checks). */
  private docGroups = new Map<string, Set<string>>();

  constructor(docs: IndexedDoc[]) {
    this.docs = docs;
    this.tokenized = new Map();
    const fieldTotal = new Map<FieldName, number>();
    const fieldCount = new Map<FieldName, number>();

    for (const doc of docs) {
      const perField = new Map<FieldName, string[]>();
      for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
        const toks = tokenize(doc.fields[field]);
        perField.set(field, toks);
        fieldTotal.set(field, (fieldTotal.get(field) ?? 0) + toks.length);
        fieldCount.set(field, (fieldCount.get(field) ?? 0) + 1);
      }
      this.tokenized.set(doc.id, perField);
      this.docLen.set(doc.id, new Map());
      for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
        this.docLen.get(doc.id)!.set(field, perField.get(field)!.length);
      }
      const groups = new Set<string>();
      for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
        for (const t of perField.get(field)!) groups.add(t);
      }
      this.docGroups.set(doc.id, groups);
    }

    this.docCount = docs.length;
    for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
      const total = fieldTotal.get(field) ?? 0;
      const count = fieldCount.get(field) ?? 0;
      this.avgLen.set(field, count === 0 ? 0 : total / count);
    }

    // document frequency per field
    for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
      const dfMap = new Map<string, number>();
      for (const doc of docs) {
        for (const t of new Set(this.tokenized.get(doc.id)!.get(field)!)) {
          dfMap.set(t, (dfMap.get(t) ?? 0) + 1);
        }
      }
      this.df.set(field, dfMap);
    }
  }

  private idf(field: FieldName, term: string): number {
    const dfMap = this.df.get(field)!;
    const df = dfMap.get(term) ?? 0;
    return Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));
  }

  /** Unique conflated token groups present in a document (any field). */
  docGroupsOf(docId: string): Set<string> {
    return this.docGroups.get(docId) ?? new Set<string>();
  }

  search(query: string, params: SearchParams = {}): SearchHit[] {
    const topK = params.topK ?? 8;
    const k1 = params.k1 ?? 1.5;
    const b = params.b ?? 0.75;
    const weights: Record<FieldName, number> = { ...FIELD_WEIGHTS, ...params.fieldWeights };
    const qTokens = queryTokens(query);
    if (qTokens.length === 0) return [];

    const scored: Array<{ hit: SearchHit; doc: IndexedDoc }> = [];

    for (const doc of this.docs) {
      const toks = this.tokenized.get(doc.id)!;
      let total = 0;
      const matched = new Set<string>();
      let substantive = false;

      for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
        const fieldToks = toks.get(field)!;
        const fieldTf = new Map<string, number>();
        for (const t of fieldToks) fieldTf.set(t, (fieldTf.get(t) ?? 0) + 1);
        const dl = this.docLen.get(doc.id)!.get(field)!;
        const avg = this.avgLen.get(field)!;
        const w = weights[field];

        for (const qt of qTokens) {
          const tf = fieldTf.get(qt) ?? 0;
          if (tf === 0) continue;
          const idf = this.idf(field, qt);
          const denom = tf + k1 * (1 - b + b * (avg === 0 ? 0 : dl / avg));
          total += w * idf * ((tf * (k1 + 1)) / (denom || 1));
          matched.add(qt);
          if (SUBSTANTIVE_FIELDS.includes(field)) substantive = true;
        }
      }

      if (total > 0) {
        scored.push({
          hit: { doc, score: total, matchedGroups: [...matched], substantive },
          doc,
        });
      }
    }

    scored.sort((a, b) => b.hit.score - a.hit.score);
    return scored.slice(0, topK).map((s) => s.hit);
  }
}
