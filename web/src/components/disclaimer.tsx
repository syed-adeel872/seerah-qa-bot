import { getEngine } from "@/lib/search/search";

/** Persistent, always-visible disclaimer footer (server-rendered). */
export function Disclaimer() {
  const { corpus } = getEngine();
  const d = corpus.meta.disclaimer;

  return (
    <footer className="border-t border-white/8 bg-background/95 px-4 py-3 text-center backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="text-[11px] leading-relaxed text-muted/80">{d?.en}</div>
        <div className="rtl font-ur mt-1 text-[11px] leading-relaxed text-muted/80">{d?.ur}</div>
        <div className="mt-1.5 text-[10px] text-muted/60">
          Corpus v{corpus.corpusVersion} · {corpus.counts.shamail} Shamail +{" "}
          {corpus.counts.timeline} Timeline entries · snapshot{" "}
          <span className="font-mono">{corpus.sha256?.slice(0, 10)}…</span> ·{" "}
          {corpus.generatedAt?.slice(0, 10)}
        </div>
      </div>
    </footer>
  );
}