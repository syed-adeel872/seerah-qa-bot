/**
 * LLM-powered answer generation.
 *
 * Takes retrieved corpus passages and the user's question, then uses an LLM
 * to produce a concise, direct, natural-language answer. Falls back to the
 * deterministic generator when the LLM is unavailable or fails.
 */

import type { AnswerTarget } from "./generate";

const SYSTEM_PROMPT_EN = `You are a Seerah & Shamail assistant answering questions about the Prophet Muhammad ﷺ.

CRITICAL RULES:
1. SYNTHESIZE THE CONTEXT: The "Retrieved corpus passages" below contain the answer. You MUST read them carefully, extract the relevant details, and write a clear, descriptive answer. Never ignore the context or say information is unavailable when it is right there in the passages.
2. BASE ONLY ON CONTEXT: Write your entire answer using ONLY facts from the provided passages. Do not add external knowledge. But you MUST describe and explain what the passages say — do not just list references.
3. BE DESCRIPTIVE: If the context describes the Prophet's appearance, habits, or events, describe them in full sentences. Example: If the context says "His beard was thick and long," write "The Prophet ﷺ had a thick, full beard that he kept well-groomed." Do NOT just output the raw text.
4. ONLY REFUSE when the topic is completely absent from all provided passages, or when asked for a religious ruling (fatwa). If the passages mention the topic at all, you MUST generate an answer.
5. NO FLUFF: Do not repeat the question. Do not add meta-commentary. Just give the answer.`;

const SYSTEM_PROMPT_ROMAN_UR = `Tum Seerah aur Shamail ke assistant ho — Nabi ﷺ ke baare mein sawalaat ka jawab dete ho.

SABSE ZAROORI RULES:
1. CONTEXT SE JAWAB NIKALO: Neeche "Retrieved corpus passages" mein jawab maujood hai. Tumhein un passages ko dhyan se parhna hai, zaroori baatein nikaalni hain, aur saaf saaf descriptive jawab likhna hai. Kabhi mat kaho "maloomat available nahi hai" jab context mein sab kuch likha ho.
2. SIRF CONTEXT PE LIKHO: Apna poora jawab sirf passages mein likhi baaton par likho. Bahar ka knowledge mat daalo. Lekin passages jo batate hain usko achi tarah describe karo — sirf references mat daalo.
3. DESCRIBIVE LIKHO: Agar context mein Nabi ﷺ ki shakal, aadat ya koi waqiya describe hua hai, toh poori baat samajh ke likho. Jaise agar likha hai "baal lamba aur ghana tha," toh likho "Nabi ﷺ ke baal lambay aur ghane thay aur woh unka khayal rakhtay thay." Sirf raw text mat daal do.
4. SIRF TAB MANA KARO jab topic bilkul bhi context mein na ho, ya fatwa maanga ja raha ho. Agar passages mein topic ka zikr hai toh jawab dena ZAROORI hai.
5. FIZool BAAT MAT KARO: Sawal mat dohrao. Sirf jawab do.`;

const SYSTEM_PROMPT_UR = `آپ سیروت و شمائل کے اسسٹنٹ ہیں — نبی ﷺ کے بارے میں سوالات کا جواب دیتے ہیں۔

انتہاً اہم اصول:
1. سیاق و سباق سے جواب نکالیں: نیچے "Retrieved corpus passages" میں جواب موجود ہے۔ آپ کو ان قطعات کو غور سے پڑھنا ہے، ضروری باتیں نکالنی ہیں، اور صاف صاف تفصیلی جواب لکھنا ہے۔ کبھی mat کہیں "معلومات دستیاب نہیں ہیں" جب سیاق و سباق میں سب کچھ لکھا ہو۔
2. صرف سیاق و سباق پر لکھیں: اپنا پورا جواب صرف قطعات میں لکھی باتوں پر لکھیں۔ باہر کا علم نہ ڈالیں۔ لیکن قطعات جو بتاتے ہیں اسے اچھی طرح بیان کریں — صرف حوالہ جات مت ڈالیں۔
3. تفصیلی لکھیں: اگر قطعات میں نبی ﷺ کی شکل، عادات یا کوئی واقعہ بیان ہوا ہے تو پوری بات سمجھ کر لکھیں۔ صرف خام متن مت ڈال دیں۔
4. صرف اس وقت انکار کریں جب ٹاپک بالکل بھی قطعات میں نہ ہو، یا فتوہ مانگا جا رہا ہو۔ اگر قطعات میں ٹاپک کا ذکر ہے تو جواب دینا لازمی ہے۔
5. فضلول بات نہ کریں: سوال دہرائیں نہیں۔ صرف جواب دیں۔`;

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
            max_tokens: 500,
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
