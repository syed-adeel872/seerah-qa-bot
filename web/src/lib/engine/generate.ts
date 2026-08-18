import type { IndexedDoc } from "../corpus/schema";
import { urduToRoman } from "../l10n/translit";

/**
 * Deterministic, zero-hallucination answer builder.
 * Generates a grounded response exclusively from the retrieved corpus
 * documents — no invented hadith, no opinions. Used by default (offline)
 * and as the fallback whenever an LLM result fails post-verification.
 */

export type AnswerTarget = "en" | "ur" | "roman-ur";

function trimExcerpt(text: string, max = 420): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.lastIndexOf(" ", max);
  return `${t.slice(0, cut > 0 ? cut : max)}…`;
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
 * Build the reply text for the selected source documents using their corpus
 * text verbatim. Timeline entries yield a focused excerpt; shamail entries
 * yield the narration plus up to two of the entry's own key points.
 */
export function generateDeterministicAnswer(
  sources: Array<{ doc: IndexedDoc }>,
  lang: AnswerTarget,
): string {
  const parts: string[] = [];

  const intro =
    lang === "ur"
      ? "ذخیرے (شمائل + سیرت ٹائم لائن) سے ماخوذ جواب"
      : lang === "roman-ur"
        ? "Seerah aur Shamail corpus se makhuz jawab"
        : "Based on the Seerah & Shamail corpus";
  parts.push(intro);
  parts.push("");

  sources.forEach(({ doc }, i) => {
    const n = i + 1;
    const title =
      lang === "ur" ? doc.titleUr || doc.titleEn : lang === "roman-ur" ? romanTitle(doc) : doc.titleEn;
    parts.push(`[${n}] ${title}`);
    parts.push("");

    const paras = paragraphs(lang, doc);

    if (doc.source === "shamail") {
      // narration = entry text; trailing "points" paragraphs hold lessons.
      const narration = paras[0] ?? "";
      parts.push(trimExcerpt(narration, 600));
      parts.push("");

      const tail = paras.slice(-2);
      const bullets: string[] = [];
      for (const p of tail) {
        bullets.push(
          ...p
            .split(/\n+|\*+|•+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 10),
        );
      }
      const picked = bullets.slice(0, 2);
      if (picked.length > 0) {
        const keyHeader =
          lang === "ur" ? "اہم نکات" : lang === "roman-ur" ? "Ehmi nikat" : "Key points";
        parts.push(keyHeader);
        parts.push("");
        for (const b of picked) {
          parts.push(`- ${trimExcerpt(b, 220)}`);
        }
        parts.push("");
      }
    } else {
      const excerpt = trimExcerpt(paras.join(" "), 700);
      parts.push(excerpt);
      parts.push("");
    }
  });

  const closing =
    lang === "ur"
      ? "مندرجہ بالا جواب صرف اوپر دیے گئے ذخیرے کے اندراجات سے لیا گیا ہے؛ ماخذ کے کارڈ نیچے موجود ہیں۔"
      : lang === "roman-ur"
        ? "Upar diya gaya jawab sirf in corpus entries se liya gaya hai; sources ke cards neeche hain."
        : "Every statement above is drawn only from the cited corpus entries; source cards are listed below.";

  parts.push(closing);

  return parts.join("\n");
}