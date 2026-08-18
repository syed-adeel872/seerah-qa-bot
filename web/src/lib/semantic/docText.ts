import type { IndexedDoc } from "../corpus/schema";

/**
 * Builds the canonical text used to embed each corpus entry. This MUST stay
 * identical between the offline precompute script (scripts/embed-corpus.mjs)
 * and the runtime SemanticIndex, otherwise cached vectors won't match the
 * live documents.
 *
 * Both English and Urdu text (plus keywords and the roman-Urdu slug) are
 * packed into one vector so a query in any of the three languages lands near
 * the same entry.
 */
export function docEmbedText(doc: IndexedDoc): string {
  const title = `${doc.titleEn} | ${doc.titleUr || ""}`;
  const keywords = doc.fields.keywords || "";
  const bodyEn = doc.textEn.slice(0, 700);
  const bodyUr = doc.textUr.slice(0, 700);
  const slug = doc.citation.slug ? `${doc.citation.slug.en} ${doc.citation.slug.romanUrdu}` : "";
  return [title, keywords, bodyEn, bodyUr, slug].filter(Boolean).join("\n");
}