import { getEngine, ensureLiveCorpus } from "@/lib/search/search";

/** Persistent, always-visible user-facing disclaimer footer (server-rendered). */
export async function Disclaimer() {
  await ensureLiveCorpus();
  const { corpus } = getEngine();

  return (
    <footer className="border-t border-white/8 bg-background/95 px-4 py-3 text-center backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="text-[11px] leading-relaxed text-muted/80">
          Answers are generated strictly from a verified Seerah &amp; Shamail
          corpus. For rulings or fatwas, please consult a qualified Islamic
          scholar.
        </div>
        <div className="rtl font-ur mt-1 text-[11px] leading-relaxed text-muted/80">
          جوابات صرف ایک تصدیق شدہ سیرت و شمائل کے ذخیرے سے تیار کیے جاتے ہیں۔
          فتویٰ یا شرعی حکم کے لیے براہِ کرم کسی مستند عالمِ دین سے رجوع کریں۔
        </div>
        <div className="mt-1.5 text-[10px] text-muted/60">
          Corpus v{corpus.corpusVersion} • {corpus.counts.shamail} Shamail &amp;{" "}
          {corpus.counts.timeline} Timeline entries
        </div>
      </div>
    </footer>
  );
}