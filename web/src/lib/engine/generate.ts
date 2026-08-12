import type { IndexedDoc } from "../corpus/schema";

/**
 * Deterministic, zero-hallucination answer builder.
 * Generates a grounded response exclusively from the retrieved corpus
 * documents — no invented hadith, no opinions. Used by default (offline)
 * and as the fallback whenever an LLM result fails post-verification.
 */

function trimExcerpt(text: string, max = 420): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.lastIndexOf(" ", max);
  return `${t.slice(0, cut > 0 ? cut : max)}…`;
}

/** Split an entry's plain text into paragraphs. */
function paragraphs(lang: "en" | "ur", doc: IndexedDoc): string[] {
  const text = lang === "ur" ? doc.textUr : doc.textEn;
  return text
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Build the reply text for the selected source documents using their corpus
 * text verbatim. Timeline entries yield a focused excerpt; shamail entries
 * yield the narration plus up to two of the entry's own key points.
 */
export function generateDeterministicAnswer(
  sources: Array<{ doc: IndexedDoc }>,
  lang: "en" | "ur",
): string {
  const ur = lang === "ur";
  const parts: string[] = [];

  parts.push(ur ? "ذخیرے (شمائل + سیرت ٹائم لائن) سے ماخوذ جواب" : "Based on the Seerah & Shamail corpus");
  parts.push("");

  sources.forEach(({ doc }, i) => {
    const n = i + 1;
    const title = lang === "ur" ? doc.titleUr || doc.titleEn : doc.titleEn;
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
        parts.push(ur ? "اہم نکات" : "Key points");
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

  parts.push(
    ur
      ? "مندرجہ بالا جواب صرف اوپر دیے گئے ذخیرے کے اندراجات سے لیا گیا ہے؛ ماخذ کے کارڈ نیچے موجود ہیں۔"
      : "Every statement above is drawn only from the cited corpus entries; source cards are listed below.",
  );

  return parts.join("\n");
}