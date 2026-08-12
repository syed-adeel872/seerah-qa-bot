/**
 * Query language detection: Urdu script, roman-Urdu transliteration, or English.
 */

export type QueryLang = "ur" | "roman-ur" | "en";

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF]/;

/** Words that are near-infallible markers of roman-Urdu (not English). */
const ROMAN_URDU_MARKERS = new Set([
  "huzoor", "biwi", "aap", "kya", "hai", "hain", "tha", "thi", "nabi", "rasool",
  "namaz", "roza", "zindagi", "sabr", "nikah", "shadi", "wafat", "wiladat",
  "madina", "masjid", "quran", "allah", "sunnah", "meharbani", "jazak",
  "insha", "karam", "rehmat", "barkat", "amal", "gunah", "sawab", "dua",
  "khana", "mehmaan", "imam", "ummah", "roze", "salah", "khidmat", "ibadat",
  "akhlaq", "tawakkul", "zakat", "sadaqa", "hijrah", "kaba", "kalma", "zindagi",
]);

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text);
}

/** Detect the language family of a user question. */
export function detectQueryLang(text: string): QueryLang {
  if (hasArabicScript(text)) return "ur";
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9']+/i)
    .filter(Boolean);
  if (words.some((w) => ROMAN_URDU_MARKERS.has(w))) return "roman-ur";
  return "en";
}

/**
 * True when the question explicitly asks for a response in Urdu (either in
 * Urdu script or roman "urdu"), e.g. "اردو میں جواب دیں" / "urdu mein jawab".
 * A bare "roman urdu" mention does NOT count — that reads English.
 */
export function explicitlyRequestsUrdu(question: string): boolean {
  const q = question.toLowerCase();
  if (q.includes("\u0627\u0631\u062F\u0648")) return true;
  if (/\burdu\b/.test(q) && !/\broman[- ]\s?urdu\b/.test(q)) return true;
  return false;
}

/**
 * Which language to answer in for a detected query language.
 * Default is clear, professional English. Urdu is used only when the user
 * explicitly requests it (Urdu is otherwise fully supported for detection,
 * retrieval and refusal messages).
 */
export function answerLang(q: QueryLang, question?: string): "en" | "ur" {
  if (question && explicitlyRequestsUrdu(question)) return "ur";
  return "en";
}