import type { QueryLang } from "../l10n/detect";

/**
 * Deterministic, fail-closed blockers evaluated BEFORE any retrieval or
 * generation happens. They must be conservative: better to refuse an
 * ambiguous fatwa-adjacent question than risk a ruling.
 */

export type BlockKind = "fatwa" | "injection" | "empty";

export interface BlockResult {
  blocked: boolean;
  kind?: BlockKind;
  matchedPattern?: string;
}

const FATWA_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  // english
  { re: /\b(fatwa|fatwas|fatwah|mufti)\b/i, hint: "fatwa/fatwah/mufti" },
  { re: /\b(permissible|impermissible|prohibited|forbidden|unlawful|lawful)\b/i, hint: "permissible/prohibited" },
  { re: /\b(halal|haram|makruh|jaayaz|jaiz|jayaz)\b/i, hint: "halal/haram/jaiz" },
  { re: /\bis it (okay|ok|allowed|permissible|right|correct|lawful|unlawful)\b/i, hint: "is it okay/allowed" },
  { re: /\b(take interest|charging interest|taking (riba|usury|bribes?)|gambl(e|ing)|lotter(ies|y))\b/i, hint: "interest/gambling" },
  { re: /\b(am i allowed|can i (take|do|marry|travel|pray|give|put|borrow|lend|eat|drink))\b/i, hint: "can/am I allowed" },
  { re: /\b(what is the ruling|ruling (on|about)|shari[ae]h? ruling)\b/i, hint: "sharia ruling" },
  // english fiqh / ibadat terms
  { re: /\b(qaza|qada|qaza namaz|missed prayer|missed fast)\b/i, hint: "qaza/qada" },
  { re: /\b(namaz (time|timing|ki|ka|ke)|prayer (time|timing))\b/i, hint: "namaz timing" },
  { re: /\b(roza|roza (rakhna|todna)|fasting (rule|karna))\b/i, hint: "roza/fasting" },
  { re: /\b(zakat|zakat (amount|dena|ki))\b/i, hint: "zakat" },
  { re: /\b( nikah|talaq|divorce (ruling|rule)|marriage (ruling|rule|valid|invalid))\b/i, hint: "nikah/talaq" },
  { re: /\b(wudu|wuzu|ablution|ghusl|tayammum)\b/i, hint: "wudu/ghusl" },
  { re: /\b(jummah|jumma|friday prayer)\b/i, hint: "jummah" },
  // additional english fiqh terms
  { re: /\b(mahr|dower|dowry)\b/i, hint: "mahr/dowry" },
  { re: /\b(iddat|iddah|waiting period)\b/i, hint: "iddat" },
  { re: /\b(mut['']ah|sigheh|temporary marriage)\b/i, hint: "mut'ah" },
  { re: /\b(sawm|salat|salah)\b/i, hint: "sawm/salat" },
  { re: /\b(sajdah|sujud|prostration)\b/i, hint: "sajdah/sujud" },
  { re: /\b(khitan|circumcision)\b/i, hint: "khitan" },
  { re: /\b(janazah|kafan|burial (rite|rule))\b/i, hint: "janazah/burial" },
  { re: /\b(inheritance|mirath|wasit)\b/i, hint: "inheritance/mirath" },
  { re: /\b(zabihah|qurbani|aqeeqah)\b/i, hint: "zabihah/qurbani" },
  { re: /\b(ta['']?wiz|taaweez|amulet)\b/i, hint: "ta'wiz" },
  { re: /\b(biday['']?ah|bid['']?ah|innovation)\b/i, hint: "bid'ah" },
  { re: /\b(shirk)\b/i, hint: "shirk" },
  { re: /\b(oath|qasam)\b/i, hint: "oath/qasam" },
  // urdu script
  { re: /(\u0641\u062A\u0648\u06CC|\u0641\u062A\u0627\u0648\u06CC)/, hint: "فتوی (fatwa)" },
  { re: /(\u062C\u0627\u0626\u0632 \u06C1\u06D2|\u062C\u0627\u0626\u0632 \u0646\u06C1\u06CC\u06BA|\u062D\u0644\u0627\u0644 \u06C1\u06D2|\u062D\u0631\u0627\u0645 \u06C1\u06D2|\u0645\u06A9\u0631\u0648\u06C1)/, hint: "جائز/حلال/حرام/مکروہ" },
  { re: /(\u0634\u0631\u0639\u06CC \u062D\u06A9\u0645|\u062F\u06CC\u0646\u06CC \u062D\u06A9\u0645|\u06A9\u0627 \u062D\u06A9\u0645 \u06A9\u06CC\u0627|\u062D\u06A9\u0645 \u062F\u06CC\u06CC\u06BA)/, hint: "شرعی حکم (sharia ruling)" },
  { re: /(\u0633\u0648\u062F \u0644\u06CC\u0646\u0627|\u0633\u0648\u062F \u062F\u06CC\u0646\u0627|\u062C\u0648\u0627 \u0644\u06AF\u0627\u0646\u0627|\u062C\u0648\u0627 \u062F\u06CC\u0646\u0627)/, hint: "سود/جوا (interest/gambling)" },
  // urdu fiqh / ibadat terms
  { re: /(\u0642\u0636\u0627|\u0642\u0636\u0627\u06BA \u0646\u0645\u0627\u0632)/, hint: "قضا / قضاء نماز" },
  { re: /(\u0646\u0645\u0627\u0632 \u06A9\u0627 \u0648\u0642\u062A|\u0646\u0645\u0627\u0632 \u06A9\u06CC \u0631\u0642\u0645)/, hint: "نماز کا وقت" },
  { re: /(\u0631\u0648\u0632\u06C1|\u0631\u0648\u0632\u06C1 \u0631\u062E\u0646\u0627|\u0631\u0648\u0632\u06C1 \u062A\u0648\u062F\u0646\u0627)/, hint: "روزہ" },
  { re: /(\u0632\u06A9\u0627\u062A|\u0632\u06A9\u0627\u062A \u06A9\u06CC \u0645\u0642\u062F\u0627\u0631)/, hint: "زکوٰة" },
  { re: /(\u0646\u06A9\u0627\u06C1|\u0637\u0644\u0627\u0642|\u0637\u0644\u0627\u0642 \u06A9\u0627 \u062D\u06A9\u0645)/, hint: "نکاح/طلاق" },
  { re: /(\u0648\u0636\u0648|\u0648\u0636\u0648 \u06A9\u0627 \u062D\u06A9\u0645|\u063A\u0633\u0644|\u063A\u0633\u0644 \u06A9\u0627 \u062D\u06A9\u0645)/, hint: "وضو/غسل" },
  // additional urdu fiqh terms
  { re: /(\u0645\u06C2\u0631)/, hint: "مہر (mahr)" },
  { re: /(\u0639\u062F\u062A)/, hint: "عدت (iddat)" },
  { re: /(\u0630\u0628\u062D)/, hint: "ذبح (zabihah)" },
  { re: /(\u0634\u0631\u06A9)/, hint: "شرک (shirk)" },
  { re: /(\u0628\u062F\u0639\u062A)/, hint: "بدعت (bid'ah)" },
  // roman-urdu
  { re: /\b(ri[sz]wa?|sud|jaiz|jaayaz|booaa|gawah)\b/i, hint: "riwa/sud/jaiz" },
  { re: /\b(qaza|qada|namaz (ka|ki|ke) waqt|roza|roza (rakhna|todna)|zakat|nikah|talaq|wuzu|wudu|ghusl|jumma|jummah)\b/i, hint: "fiqh/ibadat (roman-urdu)" },
  // additional roman-urdu fiqh terms
  { re: /\b(mahr|dowry|iddat|iddah|mut['']ah|sawm|salat|salah|sajdah|sujud|khitan|janazah|kafan|mirath|zabihah|qurbani|aqeeqah|ta['']?wiz|taaweez|bid['']?ah|shirk|qasam)\b/i, hint: "fiqh terms (roman-urdu extended)" },
];

const INJECTION_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  // english
  { re: /\bignore (all |any |the )?(previous|prior|above|given|explicit) (instructions?|rules?|prompts?|guidelines|context)\b/i, hint: "ignore prior instructions" },
  { re: /\b(you are now|act as|pretend to be|roleplay as|you are an? (ai|assistant|model) that)\b/i, hint: "you are now / act as" },
  { re: /\b(system prompt|developer instructions|initial prompt|hidden (prompt|instructions)|base prompt)\b/i, hint: "system prompt" },
  { re: /\b(reveal|show|print|display|expose|leak) (your|the|its|hidden|full|internal) (system |initial |base )?(prompt|instructions?|rules?|guidelines|context)\b/i, hint: "reveal prompt" },
  { re: /\b(jailbreak|d[a@]n (mode|jailbreak)|developer mode|steven|overthrow|disregard (the )?above)\b/i, hint: "jailbreak/dan" },
  { re: /\b(forget|disregard|disobey) (all|everything|your) (previous|prior|training|instructions?|rules?)\b/i, hint: "forget/disregard instructions" },
  { re: /\b(birth certificate|repeat (your|the) (system )?prompt)\b/i, hint: "repeat prompt" },
  { re: /\boverride (your|the|all) (rules|instructions|programming)\b/i, hint: "override rules" },
  { re: /\b(from now on|henceforth|effective immediately)\b/i, hint: "from now on" },
  { re: /\b(no restrictions|no rules|no filters|no guardrails|no limitations)\b/i, hint: "no restrictions" },
  { re: /\b(bypass|circumvent) (your|the|all) (rules|safety|filters)\b/i, hint: "bypass safety" },
  { re: /\b(unrestricted|uncensored) (mode|version|AI)\b/i, hint: "unrestricted mode" },
  { re: /\b(respond without (restrictions|rules|constraints))\b/i, hint: "respond without restrictions" },
  { re: /\b(you are a free AI|you are an unrestricted)\b/i, hint: "free/unrestricted AI" },
  { re: /\b(repeat everything above|echo (the|your) (above|previous))\b/i, hint: "repeat above" },
  { re: /\b(what are your (instructions|rules|guidelines|restrictions))\b/i, hint: "what are your rules" },
  // urdu script (constructed via new RegExp to avoid literal-lexer edge cases)
  { re: new RegExp("(اپنا سسٹم پرامپٹ|سسٹم پرامپٹ بتاؤ|پچھلی ہدایات|ہدایات نظر انداز|ای اؤے کہاؤ)"), hint: "سسٹم پرامپٹ / ہدایات" },
  { re: new RegExp("(ایک نیا رول|تم اب ایک|اظہر کرو)"), hint: "ایک نیا رول / اب ایک" },
  { re: new RegExp("(نئی ہدایات|اپنے قواعد بدلیں|کوئی پابندی نہیں|مفت ہے آپ|آزاد ہو آپ)"), hint: "نئی ہدایات / پابندی" },
];

export function checkBlockers(normalizedQuestion: string): BlockResult {
  const q = normalizedQuestion.trim();
  if (!q) return { blocked: true, kind: "empty" };

  for (const { re, hint } of FATWA_PATTERNS) {
    if (re.test(q)) return { blocked: true, kind: "fatwa", matchedPattern: hint };
  }
  for (const { re, hint } of INJECTION_PATTERNS) {
    if (re.test(q)) return { blocked: true, kind: "injection", matchedPattern: hint };
  }
  return { blocked: false };
}

/** Refusal text in the user's query language. */
export function refusalText(kind: BlockKind, lang: QueryLang): string {
  if (kind === "injection") {
    return lang === "ur"
      ? "میں صرف اس مختصر سیرت و شمائل کے ذخیرے سے جواب دیتا ہوں، اور اپنے نظام کے کام کو تبدیل نہیں کر سکتا۔"
      : lang === "roman-ur"
        ? "Main sirf is Seerah corpus se jawab deta hoon. Aap meri system hidayat ko change nahi kar sakte."
        : "I only answer from the fixed Seerah & Shamail corpus, and I cannot change my system instructions.";
  }
  if (kind === "fatwa") {
    return lang === "ur"
      ? "شرعی فتویٰ جاری کرنا میرے دائرۂ کار میں نہیں۔ یہ تحریری جواب نیا حکم/فتویٰ نہیں ہے اور نہ ہی اسے فتویٰ سمجھا جائے۔ یہ سائل کو انتہائی اہمیت کا حامل اقدام ہے — براہِ کرم کسی مستند عالمِ دین سے رجوع کریں۔"
      : lang === "roman-ur"
        ? "Ye sawal ek shari'ah fatwa/ruling hai jiska jawab dena mere daaira kaam me nahi. Barae meharbani kisi mustanad aalim se raju karein."
        : "This is a matter of Islamic shari'ah ruling (fatwa), which is outside what I can answer. I cannot issue a religious ruling. Please consult a qualified scholar (Aalim / Mufti) for a definitive answer.";
  }
  return lang === "ur"
    ? "براہِ کرم کوئی سوال درج کریں۔"
    : "Please enter a question.";
}

/** Redirect destination shown to users for fatwa/ruling queries. */
export function redirectInfo() {
  return {
    labelEn: "Consult a qualified Islamic scholar (Aalim/Mufti)",
    labelUr: "کسی مستند عالمِ دین / مفتی صاحب سے رجوع کریں",
  };
}