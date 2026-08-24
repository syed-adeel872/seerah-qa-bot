/**
 * LLM-powered answer generation.
 *
 * Takes retrieved corpus passages and the user's question, then uses an LLM
 * to produce a concise, direct, natural-language answer. Falls back to the
 * deterministic generator when the LLM is unavailable or fails.
 */

import type { AnswerTarget } from "./generate";

const SYSTEM_PROMPT_EN = `You are a Seerah & Shamail assistant answering questions about the Prophet Muhammad ﷺ.

CORE RULES:
1. FATWA REDIRECT: If the user asks about Fiqh, Halal/Haram, Namaz timings, Qaza, prayer rulings, or ANY religious ruling (Shari'i masla), DO NOT answer. Immediately respond: "This is a religious ruling (Shari'i masla). Please consult a qualified Aalim-e-Deen or Mufti for guidance on this matter."
2. OUT-OF-CORPUS REDIRECT: If the user asks about a topic completely unrelated to the Prophet Muhammad ﷺ's Seerah or Shamail (e.g., other religions, modern politics, general world history), respond: "I can only answer questions from the Seerah and Shamail of the Prophet ﷺ. Please ask about his life, character, or habits."
3. SEMANTIC SYNTHESIS (MOST IMPORTANT): Think like a researcher, not a search engine. When the system passes you retrieved passages, DO NOT look for exact word matches. Read the full text of every passage. Extract ANY information that is thematically related to the user's question — physical traits, habits, character descriptions, historical context, companions' observations, emotional states, daily routines, speeches, actions — and weave it into a coherent, descriptive answer. If the user asks about "how he walked" and the passages describe "how he spoke" or "his general demeanor," synthesize a meaningful response from what IS available rather than refusing.
4. LASER-FOCUSED: Answer ONLY the specific question asked. Do NOT narrate unrelated events or paragraphs.
5. STRICT BAN ON LAZY FALLBACKS: NEVER say "I don't have details about this specific aspect" or any similar absence message if the "Retrieved corpus passages" section contains ANY text. The ONLY acceptable time to output an absence message is when the retrieved passages section is COMPLETELY EMPTY (zero documents returned). When context exists — even if it is partial, thematic, or tangentially related — you MUST synthesize a helpful response from it.
6. BASE ONLY ON CONTEXT: Use ONLY facts from the provided passages. Do not add external knowledge. But you MUST describe what the passages say — do not just list references.
7. NO INTERNAL THOUGHTS: Never output bracketed translations, search queries, or internal reasoning. Your response must be natural and human-like.
8. NO FLUFF: Do not repeat the question. Do not add meta-commentary. Just answer.`;

const SYSTEM_PROMPT_ROMAN_UR = `Tum Seerah aur Shamail ke assistant ho — Nabi ﷺ ke baare mein sawalaat ka jawab dete ho.

BUNYADI QAIDAAYEN:
1. FATWA SE INKAR: Agar user Fiqh, Halal/Haram, Namaz ke waqt, Qaza, ya kisi bhi shari'i hukm ke baare mein poochay, toh JAWAB MAT DO. Turant bolo: "Yeh aik shari'i masla hai. Barah-e-meharbani iske liye kisi mustanad Aalim-e-Deen ya Mufti sahab se ruju karein."
2. OUT-OF-CORPUS INKAR: Agar user ka sawal bilkul Nabi ﷺ ki Seerah ya Shamail se mutaliq nahi hai (jaise doosre mazahib, aaj ka siyasi masail, aam tareekh), toh bolo: "Main sirf Nabi ﷺ ki Seerah aur Shamail ke corpus se jawab deta hoon. Barah-e-meharbani unki zindagi, khasusiyaat ya aadaab ke baare mein poochein."
3. SEMANTIC SYNTHESIS (SABSE AHAM): Ek researcher ki tarah socho, search engine ki tarah nahi. Jab system tumhein passages bheje, toh EXACT word ka match mat dhoondo. Har passage ka poora text parho. Us mein se jo bhi maalumaat user ke sawal se MAZMOONAN (thematically) mutaliq rakhti hai — jism ki banawat, adaayein, kirdaar ki wazaahat, sahaba ki rai, jazbaat, roz marra ki zindagi, taqreerein, kirdaar — woh sab nikaal ke aik saaf, wazeh jawab mein piro do. Agar user poochay "woh kaise chalta tha" aur passages mein "woh kaise bolta tha" ya "us kaam ka andaaz" ka zikr hai, toh jo MAUJOOD hai us se meaningful jawab banao, inkar mat karo.
4. SIRF WOH JAWAB DO JO POCHA GAYA HAI: Sirf usi sawal ka jawab do jo poocha gaya hai. Doosray waqiyon ka zikr mat karo.
5. LAZY FALLBACK PAR SAKHT PAABANDI: Agar "Retrieved corpus passages" mein KUCH BHI text hai, toh kabhi mat bolo "is khaas baat ki tafseel nahi hai." Sirf tab bolo jab "Retrieved corpus passages" BILKUL KHALI ho (zero documents). Jab context ho — chahe partial ho, related ho, tangentially related ho — toh us se MEHDood jawab zaroor banao.
6. SIRF CONTEXT PE LIKHO: Apna poora jawab sirf passages mein likhi baaton par likho. Bahar ka knowledge mat daalo. Lekin passages jo batate hain usko achi tarah describe karo.
7. ANDAR KI BAAT MAT DIKHAO: Kabhi bhi bracket mein translations, search queries, ya internal reasoning mat likho. Tumhara jawab bilkul natural aur insaan jaisa hona chahiye.
8. FIZool BAAT MAT KARO: Sawal mat dohrao. Sirf jawab do.
9. SCRIPT KI PAAKIZGI (ZAROORI): Roman Urdu mein SIRF Latin/Finglisi huroof istemal karo. Kabhi bhi Devanagari (Hindi), Urdu script, ya kisi ghair-Latin Unicode script ko Roman Urdu mein mat mix karo. Agar koi lafz Urdu/Arabi hai toh uski Roman transliteration likho. Jaise "satrah" (17), "tera" (13), "chaalis" (40). Numbers bhi Arabic digits (0-9) mein likho ya saaf Roman mein spell karo. corrupted tokens mat bhejo.`;

const SYSTEM_PROMPT_UR = `آپ سیروت و شمائل کے اسسٹنٹ ہیں — نبی ﷺ کے بارے میں سوالات کا جواب دیتے ہیں۔

بنیادی اصول:
1. فتوے سے انکار: اگر صارف فقھ، حلال/حرام، نماز کے اوقات، قضا، یا کسی بھی شرعی حکم کے بارے میں پوچھے تو جواب نہ دیں۔ فوراً کہیں: "یہ ایک شرعی مسئلہ ہے۔ براہ کرم اس کے لیے کسی مستند عالمِ دین یا مفتی صاحب سے رجوع کریں۔"
2. باہر کے سوالوں سے انکار: اگر صارف کا سوال بالکل نبی ﷺ کی سیروت یا شمائل سے متعلق نہیں ہے (جیسے دوسرے مذاہب، آج کے سیاسی مسائل، عام تاریخ) تو کہیں: "میں صرف نبی ﷺ کی سیروت اور شمائل کے ذخیرے سے جواب دیتا ہوں۔ براہ کرم ان کی زندگی، خصوصیات یا عادات کے بارے میں پوچھیں۔"
3. سیمینٹک تجزیہ اور تالیف (سب سے اہم): تحقیق کرنے والے کی طرح سوچیں، سرچ انجن کی طرح نہیں۔ جب نظام آپ کو قطعات بھیجے تو بالکل exact word کا موازنہ نہ کریں۔ ہر قطعے کا مکمل متن پڑھیں۔ اس میں سے جو بھی معلومات صارف کے سوال سے مضموناً متعلق ہیں — جسمانی خصوصیات، عادات، کردار کی وضاحت، صحابہ کی رائے، جذبات، روزمرہ کی زندگی، تقریریں، افعال — سب نکال کر ایک واضح، تفصیلی جواب میں پیرو دیں۔ اگر صارف پوچھے "وہ کیسے چلتا تھا" اور قطعات میں "وہ کیسے بولتا تھا" یا "اس کا انداز" کا ذکر ہے تو جو موجود ہے اس سے meaningful جواب بنائیں، انکار نہ کریں۔
4. صرف وہ جواب دیں جو پوچھا گیا ہے: صرف اسی سوال کا جواب دیں جو پوچھا گیا ہے۔ دوسرے واقعات کا ذکر نہ کریں۔
5. lazy fallback پر سخت پابندی: اگر "Retrieved corpus passages" میں کچھ بھی ہے تو کبھی نہ کہیں "اس خاص بات کی تفصیل نہیں ہے۔" صرف تب کہیں جب "Retrieved corpus passages" بالکل خالی ہو (zero documents)۔ جب context ہو — چاہے partial ہو، related ہو، tangentially related ہو — تو اس سے محدود جواب ضرور بنائیں۔
6. صرف سیاق و سباق پر لکھیں: اپنا پورا جواب صرف قطعات میں لکھی باتوں پر لکھیں۔ باہر کا علم نہ ڈالیں۔ لیکن قطعات جو بتاتے ہیں اسے اچھی طرح بیان کریں۔
7. اندار کی بات نہ دکھائیں: کبھی بھی بریکٹ میں ترجمہ، سرچ کوئریز، یا اندرونی سوچ نہ لکھیں۔ آپ کا جواب بالکل قدرتی اور انسان جیسا ہونا چاہیے۔
8. فضول بات نہ کریں: سوال دہرائیں نہیں۔ صرف جواب دیں۔`;

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

/** Strip Devanagari, Arabic script, and other non-Latin characters from Roman Urdu text. */
function sanitizeRomanUrdu(text: string): string {
  // Remove Devanagari block (U+0900–U+097F), Arabic block (U+0600–U+06FF),
  // and other common non-Latin Unicode blocks, but keep Latin, digits, punctuation, whitespace
  return text.replace(/[\u0900-\u097F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\u1F00-\u1FFF]+/g, (match) => {
    // If it's a known transliterated word context, try to provide a clean fallback
    return "";
  }).replace(/\s{2,}/g, " ").trim();
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
        const raw = (json?.choices?.[0]?.message?.content ?? "").trim();
        const text = lang === "roman-ur" ? sanitizeRomanUrdu(raw) : raw;
        if (text && text.length > 10) return text;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  return null;
}
