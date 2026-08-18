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
  "jung", "jang", "laraai", "batao", "bata", "bataen", "bataye", "bare",
  "baare", "baaray", "kaisa", "kaise", "kaisay", "kaisi", "kitna", "kitni",
  "kahan", "kaun", "kon", "sab", "gosht", "saalan", "qad", "hulya", "peena",
  "peete", "khate", "khaate", "thay", "mein", "ne", "si", "wala", "wali",
  "chahye", "chahiye", "sakta", "sakti", "sakte", "hota", "hote", "hoti",
  "raha", "rahi", "rahay", "karta", "karti", "karte", "kiya", "kiye", "mujhe",
  "mera", "meri", "apna", "apni",
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
 * Mirrors the query: English -> English, Urdu script -> Urdu script,
 * roman Urdu -> roman Urdu. An explicit Urdu request (Urdu script or
 * "urdu mein jawab") always forces a Urdu-script answer.
 */
export function answerLang(q: QueryLang, question?: string): "en" | "ur" | "roman-ur" {
  if (question && explicitlyRequestsUrdu(question)) return "ur";
  if (q === "ur") return "ur";
  if (q === "roman-ur") return "roman-ur";
  return "en";
}