import { getEngine } from "@/lib/search/search";
import { ChatClient } from "@/components/chat/chat-client";
import { Disclaimer } from "@/components/disclaimer";

export default function Home() {
  const { corpus } = getEngine();
  const corpusSummary = `${corpus.counts.shamail} Shamail entries + ${corpus.counts.timeline} Seerah timeline entries · corpus v${corpus.corpusVersion}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-b border-white/8 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Seerah Q&A
            </h1>
            <p className="text-[12px] text-muted">
              Answers about the life, character, and habits of the Prophet ﷺ —
              grounded in the verified corpus only.
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200">
            Grounded · Cited
          </span>
        </div>
      </header>

      <ChatClient corpusSummary={corpusSummary} />
      <Disclaimer />
    </div>
  );
}