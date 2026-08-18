/**
 * Text normalization + tokenization for the retrieval layer.
 *
 * Handles three script/spelling families that appear in this corpus:
 *  - English (lower-cased, diacritics stripped)
 *  - Urdu/Arabic script (alif/hamza/tashkeel normalized)
 *  - Roman-Urdu transliteration (incl. vowel-less slug forms)
 *
 * Synonym conflation maps English, Urdu-script and roman-Urdu variants of
 * common terms onto one canonical group id so BM25 matches across languages.
 */

const ARABIC_NORMALIZATION: Array<[RegExp, string]> = [
  [/[\u064B-\u065F\u0670\u0640]/g, ""], // tashkeel + tatweel
  [/[\u0623\u0625\u0622\u0627]/g, "\u0627"], // alif forms -> ا
  [/[\u0624]/g, "\u0648"], // ؤ -> و
  [/[\u0626]/g, "\u064A"], // ئ -> ي
  [/[\u0629]/g, "\u0647"], // ة -> ه
  [/[\u06CC]/g, "\u064A"], // ی -> ي (persian yeh)
  [/[\u06C1\u06C0]/g, "\u0647"], // ھ ہ -> ه
  [/[\u0679\u067B]/g, "\u0679"], // ٹ
  [/[\u0688]/g, "\u0688"], // ڈ
  [/[\u0691]/g, "\u0691"], // ڑ
];

const ALIAS_GROUPS: Record<string, string[]> = {
  prophet: ["prophet", "rasool", "rasul", "nabi", "nby", "nbi", "messenger", "huzoor", "\u0646\u0628\u06CC", "\u0631\u0633\u0648\u0644", "\u0631\u0633\u0648\u0644", "\u062d\u0636\u0648\u0631"],
  saw: ["saw", "saww", "pbuh", "sallallahu", "alayhi", "wasallam", "peace", "blessings"],
  pak: ["pak", "holy", "pakeeza"],
  mother: ["mother", "walida", "maan", "mama", "\u0645\u0627\u06BA", "\u0648\u0627\u0644\u062F\u06C1"],
  father: ["father", "walid", "baap", "abba", "\u0648\u0627\u0644\u062F", "\u0628\u0627\u067E"],
  wife: ["wife", "biwi", "azwaj", "zawja", "\u0628\u06CC\u0648\u06CC", "\u0627\u0632\u0648\u0627\u062C"],
  birth: ["birth", "wiladat", "paidaish", "wladt", "born", "\u0648\u0644\u0627\u062F\u062A", "\u067E\u06CC\u062F\u0627\u0626\u0634"],
  death: ["death", "wafat", "wft", "wafaat", "demise", "passed", "intsikal", "\u0648\u0641\u0627\u062A", "\u0627\u0646\u062A\u0642\u0627\u0644"],
  marriage: ["marriage", "nikah", "shadi", "zawaj", "married", "\u0646\u06A9\u0627\u062D", "\u0634\u0627\u062F\u06CC"],
  mosque: ["mosque", "masjid", "\u0645\u0633\u062C\u062F"],
  prayer: ["prayer", "prayers", "namaz", "salah", "salat", "prayed", "\u0646\u0645\u0627\u0632", "\u0635\u0644\u0627\u0629"],
  fasting: ["fasting", "fast", "roza", "roze", "\u0631\u0648\u0632\u06C1", "\u0631\u0648\u0632\u06D2"],
  charity: ["charity", "zakat", "sadaqa", "sadaqah", "\u0632\u06A9\u0648\u0670\u06C1", "\u0635\u062F\u0642\u06C1"],
  hajj: ["hajj", "haj", "\u062D\u062C"],
  umrah: ["umrah", "umra", "\u0639\u0645\u0631\u06C1"],
  medina: ["medina", "madina", "madni", "mdna", "\u0645\u062F\u06CC\u0646\u06C1"],
  mecca: ["mecca", "makkah", "kaba", "kaaba", "\u0645\u06A9\u06C1", "\u06A9\u0639\u0628\u06C1"],
  revelation: ["revelation", "wahy", "\u0648\u062D\u06CC"],
  quran: ["quran", "koran", "\u0642\u0631\u0622\u0646"],
  companions: ["companions", "sahaba", "sahabah", "ashab", "\u0635\u062D\u0627\u0628\u06C1"],
  aisha: ["aisha", "aishah", "ayesha", "\u0639\u0627\u0626\u0634\u06C1"],
  khadija: ["khadija", "khadijah", "\u062E\u062F\u06CC\u062C\u06C1"],
  fatima: ["fatima", "fatimah", "\u0641\u0627\u0637\u0645\u06C1"],
  umar: ["umar", "omer", "ummar", "\u0639\u0645\u0631"],
  usman: ["usman", "uthman", "osman", "\u0639\u062B\u0645\u0627\u0646"],
  abubakr: ["abu", "bakr", "abubakr", "\u0627\u0628\u0648", "\u0628\u06A9\u0631"],
  ali: ["ali", "\u0639\u0644\u06CC"],
  hijrah: ["hijrah", "hijra", "migration", "migrated", "\u06C1\u062C\u0631\u062A"],
  akhlaq: ["akhlaq", "morals", "moral", "character", "khulq", "\u0627\u062E\u0644\u0627\u0642", "\u062E\u0644\u0642"],
  attributes: ["attributes", "sifat", "shamail", "shamaail", "\u0635\u0641\u0627\u062A", "\u0634\u0645\u0627\u0626\u0644"],
  mercy: ["mercy", "rahmah", "rahmat", "rahma", "\u0631\u062D\u0645\u062A", "\u0631\u062D\u0645\u06C1"],
  forgiveness: ["forgiveness", "forgive", "maghfirah", "forgave", "\u0645\u063A\u0641\u0631\u062A", "\u0645\u0639\u0627\u0641"],
  manners: ["manners", "adab", "adaab", "\u0627\u062F\u0628"],
  generosity: ["generosity", "generous", "sakha", "sakhawat", "\u0633\u062E\u0627\u0648\u062A"],
  patience: ["patience", "patient", "patiently", "sabr", "\u0635\u0628\u0631"],
  life: ["life", "lives", "living", "zindagi", "zindgi", "jindagi", "jeevan", "\u0632\u0646\u062F\u06AF\u06CC"],
  humility: ["humility", "humble", "tawadhu", "\u062A\u0648\u0627\u0636\u0639"],
  trust: ["trust", "amanah", "trustworthiness", "tawakkul", "bharosa", "\u0627\u0645\u0627\u0646\u062A", "\u062A\u0648\u06A9\u0644", "\u0628\u06BE\u0631\u0648\u0633\u06C1"],
  honesty: ["honesty", "honest", "sidq", "sach", "sachai", "\u0635\u062F\u0642", "\u0627\u06CC\u0645\u0627\u0646\u062F\u0627\u0631", "\u0633\u0686", "\u0633\u0686\u0627\u0626\u06CC"],
  bravery: ["bravery", "courage", "brave", "bahadur", "jurrat", "shuja", "\u0628\u06CC\u0627\u06A9", "\u0628\u06C1\u0627\u062F\u0631\u06CC", "\u0634\u062C\u0627\u0639\u062A"],
  justice: ["justice", "adl", "fairness", "just", "\u0639\u062F\u0644"],
  kindness: ["kindness", "kind", "reham", "shafqat", "meherbani", "\u0631\u062D\u0645", "\u0645\u06C1\u0631\u0628\u0627\u0646", "\u0634\u0641\u0642\u062A", "\u0645\u06C1\u0631\u0628\u0627\u0646\u06CC"],
  cleanliness: ["cleanliness", "clean", "purity", "tahara", "\u0637\u06C1\u0627\u0631\u062A", "\u0635\u0641\u0627\u0626\u06CC"],
  eating: ["eating", "eat", "eats", "ate", "eaten", "food", "foods", "meal", "meals", "khana", "khaana", "khaate", "khate", "khaatay", "khane", "khaane", "khorak", "ghiza", "taam", "dining", "dine", "\u06A9\u06BE\u0627\u0646\u0627", "\u06A9\u06BE\u0627\u062A\u06D2", "\u06A9\u06BE\u0627\u0626\u06D2"],
  guest: ["guest", "mehmaan", "ziyafat", "\u0645\u06C1\u0645\u0627\u0646"],
  trade: ["trade", "trading", "business", "merchant", "\u062A\u062C\u0627\u0631\u062A"],
  shepherding: ["shepherd", "shepherding", "goats", "sheep", "\u0628\u06BE\u06CC\u0691"],
  drinking: ["drinking", "drink", "drinks", "drank", "peena", "peene", "peenay", "peete", "pite", "piya", "pita", "sharbat", "mashroob", "\u067E\u06CC\u0646\u0627", "\u067E\u06CC\u0646\u06D2", "\u067E\u06CC\u062A\u06D2", "\u067E\u06CC\u0627", "\u0645\u0634\u0631\u0648\u0628"],
  stature: ["stature", "height", "heights", "qad", "qadd", "qade", "lamba", "lambay", "uncha", "unche", "buland", "\u0642\u062F", "\u0644\u0645\u0628\u0627", "\u0627\u0648\u0646\u0686\u0627"],
  appearance: ["appearance", "features", "looks", "hulya", "huliya", "hilya", "jamal", "surat", "shakal", "waza", "wazah", "\u062D\u0644\u06CC\u06C1", "\u0635\u0648\u0631\u062A", "\u062C\u0645\u0627\u0644", "\u0634\u06A9\u0644"],
  face: ["face", "chehra", "\u0686\u06C1\u0631\u06C1"],
  battle: ["battle", "battles", "war", "wars", "warfare", "combat", "fighting", "fought", "jung", "jang", "laraai", "larai", "ladai", "ladi", "ghazwa", "ghazwat", "gazwa", "ghawza", "jihad", "\u062C\u0646\u06AF", "\u0644\u0691\u0627\u0626\u06CC", "\u063A\u0632\u0648\u06C1", "\u063A\u0632\u0648\u0627\u062A", "\u062C\u06C1\u0627\u062F"],
  rest: ["resting", "rest", "sleep", "sleeping", "slept", "sona", "sote", "sota", "sooya", "neend", "aaram", "\u0633\u0648\u0646\u0627", "\u0633\u0648\u062A\u06D2", "\u0646\u06CC\u0646\u062F", "\u0622\u0631\u0627\u0645"],
  sitting: ["sitting", "sit", "sits", "sat", "baithna", "baithay", "betha", "baithe", "\u0628\u06CC\u0679\u06BE\u0646\u0627", "\u0628\u06CC\u0679\u06BE\u06D2"],
  walking: ["walking", "walk", "walks", "walked", "chalna", "chalta", "chaltay", "\u0686\u0644\u0646\u0627", "\u0686\u0644\u062A\u06D2"],
  clothing: ["clothing", "clothes", "cloth", "dress", "dressed", "attire", "libas", "kapra", "kapre", "kapray", "pehnawa", "pehnaw", "poshaak", "poshak", "\u0644\u0628\u0627\u0633", "\u06A9\u067E\u0691\u0627", "\u06A9\u067E\u0691\u06D2", "\u067E\u06C1\u0646\u062A\u06D2"],
  armor: ["armor", "armour", "armours", "zirah", "zira", "ziraa", "\u0632\u0631\u06C1", "\u0632\u0631\u06C1 \u0645\u0628\u0627\u0631\u06A9"],
  hair: ["hair", "hairs", "baal", "\u0628\u0627\u0644"],
  teeth: ["teeth", "tooth", "daant", "\u062F\u0627\u0646\u062A"],
  smile: ["smiling", "smile", "smiles", "smiled", "muskurana", "muskurahat", "tabassum", "\u0645\u0633\u06A9\u0631\u0627\u0646\u0627", "\u0645\u0633\u06A9\u0631\u0627\u06C1\u0679", "\u062A\u0628\u0633\u0645"],
  tears: ["tears", "weeping", "weep", "wept", "crying", "cried", "cry", "ronna", "roya", "rona", "aansu", "\u0631\u0648\u0646\u0627", "\u0631\u0648\u06CC\u0627", "\u0622\u0646\u0633\u0648"],
  talking: ["talking", "talk", "talks", "talked", "speak", "speech", "spoke", "bolna", "bolte", "bolta", "baat", "goftaar", "\u0628\u0648\u0644\u0646\u0627", "\u0628\u0648\u0644\u062A\u06D2", "\u0628\u0627\u062A", "\u06AF\u0641\u062A\u0627\u0631"],
  fragrance: ["fragrance", "perfume", "scent", "itr", "attar", "khushbu", "\u0639\u0637\u0631", "\u062E\u0648\u0634\u0628\u0648"],
  silence: ["silence", "silent", "khamoshi", "\u062E\u0627\u0645\u0648\u0634\u06CC"],
  love: ["love", "loves", "loved", "loving", "mohabbat", "muhabbat", "ishq", "\u0645\u062D\u0628\u062A", "\u0639\u0634\u0642"],
  worship: ["worship", "worshipping", "worshipped", "ibadat", "ibadah", "\u0639\u0628\u0627\u062F\u062A"],
  modesty: ["modesty", "modest", "sharm", "haya", "\u0634\u0631\u0645", "\u062D\u06CC\u0627"],
  gravy: ["gravy", "saalan", "salan", "\u0633\u0627\u0644\u0646"],
  meat: ["meat", "meats", "gosht", "shank", "shanks", "\u06AF\u0648\u0634\u062A"],
  complexion: ["complexion", "rang", "rangat", "\u0631\u0646\u06AF", "\u0631\u0646\u06AF\u062A"],
  badr: ["badr", "\u0628\u062F\u0631"],
  khaybar: ["khaybar", "khaibar", "\u062E\u06CC\u0628\u0631"],
  tabuk: ["tabuk", "tabooq", "\u062A\u0628\u0648\u06A9"],
  uhud: ["uhud", "\u0627\u062D\u062F"],
  fijar: ["fijar", "fajjar", "\u0641\u062C\u0627\u0631"],
  taif: ["taif", "taifah", "\u0637\u0627\u0626\u0641"],
};

/**
 * Canonical English keyword per conflation group. Used by expandQuestion()
 * (the synonym-mapping layer) to inject the corpus's own keyword family
 * into a query written in Urdu / Roman Urdu / English.
 */
const GROUP_CANONICALS: Record<string, string> = {
  prophet: "prophet",
  saw: "saw",
  pak: "holy",
  mother: "mother",
  father: "father",
  wife: "wife",
  birth: "birth",
  death: "death",
  marriage: "marriage",
  mosque: "mosque",
  prayer: "prayer",
  fasting: "fasting",
  charity: "charity",
  hajj: "hajj",
  umrah: "umrah",
  medina: "medina",
  mecca: "mecca",
  revelation: "revelation",
  quran: "quran",
  companions: "companions",
  aisha: "aisha",
  khadija: "khadija",
  fatima: "fatima",
  umar: "umar",
  usman: "usman",
  abubakr: "abubakr",
  ali: "ali",
  hijrah: "hijrah",
  akhlaq: "akhlaq",
  attributes: "attributes",
  mercy: "mercy",
  forgiveness: "forgiveness",
  manners: "manners",
  generosity: "generosity",
  patience: "patience",
  life: "life",
  humility: "humility",
  trust: "trust",
  honesty: "honesty",
  bravery: "bravery",
  justice: "justice",
  kindness: "kindness",
  cleanliness: "cleanliness",
  eating: "eating",
  guest: "guest",
  trade: "trade",
  shepherding: "shepherding",
  drinking: "drinking",
  stature: "stature",
  appearance: "appearance",
  face: "face",
  battle: "battle",
  rest: "rest",
  sitting: "sitting",
  walking: "walking",
  clothing: "clothing",
  armor: "armor",
  hair: "hair",
  teeth: "teeth",
  smile: "smile",
  tears: "tears",
  talking: "talking",
  fragrance: "fragrance",
  silence: "silence",
  love: "love",
  worship: "worship",
  modesty: "modesty",
  gravy: "gravy",
  meat: "meat",
  complexion: "complexion",
  badr: "badr",
  khaybar: "khaybar",
  tabuk: "tabuk",
  uhud: "uhud",
  fijar: "fijar",
  taif: "taif",
};

const TO_GROUP = new Map<string, string>();
for (const [group, members] of Object.entries(ALIAS_GROUPS)) {
  for (const m of members) {
    // Apply the same normalization used on query/corpus text so keys match
    // tokens exactly (e.g. Farsi yeh -> Arabic yeh, tashkeel stripped).
    const normalized = normalizeText(m);
    if (normalized && !normalized.includes(" ")) {
      if (!TO_GROUP.has(normalized)) TO_GROUP.set(normalized, group);
    }
  }
}

/** Names of the topical conflation groups (used as "topical anchor" tokens). */
export const ALIAS_GROUP_NAMES: ReadonlySet<string> = new Set(Object.keys(ALIAS_GROUPS));

const TOKEN_RE = /[\p{L}\p{N}_]+/gu;

function normalizeText(text: string): string {
  let t = (text ?? "").replace(/\uFDFA/g, " ").replace(/[-_.]+/g, " "); // ﷺ -> space, separators -> space
  t = t.normalize("NFKC").toLowerCase();
  for (const [re, rep] of ARABIC_NORMALIZATION) t = t.replace(re, rep);
  return t;
}

/**
 * Resolve a normalized token to its conflation group.
 * Falls back to stripping the Arabic definite article "ال" so that
 * prefixed forms (النبی، الرسول، ...) conflate with their base word.
 */
function lookupGroup(token: string): string {
  const exact = TO_GROUP.get(token);
  if (exact) return exact;
  if (token.length > 3 && token.startsWith("\u0627\u0644")) {
    const stripped = TO_GROUP.get(token.slice(2));
    if (stripped) return stripped;
  }
  return token;
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  const tokens: string[] = [];
  for (const m of normalized.match(TOKEN_RE) ?? []) {
    tokens.push(lookupGroup(m));
  }
  return tokens;
}

/** Tokenize and return unique tokens (for index/document use). */
export function uniqueTokens(text: string): string[] {
  return [...new Set(tokenize(text))];
}

/**
 * High-frequency function words (English, Urdu script and roman-Urdu) that
 * carry no retrieval signal. Queries are filtered of these before scoring so
 * an out-of-corpus question like "quantum mechanics in antarctica" cannot
 * match purely on "in"/"the".
 */
const RAW_STOP_WORDS = [
  // English
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with",
  "by", "was", "were", "is", "are", "be", "been", "being", "did", "do", "does",
  "had", "have", "has", "it", "its", "this", "that", "these", "those", "he",
  "she", "they", "them", "their", "his", "her", "him", "you", "your", "my",
  "our", "we", "what", "when", "where", "which", "who", "whom", "whose", "why",
  "how", "not", "no", "so", "than", "then", "there", "here", "from", "up",
  "down", "out", "about", "into", "over", "under", "as", "but", "if", "while",
  "would", "will", "can", "could", "should", "may", "might", "shall", "please",
  "tell", "tell", "me", "us", "was", "did", "been", "s", "describe",
  "happened", "happen", "explain", "explained", "occurred", "occur",
  "during", "wear", "wore", "worn", "wearing",
  // roman-Urdu function words
  "ka", "ki", "ke", "ko", "se", "mein", "main", "hai", "hain", "tha", "thi",
  "kya", "yeh", "woh", "wo", "aur", "ho", "bhi", "par", "tak", "lekin", "magar",
  "bare", "baare", "baaray", "batao", "bata", "bataen", "bataye",
  "jawaab", "jawab", "urdu", "karo", "karein", "kijiye", "zahengi",
  "kaisa", "kaise", "kaisay", "kaisi", "kaisey", "kahan", "kab", "kyun",
  "kion", "kitna", "kitni", "kitne", "kis", "kaun", "kon", "ne", "si",
  "wala", "wali", "walay", "waly", "aap", "apna", "apni", "apne", "hum",
  "ham", "mujhe", "mera", "meri", "meray", "tum", "tumhara", "usne",
  "uski", "uska", "uske", "iski", "iska", "inke", "inki", "inka", "jab",
  "toh", "na", "nahi", "nahin", "nhi", "hote", "hota", "hoti", "hoga",
  "hogi", "hongay", "raha", "rahi", "rahay", "rehta", "rehti", "rehtay",
  "karta", "karti", "karte", "karnay", "karne", "karna", "kiya", "kiye",
  "thay", "thee", "tay", "te", "e", "o", "pe", "hi", "jaise", "jaisey",
  "jesa", "jese", "jis", "jiska", "jiski", "jinke", "sawal", "poochh",
  "poochta", "poochte", "chahye", "chahiye",
  // patronymic connectors (name noise, e.g. "Khalid bin Waleed")
  "bin", "ibn", "ibni", "ibn-e", "bint",
  // Urdu script function words
  "\u06A9\u06CC", "\u06A9\u0627", "\u06A9\u06D2", "\u06A9\u0648", "\u0633\u06D2",
  "\u0645\u06CC\u06BA", "\u0627\u0648\u0631", "\u06C1\u06D2", "\u06C1\u06CC\u06BA",
  "\u062A\u06BE\u0627", "\u062A\u06BE\u06CC", "\u06A9\u06C1", "\u0646\u06C1",
  "\u0646\u06D2", "\u06CC\u06C1", "\u0648\u06C1", "\u0628\u06BE\u06CC",
  "\u067E\u0631", "\u062A\u06A9", "\u0627\u0633", "\u0627\u0646", "\u0627\u0633\u06CC",
  "\u0627\u0648\u0631", "\u0644\u06CC\u06A9\u06D2",
  "\u0622\u062C", "\u06A9\u06C1\u0627\u06BA", "\u06AF\u06CC", "\u0627\u0628",
  "\u0627\u0631\u062F\u0648", "\u062C\u0648\u0627\u0628", "\u062F\u06CC\u06BA",
  "\u0628\u062A\u0627\u0624", "\u06A9\u0631\u0648",
  "\u06A9\u06CC\u0633\u0627", "\u06A9\u06CC\u0633\u06CC", "\u06A9\u06CC\u0633\u06D2",
  "\u06A9\u0628", "\u06A9\u06CC\u0648\u06BA", "\u06A9\u062A\u0646\u0627", "\u06A9\u0648\u0646",
  "\u06A9\u0633", "\u0648\u0627\u0644\u0627", "\u0648\u0627\u0644\u06CC", "\u0648\u0627\u0644\u06D2",
  "\u0627\u067E\u0646\u0627", "\u0627\u067E\u0646\u06CC", "\u0627\u067E\u0646\u06D2",
  "\u0645\u06CC\u0631\u0627", "\u0645\u06CC\u0631\u06CC", "\u0645\u06CC\u0631\u06D2",
  "\u06C1\u0645", "\u062A\u0645", "\u06A9\u0631\u062A\u0627", "\u06A9\u0631\u062A\u06CC",
  "\u06A9\u0631\u062A\u06D2", "\u062A\u06BE\u06D2", "\u0646\u06C1\u06CC", "\u062C\u0628",
  "\u062A\u0648", "\u06A9\u06CC\u0627",
];

/**
 * Stop words normalized through the same path as query tokens so Urdu script
 * forms (e.g. Farsi yeh in میں) match their normalized token exactly.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  RAW_STOP_WORDS.map((w) => {
    const t = tokenize(w);
    return t.length === 1 ? t[0] : normalizeText(w);
  }),
);

/** Tokenize a query and drop stop words. */
export function queryTokens(text: string): string[] {
  return uniqueTokens(text).filter((t) => !STOP_WORDS.has(t));
}

/** Conflate a single token (used for building a query token set). */
export function conflateToken(token: string): string {
  const t = normalizeText(token).trim();
  if (!t) return t;
  return tokenize(t)[0] ?? t;
}

/**
 * Query normalization + expansion (the synonym-mapping layer).
 *
 * Normalizes the raw question (Urdu-script diacritics, Farsi yeh, alif forms,
 * separators) and, for every token that resolves to a conflation group, appends
 * the group's canonical English corpus keyword. Because the synonym and its
 * canonical keyword conflate to the SAME group id, tokenization dedupes them —
 * expansion therefore adds no retrieval noise and never lowers coverage. It
 * guarantees the lexical matcher always sees the corpus's own keyword family
 * whether the user typed Urdu, Roman Urdu, or English.
 *
 * Additive only: the original text is preserved, so an unrecognized
 * out-of-corpus query still fails closed with no spurious matches.
 */
export function expandQuestion(raw: string): string {
  const words = normalizeText(raw);
  const tokens = words.match(TOKEN_RE) ?? [];
  const out: string[] = [];
  for (const tok of tokens) {
    out.push(tok);
    const group = TO_GROUP.get(tok);
    if (group) {
      const canonical = GROUP_CANONICALS[group];
      if (canonical && canonical !== tok) out.push(canonical);
    }
  }
  return out.join(" ");
}
