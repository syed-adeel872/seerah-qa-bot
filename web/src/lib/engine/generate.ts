import type { IndexedDoc } from "../corpus/schema";
import { urduToRoman } from "../l10n/translit";

/**
 * Deterministic, zero-hallucination answer builder.
 * Generates a grounded response exclusively from the retrieved corpus
 * documents — no invented hadith, no opinions. Used by default (offline)
 * and as the fallback whenever an LLM result fails post-verification.
 *
 * This generator synthesizes the retrieved context into natural,
 * cohesive, flowing paragraphs. It does NOT output raw database fields,
 * "Key points" headings, bracketed numbers, or raw bulleted lists.
 */

export type AnswerTarget = "en" | "ur" | "roman-ur";

function trimExcerpt(text: string, max = 420): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.lastIndexOf(" ", max);
  return `${t.slice(0, cut > 0 ? cut : max)}…`;
}

/**
 * Strip raw database formatting artifacts from corpus text so the output
 * reads as natural prose rather than structured database fields.
 */
function cleanText(text: string): string {
  return text
    // Remove markdown-style headings: ## Heading, **Heading**, # Heading
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Remove "Key points" / "Ehmi nikat" / "اہم نکات" section headers
    .replace(/^(Key\s+points|Ehmi\s+nikat|اہم\s+نکات)\s*:?\s*$/gim, "")
    // Remove bracketed list numbers: [1], [2], etc. at line starts
    .replace(/^\[[\d]+\]\s*/gm, "")
    // Normalize bullet markers to flowing text
    .replace(/^[\s]*[-*•]\s+/gm, "")
    // Collapse multiple blank lines into a single paragraph break
    .replace(/\n{3,}/g, "\n\n")
    // Trim
    .replace(/\s+/g, " ")
    .trim();
}

/** Split an entry's plain text into paragraphs. */
function paragraphs(lang: AnswerTarget, doc: IndexedDoc): string[] {
  let text: string;
  if (lang === "en") text = doc.textEn;
  else if (lang === "ur") text = doc.textUr;
  else text = urduToRoman(doc.textUr);
  return text
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Roman-Urdu title: the corpus's own slug.romanUrdu (e.g. huzoor-ka-salan-mubarak). */
function romanTitle(doc: IndexedDoc): string {
  const slug = doc.citation.slug?.romanUrdu;
  if (slug) return slug.replace(/-/g, " ").trim();
  return urduToRoman(doc.titleUr) || doc.titleEn;
}

/**
 * Extract the most relevant passage from a document for natural integration.
 * Cleans raw formatting artifacts and returns a single flowing excerpt.
 */
function extractPassage(lang: AnswerTarget, doc: IndexedDoc): string {
  const paras = paragraphs(lang, doc);

  if (doc.source === "shamail") {
    // Take the narration (first paragraph) as the primary passage
    const narration = cleanText(paras[0] ?? "");
    const excerpt = trimExcerpt(narration, 500);

    // Gather lessons from tail paragraphs (cleaned, no heading)
    const tail = paras.slice(-2);
    const lessons: string[] = [];
    for (const p of tail) {
      const items = cleanText(p)
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10);
      lessons.push(...items);
    }
    const lesson = lessons[0] ? ` ${trimExcerpt(lessons[0], 200)}` : "";
    return excerpt + lesson;
  }

  // For timeline, take the full text as a flowing passage
  return trimExcerpt(cleanText(paras.join(" ")), 600);
}

/**
 * Build the reply text for the selected source documents using their corpus
 * text verbatim. The response is woven into natural, conversational paragraphs
 * — no raw headings, no bracketed numbers, no bulleted lists from the database.
 */
export function generateDeterministicAnswer(
  sources: Array<{ doc: IndexedDoc }>,
  lang: AnswerTarget,
): string {
  const passages = sources.map(({ doc }) => {
    const passage = extractPassage(lang, doc);
    return passage;
  });

  const parts: string[] = [];

  if (lang === "ur") {
    // Urdu: flowing natural paragraphs without title brackets
    for (const passage of passages) {
      parts.push(passage);
    }
    parts.push("");
    parts.push("مندرجہ بالا جواب صرف ذکر کردہ سیرت و شمائل کے اندراجات پر مبنی ہے۔");
  } else if (lang === "roman-ur") {
    // Roman Urdu: flowing natural paragraphs
    for (const passage of passages) {
      parts.push(passage);
    }
    parts.push("");
    parts.push("Upar diya gaya jawab sirf zikr kiye gaye corpus entries par mabni hai.");
  } else {
    // English: natural flowing paragraphs
    for (const passage of passages) {
      parts.push(passage);
    }
    parts.push("");
    parts.push("The above is based on the cited Seerah and Shamail sources.");
  }

  return parts.join("\n");
}