/**
 * LLM-powered answer generation.
 *
 * Takes retrieved corpus passages and the user's question, then uses an LLM
 * to produce a concise, direct, natural-language answer. Falls back to the
 * deterministic generator when the LLM is unavailable or fails.
 */

import type { AnswerTarget } from "./generate";

const SYSTEM_PROMPT_EN = `You are a Seerah & Shamail assistant. You answer ONLY from the provided corpus passages. Rules:

1. BE DIRECT: Answer the exact question asked. Do NOT dump the entire passage. Extract ONLY the specific information relevant to the user's query. Keep answers short — 1 to 3 sentences max unless more detail is truly needed.

2. NATURAL LANGUAGE: Write like a knowledgeable friend explaining something simply. No bullet points, no headers, no database formatting. Just clear, flowing prose.

3. ZERO HALLUCINATION: Only state facts present in the provided passages. If the passages don't contain enough to answer, say so briefly. Never invent details.

4. NO EXTRA FLUFF: Do not repeat the question. Do not add disclaimers or meta-commentary. Just answer.`;

const SYSTEM_PROMPT_ROMAN_UR = `You are a Seerah & Shamail assistant. You answer ONLY from the provided corpus passages. Rules:

1. BE DIRECT: Answer the exact question asked. Do NOT dump the entire passage. Extract ONLY the specific information relevant to the user's query. Keep answers short — 1 to 3 sentences max.

2. NATURAL ROMAN URDU: Reply in simple, everyday, modern conversational Roman Urdu — like how a Pakistani person would text or chat on WhatsApp. Use common words. Example: "Nabi ﷺ ka rang gori aur chamakdar tha" NOT "Nabi ﷺ ka rang f walnut rang jaisa gori thi". Use "ka/ki/ke", "hai/hain", "tha/thi/thay", "aur", "mein", "ko" naturally. NEVER use heavy, archaic, or classical Urdu vocabulary. NEVER generate nonsensical literal transliterations of Urdu words. If a concept is hard to say in Roman Urdu, explain it in the simplest possible terms.

3. ZERO HALLUCINATION: Only state facts present in the provided passages. If the passages don't have enough info, say "Is bare mein mazeed maloomat available nahi hai" briefly. Never invent details.

4. NO EXTRA FLUFF: Do not repeat the question. Do not add disclaimers. Just answer naturally.`;

const SYSTEM_PROMPT_UR = `آپ صرف فراہم کردہ سیروت و شمائل کے قطعات سے جواب دیتے ہیں۔ قواعد:

1. براہ راست جواب دیں: صرف وہ بتائیں جو سوال سے مطابقت رکھتا ہے۔ مکمل قطعہ مت ڈالیں۔ 1 سے 3 جملوں میں جواب دیں۔

2. سادہ اردو: عام بول چال کی اردو میں لکھیں۔ عجیب یا کلاسیکی الفاظ استعمال نہ کریں۔

3. کوئی اختلاق نہیں: صرف قطعات میں موجود حقائق بتائیں۔ اگر معلومات کافی نہ ہوں تو مختصر میں بتائیں۔

4. فضول بات نہ کریں: سوال دہرائیں نہیں۔ صرف جواب دیں۔`;

function isLlmConfigured(): boolean {
  return Boolean(
    process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL,
  );
}

function modelCandidates(): string[] {
  const fromEnv = [
    process.env.LLM_MODEL,
    ...(process.env.LLM_MODEL_FALLBACKS ?? "").split(",").map((s) => s.trim()),
  ].filter((s) => s && s.length > 0) as string[];
  const seen = new Set<string>();
  return fromEnv.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));
}

function systemPromptForLang(lang: AnswerTarget): string {
  if (lang === "ur") return SYSTEM_PROMPT_UR;
  if (lang === "roman-ur") return SYSTEM_PROMPT_ROMAN_UR;
  return SYSTEM_PROMPT_EN;
}

/**
 * Build a context block from retrieved passages for the LLM.
 */
function buildContext(
  question: string,
  sources: Array<{ doc: { titleEn: string; titleUr: string; textEn: string; textUr: string } }>,
  lang: AnswerTarget,
): string {
  const lines: string[] = [];
  lines.push(`User question: ${question}`);
  lines.push("");
  lines.push("Retrieved corpus passages:");
  for (let i = 0; i < sources.length; i++) {
    const { doc } = sources[i];
    const title = lang === "ur" ? doc.titleUr : doc.titleEn;
    const text = lang === "ur" ? doc.textUr : doc.textEn;
    lines.push(`[${i + 1}] ${title}`);
    // Truncate each passage to keep context focused
    const truncated = text.length > 800 ? text.slice(0, 800) + "…" : text;
    lines.push(truncated);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Generate an answer using the LLM. Returns null on any failure so the
 * caller can fall back to deterministic generation.
 */
export async function generateWithLlm(
  question: string,
  sources: Array<{ doc: { titleEn: string; titleUr: string; textEn: string; textUr: string } }>,
  lang: AnswerTarget,
): Promise<string | null> {
  if (!isLlmConfigured()) return null;

  const systemPrompt = systemPromptForLang(lang);
  const context = buildContext(question, sources, lang);

  const base = `${(process.env.LLM_BASE_URL ?? "").replace(/\/+$/, "")}/chat/completions`;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.LLM_API_KEY}`,
  };

  for (const model of modelCandidates()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(base, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: context },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
          signal: AbortSignal.timeout(attempt === 0 ? 20000 : 10000),
        });
        if (!res.ok) {
          const retryable = res.status === 429 || res.status >= 500;
          if (!retryable || attempt === 1) break;
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = (json?.choices?.[0]?.message?.content ?? "").trim();
        if (text && text.length > 10) return text;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  return null;
}
