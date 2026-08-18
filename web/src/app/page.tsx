import { getEngine, ensureLiveCorpus } from "@/lib/search/search";
import { ChatClient } from "@/components/chat/chat-client";
import { Disclaimer } from "@/components/disclaimer";

export default async function Home() {
  await ensureLiveCorpus();
  const { corpus } = getEngine();
  const corpusSummary = `${corpus.counts.shamail} Shamail entries + ${corpus.counts.timeline} Seerah timeline entries · corpus v${corpus.corpusVersion}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-b border-white/8 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.seeratkidunya.com/images/landingPage/homePage/logo.svg"
              alt="Seerat Ki Dunya"
              className="h-9 w-auto"
            />
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                Seerah Q&A
              </h1>
              <p className="text-[12px] text-muted">
                Answers about the life, character, and habits of the Prophet ﷺ —
                grounded in the verified corpus only.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-muted">
              Web
            </span>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200">
              Grounded · Cited
            </span>
          </div>
        </div>
      </header>

      <ChatClient corpusSummary={corpusSummary} />
      <Disclaimer />
    </div>
  );
}