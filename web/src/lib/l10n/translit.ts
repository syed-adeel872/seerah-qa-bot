/**
 * Urdu-script -> Roman-Urdu transliteration for mirroring the response
 * language. Roman Urdu is not standardized, so this uses a hybrid of:
 *   1. a curated dictionary of high-frequency corpus words (authoritative),
 *   2. context-aware grapheme rules for the remaining vocabulary.
 * The result is readable, conventional roman Urdu (never machine garble).
 */

// High-frequency words: authoritative spellings (Urdu -> Roman).
// Built from the corpus's own vocabulary + roman-Urdu slug conventions.
const WORD_MAP: Record<string, string> = {
  // Allah / honorifics
  "\u0627\u0644\u0644\u06C1": "Allah", // اللہ
  "\u0627\u0644\u0644\u06C7": "Allah", // اللّٰہ
  "\u0627\u0644\u0644\u0651\u0670\u0647": "Allah", // اللّٰه
  "\u0627\u0644\u0644\u0647": "Allah", // الله
  "\u062D\u0636\u0648\u0631": "huzoor", // حضور
  "\u0646\u0628\u06CC": "nabi", // نبی
  "\u0631\u0633\u0648\u0644": "rasool", // رسول
  "\u0645\u062D\u0645\u062F": "Muhammad", // محمد
  "\u0627\u06A9\u0631\u0645": "akram", // اکرم
  "\u06A9\u0631\u06CC\u0645": "kareem", // کریم
  "\u0627\u0642\u062F\u0633": "aqdas", // اقدس
  "\u067E\u0627\u06A9": "pak", // پاک
  "\u0645\u0628\u0627\u0631\u06A9": "mubarak", // مبارک
  "\u062D\u0636\u0631\u062A": "hazrat", // حضرت
  "\u0633\u06CC\u062F\u0646\u0627": "sayyidna", // سیدنا
  "\u0631\u0636\u06CC": "razi", // رضی
  "\u062A\u0639\u0627\u0644\u06CC": "ta'ala", // تعالی
  "\u062A\u0639\u0627\u0644\u0670\u06CC": "ta'ala", // تعالٰی
  "\u0639\u0646\u06C1": "anhu", // عنہ
  "\u0639\u0646\u06C1\u0627": "anha", // عنہا
  "\u0639\u0644\u06CC\u06C1": "alaihi", // علیہ
  "\u0639\u0644\u06CC\u06C7": "alaihi", // علیه
  "\u0635\u0644\u0649": "sallallahu", // صلى
  "\u0648\u0633\u0644\u0645": "wasallam", // وسلم
  "\u0635": "sallallahu", // ص
  "\u0634\u0631\u06CC\u0641": "shareef", // شریف
  "\u0627\u0628\u0648": "abu", // ابو
  "\u0627\u0628\u0646": "ibn", // ابن
  "\u0627\u0646\u0633": "anas", // انس
  "\u0639\u0645\u0631": "umar", // عمر

  // particles / function words
  "\u06A9\u06D2": "ke", // کے
  "\u06A9\u06CC": "ki", // کی
  "\u06A9\u0627": "ka", // کا
  "\u06A9\u0648": "ko", // کو
  "\u0633\u06D2": "se", // سے
  "\u0645\u06CC\u06BA": "mein", // میں
  "\u0645\u06CC\u0646": "main", // میں
  "\u0646\u06D2": "ne", // نے
  "\u0648": "aur", // و
  "\u0627\u0648\u0631": "aur", // اور
  "\u06A9\u06C1": "ke", // کہ
  "\u0627\u0633": "is", // اس
  "\u0627\u0633\u06CC": "isi", // اسی
  "\u0627\u0633\u06D2": "ise", // اسے
  "\u0622\u067E": "aap", // آپ
  "\u0627\u0653\u067E": "aap", // آپ
  "\u06C1\u06D2": "hai", // ہے
  "\u06C1\u06CC\u06BA": "hain", // ہیں
  "\u06C1\u06CC": "hi", // ہی
  "\u06C1\u0648": "ho", // ہو
  "\u062A\u0648": "to", // تو
  "\u067E\u0631": "par", // پر
  "\u06CC\u06C1": "yeh", // یہ
  "\u0648\u06C1": "woh", // وہ
  "\u0646\u06C1": "na", // نہ
  "\u0646\u06C1\u06CC\u06BA": "nahi", // نہیں
  "\u0646\u06C1\u06CC": "nahi",
  "\u0628\u06BE\u06CC": "bhi", // بھی
  "\u0627\u0646": "un", // ان
  "\u0627\u0646\u06C1\u0648\u06BA": "unhone", // انہوں
  "\u0627\u0646\u06C1\u06CC\u06BA": "unhein", // انہیں
  "\u06A9\u0631": "kar", // کر
  "\u06A9\u0631\u062A\u06D2": "karte", // کرتے
  "\u06A9\u0631\u062A\u0627": "karta", // کرتا
  "\u06A9\u0631\u0646\u06D2": "karne", // کرنے
  "\u06A9\u0631\u06D2": "kare", // کرے
  "\u062C\u0648": "jo", // جو
  "\u062C\u0628": "jab", // جب
  "\u062C\u0633": "jis", // جس
  "\u062A\u06BE\u0627": "tha", // تھا
  "\u062A\u06BE\u06CC": "thi", // تھی
  "\u062A\u06BE\u06D2": "thay", // تھے
  "\u06A9\u06CC\u0627": "kya", // کیا
  "\u06A9\u06CC\u0627\u06BA": "kyunke", // کیونکہ
  "\u0641\u0631\u0645\u0627\u06CC\u0627": "farmaya", // فرمایا
  "\u0641\u0631\u0645\u0627\u062A\u06D2": "farmate", // فرماتے
  "\u0641\u0631\u0645\u0627\u0646\u06D2": "farmane", // فرمانے
  "\u0627\u067E\u0646\u06D2": "apne", // اپنے
  "\u0627\u067E\u0646\u06CC": "apni", // اپنی
  "\u0627\u067E\u0646\u0627": "apna", // اپنا
  "\u067E\u06BE\u0631": "phir", // پھر
  "\u06A9\u0686\u06BE": "kuch", // کچھ
  "\u0633\u0628": "sab", // سب
  "\u0628\u06BE\u062A": "bohat", // بہت
  "\u0632\u06CC\u0627\u062F\u06C1": "zyada", // زیادہ
  "\u06A9\u0633\u06CC": "kisi", // کسی
  "\u06A9\u0648\u0626\u06CC": "koi", // کوئی
  "\u06A9\u0628\u06BE\u06CC": "kabhi", // کبھی
  "\u0628\u0639\u062F": "baad", // بعد
  "\u062A\u06A9": "tak", // تک
  "\u06CC\u0639\u0646\u06CC": "yani", // یعنی
  "\u0637\u0631\u062D": "tarah", // طرح
  "\u0639\u0631\u0636": "arz", // عرض
  "\u0627\u06AF\u0631": "agar", // اگر
  "\u062F\u0648": "do", // دو
  "\u06C1\u0645": "hum", // ہم
  "\u06C1\u0648\u0627": "hua", // ہوا
  "\u06C1\u0648\u0626\u06D2": "hue", // ہوئے
  "\u06C1\u0648\u0626\u06CC": "hui", // ہوئی
  "\u0648\u0642\u062A": "waqt", // وقت
  "\u062F\u06CC\u0627": "diya", // دیا
  "\u062F\u06CC": "di", // دی
  "\u062F\u0646": "din", // دن
  "\u0644\u06CC\u06D2": "liye", // لیے
  "\u0644\u0626\u06D2": "liye", // لئے
  "\u0644\u06D2": "le", // لے
  "\u06A9\u06C1\u0627": "kaha", // کہا
  "\u0627\u0631\u0634\u0627\u062F": "irshad", // ارشاد
  "\u06C1\u0648\u062A\u0627": "hota", // ہوتا
  "\u06C1\u0648\u062A\u06D2": "hote", // ہوتے
  "\u06C1\u0648\u062A\u06CC": "hoti", // ہوتی
  "\u0631\u06C1\u06D2": "rahay", // رہے
  "\u0634\u062E\u0635": "shakhs", // شخص
  "\u062A\u0634\u0631\u06CC\u0641": "tashreef", // تشریف
  "\u0646\u0645\u0627\u0632": "namaz", // نماز
  "\u06AF\u06CC\u0627": "gaya", // گیا
  "\u06AF\u0626\u06D2": "gaye", // گئے
  "\u06AF\u0626\u06CC": "gayi", // گئی
  "\u0635\u062D\u06CC\u062D": "sahih", // صحیح
  "\u062A\u0631\u0645\u0630\u06CC": "tirmizi", // ترمذی
  "\u062D\u062F\u06CC\u062B": "hadees", // حدیث
  "\u0647\u0631": "har", // ہر
  "\u062F\u0648\u0646\u0648\u06BA": "dono", // دونوں
  "\u0628\u0644\u06A9\u06C1": "balke", // بلکہ
  "\u062F\u06CC\u06A9\u06BE\u0627": "dekha", // دیکھا
  "\u0627\u064F\u0633": "us", // اُس
  "\u0635\u062D\u0627\u0628\u06C1": "sahaba", // صحابہ
  "\u0628\u0627\u062A": "baat", // بات
  "\u0637\u0631\u0641": "taraf", // طرف
  "\u0634\u0645\u0627\u0626\u0644": "shamail", // شمائل
  "\u062A\u06CC\u0646": "teen", // تین
  "\u062E\u062F\u0645\u062A": "khidmat", // خدمت
  "\u0627\u06D2": "ae", // اے
  "\u0644\u0648\u06AF\u0648\u06BA": "logon", // لوگوں
  "\u0644\u0648\u06AF": "log", // لوگ
  "\u06CC\u06C1\u0627\u06BA": "yahan", // یہاں
  "\u0648\u0627\u0644\u06D2": "walay", // والے
  "\u0628\u0627\u0644": "baal", // بال
  "\u0645\u06AF\u0631": "magar", // مگر
  "\u0645\u06CC\u0631\u06CC": "meri", // میری
  "\u0645\u06CC\u0631\u06D2": "mere", // میرے
  "\u0631\u0627\u062A": "raat", // رات
  "\u0645\u0646\u06C1": "munh", // منہ
  "\u0639\u0645\u0644": "amal", // عمل
  "\u0633\u0631": "sar", // سر
  "\u062C\u0633\u06CC": "jis", // جس
  "\u062A\u0645": "tum", // تم
  "\u06CC\u0627": "ya", // یا
  "\u0628\u06CC\u0627\u0646": "bayan", // بیان
  "\u0645\u062C\u06BE\u06D2": "mujhe", // مجھے
  "\u067E\u0627\u0633": "paas", // پاس
  "\u06C1\u0627\u062A\u06BE": "haath", // ہاتھ
  "\u06AF\u06BE\u0631": "ghar", // گھر
  "\u0633\u0627\u062A\u06BE": "sath", // ساتھ
  "\u0628\u06D2": "be", // بے
  "\u0633\u06BE": "se", // سے (قدیم)

  // food / daily life vocabulary
  "\u06A9\u06BE\u0627\u0646\u0627": "khana", // کھانا
  "\u06A9\u06BE\u0627\u0646\u06D2": "khane", // کھانے
  "\u06A9\u06BE\u0627\u062A\u06D2": "khate", // کھاتے
  "\u06A9\u06BE\u0627\u06CC\u0627": "khaya", // کھایا
  "\u06A9\u06BE\u0627\u062A\u0627": "khata", // کھاتا
  "\u067E\u06CC\u0646\u0627": "peena", // پینا
  "\u067E\u06CC\u062A\u06D2": "peete", // پیتے
  "\u067E\u06CC\u0646\u06D2": "peene", // پینے
  "\u0633\u0631\u06A9\u06C1": "sirka", // سرکہ
  "\u0633\u0627\u0644\u0646": "salan", // سالن
  "\u06AF\u0648\u0634\u062A": "gosht", // گوشت
  "\u0631\u0648\u0679\u06CC": "roti", // روٹی
  "\u0634\u0648\u0631\u0628\u0627": "shorba", // شوربا
  "\u06A9\u062F\u0648": "kaddu", // کدو
  "\u06A9\u06BE\u0634\u06A9 \u06AF\u0648\u0634\u062A": "khushk gosht", // خشک گوشت
  "\u062F\u0631\u0632\u06CC": "darzi", // درزی
  "\u0628\u0644\u0627\u06CC\u0627": "bulaya", // بلایا
  "\u067E\u06CC\u0627\u0644\u06C1": "piyala", // پیالہ
  "\u0647\u0627\u0646\u0688\u06CC": "handi", // ہانڈی
  "\u067E\u06A9\u0627\u0626\u06CC": "pakai", // پکائی
  "\u062A\u06CC\u0627\u0631": "taiyar", // تیار
  "\u062A\u0644\u0627\u0634": "talash", // تلاش
  "\u0645\u062D\u0628\u062A": "mohabbat", // محبت
  "\u0627\u062C\u06A9\u06CC": "ajki", // آجکی
  "\u0627\u0642\u0627\u0626\u06D2": "aqa", // آقائے
  "\u0646\u0627\u0645\u062F\u0627\u0631": "namdar", // نامدار
  "\u0641\u0636\u06CC\u0644\u062A": "fazeelat", // فضیلت
  "\u0630\u06A9\u0631": "zikr", // ذکر
  "\u0635\u0631\u0641": "sirf", // صرف
  "\u0631\u0648\u0627\u06CC\u062A": "riwayat", // روایت
  "\u062C\u0633\u06D2": "jise", // جسے
  "\u067E\u06CC\u0634": "pesh", // پیش
  "\u062E\u0634\u06A9": "khushk", // خشک
  "\u067E\u06CC\u0627\u0644\u06D2": "piyale", // پیالے

  // physical description vocabulary
  "\u0645\u0648\u0633\u06CC": "musa", // موسی
  "\u0645\u0631\u063A\u0627": "murgha", // مرغا
  "\u0645\u0631\u063A\u06CC": "murghi", // مرغی
  "\u0686\u06C1\u0631\u06C1": "chehra", // چہرہ
  "\u067E\u0633\u0646\u062F\u06CC\u062F\u06AF\u06CC": "pasandidaagi", // پسندیدگی
  "\u0645\u0630\u06A9\u0648\u0631": "mazkoor", // مذکور
  "\u0637\u0631\u06CC\u0642\u06C1": "tareeqa", // طریقہ
  "\u062F\u0631\u0627\u0635\u0644": "daraasal", // دراصل
  "\u06A9\u0631\u0627\u0645": "kiraam", // کرام
  "\u0645\u0634\u0631\u0648\u0628": "mashroob", // مشروب
  "\u0645\u06C1\u0645\u0627\u0646": "mehmaan", // مہمان
  "\u0645\u06C1\u0645\u0627\u0646\u06CC": "mehmaani", // مہمانی
  "\u0631\u0648\u0632\u06C1": "roza", // روزہ
  "\u0631\u0645\u0636\u0627\u0646": "ramzan", // رمضان
  "\u0627\u0641\u0637\u0627\u0631": "iftar", // افطار
  "\u062F\u06CC\u0646": "deen", // دین
  "\u0627\u06CC\u0645\u0627\u0646": "imaan", // ایمان
  "\u0633\u0646\u062A": "sunnat", // سنت
  "\u062F\u0639\u0627": "dua", // دعا
  "\u063A\u0645": "gham", // غم
  "\u062E\u0648\u0634\u06CC": "khushi", // خوشی
  "\u0633\u062E\u0627\u0648\u062A": "sakhawat", // سخاوت
  "\u0628\u0632\u0631\u06AF": "buzurg", // بزرگ
  "\u0639\u0628\u0627\u062F\u062A": "ibadat", // عبادت
  "\u062A\u0642\u0648\u06CC": "taqwa", // تقوی
  "\u0648\u0639\u0638": "waaz", // وعظ
  "\u062A\u0644\u0627\u0648\u062A": "tilawat", // تلاوت
  "\u0634\u06A9\u0631": "shukr", // شکر
  "\u0622\u0648\u0627\u0632": "aawaz", // آواز
  "\u0642\u062F": "qad", // قد
  "\u0642\u062F\u0631": "qadr", // قدر
  "\u0644\u0645\u0628\u06D2": "lambe", // لمبے
  "\u0627\u0648\u0646\u0686\u0627": "uncha", // اونچا
  "\u062C\u0633\u0645": "jism", // جسم
  "\u0631\u0646\u06AF": "rang", // رنگ
  "\u062E\u0648\u0628\u0635\u0648\u0631\u062A": "khubsurat", // خوبصورت
  "\u0639\u0638\u06CC\u0645": "azeem", // عظیم
  "\u0634\u0641\u0642\u062A": "shafqat", // شفقت
  "\u0631\u062D\u0645\u062A": "rehmat", // رحمت
  "\u0627\u062E\u0644\u0627\u0642": "akhlaq", // اخلاق
  "\u062A\u0644\u0648\u0627\u0631": "talwar", // تلوار
  "\u06A9\u067E\u0691\u06D2": "kapray", // کپڑے
  "\u0644\u0628\u0627\u0633": "libas", // لباس
  "\u0686\u06C1\u0631\u06D2": "chehra", // چہرہ
  "\u0645\u0627\u062A\u06BE\u0627": "matha", // ماتھا
  "\u062F\u0627\u0691\u06BE\u06CC": "dari", // داڑھی
  "\u062C\u0648\u0646\u06AF": "jung", // جنگ
  "\u0628\u062F\u0631": "Badr", // بدر
  "\u062E\u06CC\u0628\u0631": "Khaybar", // خیبر
  "\u062A\u0628\u0648\u06A9": "Tabuk", // تبوک
  "\u0627\u062D\u062F": "Uhud", // احد
  "\u0645\u06A9\u06C1": "Makka", // مکہ
  "\u0645\u062F\u06CC\u0646\u06C1": "Madina", // مدینہ
};

const ARABIC_DIGITS: Record<string, string> = {
  "\u06F0": "0", "\u06F1": "1", "\u06F2": "2", "\u06F3": "3", "\u06F4": "4",
  "\u06F5": "5", "\u06F6": "6", "\u06F7": "7", "\u06F8": "8", "\u06F9": "9",
};

const SAW = "\uFDFA";

// digraphs must be matched before their single characters
const DIGRAPHS: Array<[string, string]> = [
  ["\u06A9\u06BE", "kh"], ["\u06AF\u06BE", "gh"], ["\u0686\u06BE", "chh"],
  ["\u0628\u06BE", "bh"], ["\u067E\u06BE", "ph"], ["\u062A\u06BE", "th"],
  ["\u0679\u06BE", "th"], ["\u062C\u06BE", "jh"], ["\u062F\u06BE", "dh"],
  ["\u0688\u06BE", "dh"],
];

const GRAPHEMES: Array<[string, string]> = [
  ["\u0622", "aa"], ["\u0627", "a"], ["\u0628", "b"], ["\u067E", "p"],
  ["\u062A", "t"], ["\u0679", "t"], ["\u062B", "s"], ["\u062C", "j"],
  ["\u0686", "ch"], ["\u062D", "h"], ["\u062E", "kh"], ["\u062F", "d"],
  ["\u0688", "d"], ["\u0630", "z"], ["\u0631", "r"], ["\u0691", "r"],
  ["\u0632", "z"], ["\u0698", "zh"], ["\u0633", "s"], ["\u0634", "sh"],
  ["\u0635", "s"], ["\u0636", "z"], ["\u0637", "t"], ["\u0638", "z"],
  ["\u0639", "a"], ["\u063A", "gh"], ["\u0641", "f"], ["\u0642", "q"],
  ["\u06A9", "k"], ["\u06AF", "g"], ["\u0644", "l"], ["\u0645", "m"],
  ["\u0646", "n"], ["\u06BA", "n"], ["\u0648", "o"], ["\u06C1", "h"],
  ["\u06BE", "h"], ["\u06C0", "h"], ["\u0621", ""], ["\u0624", "o"],
  ["\u0626", "i"], ["\u06CC", "i"], ["\u06D2", "e"], ["\u06D3", "ai"],
  ["\u0651", ""], ["\u0670", ""], ["\u064B", ""], ["\u064E", ""],
  ["\u064F", ""], ["\u0650", ""], ["\u0652", ""],
];

const CONSONANTS = /[bcdfghjklmnpqrstvwxyz]/;

/**
 * Whether a mapped roman unit is consonant-like (would need a vowel next to
 * it). Multi-letter digraphs (kh, gh, sh, ch, th, ph, bh, dh, zh, jh) count as
 * a single consonant unit.
 */
function isConsonantUnit(unit: string): boolean {
  return (
    /^[bcdfghjklmnpqrstvwxyz]$/.test(unit) ||
    /^(kh|gh|sh|ch|th|ph|bh|dh|zh|jh)$/.test(unit)
  );
}

function transliterateWord(word: string): string {
  const core = word.replace(/[^\u0600-\u06FF]/g, "");
  if (!core) return word;

  // map to roman units first (digraphs are one unit)
  const units: string[] = [];
  let i = 0;
  while (i < core.length) {
    const two = core.slice(i, i + 2);
    const dig = DIGRAPHS.find(([g]) => g === two);
    if (dig) {
      units.push(dig[1]);
      i += 2;
      continue;
    }
    const g = GRAPHEMES.find(([c]) => c === core[i]);
    const mapped = g ? g[1] : "";
    if (mapped) units.push(mapped);
    i += 1;
  }

  // medial ا between two consonants reads as the long "aa" (kaam, salaam);
  // only a genuine alif does — inserted schwas below stay short "a".
  for (let j = 1; j < units.length - 1; j++) {
    if (units[j] === "a" && isConsonantUnit(units[j - 1]) && isConsonantUnit(units[j + 1])) {
      units[j] = "aa";
    }
  }

  // insert the default Urdu schwa (a) between consonant clusters so content
  // words stay pronounceable: mrgha -> maragha, triqa -> tariqa, draasl ->
  // daraasal. Word-final consonants stay unvoweled (sabr, qad).
  let out = "";
  for (let k = 0; k < units.length; k++) {
    const u = units[k];
    const prev = units[k - 1] ?? "";
    if (k > 0 && isConsonantUnit(u) && isConsonantUnit(prev)) {
      out += "a";
    }
    out += u;
  }

  // context fixes (operate on the latin string)
  out = out
    // و between consonants reads as "u" (huzoor, qurbaan)
    .replace(new RegExp(`(${CONSONANTS.source})o(${CONSONANTS.source}|$)`, "g"), "$1u$2")
    // collapse doubles
    .replace(/a{2,}/g, "aa")
    .replace(/o{2,}/g, "oo")
    .replace(/u{2,}/g, "uu");

  return out;
}

/**
 * Transliterate an Urdu-script string to roman Urdu.
 * ``ﷺ`` becomes "(SAW)", digits are converted, punctuation preserved.
 */
export function urduToRoman(text: string): string {
  if (!text) return "";
  let t = text.replace(new RegExp(SAW, "g"), " (SAW)");
  for (const [d, n] of Object.entries(ARABIC_DIGITS)) {
    t = t.split(d).join(n);
  }
  const words = t.split(/(\s+)/);
  return words
    .map((w) => {
      if (/^\s+$/.test(w)) return w;
      const key = w.replace(/[^\u0600-\u06FF]/g, "");
      if (key && WORD_MAP[key]) {
        const pre = w.slice(0, w.indexOf(key));
        const post = w.slice(w.indexOf(key) + key.length);
        return pre + WORD_MAP[key] + post;
      }
      return transliterateWord(w);
    })
    .join("");
}