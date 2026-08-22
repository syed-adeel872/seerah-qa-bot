import { getEngine, ensureLiveCorpus } from "@/lib/search/search";
import { ChatClient } from "@/components/chat/chat-client";
import { Disclaimer } from "@/components/disclaimer";

export default async function Home() {
  await ensureLiveCorpus();
  const { corpus } = getEngine();
  const corpusSummary = `${corpus.counts.shamail} Shamail entries + ${corpus.counts.timeline} Seerah timeline entries · corpus v${corpus.corpusVersion}`;

  return (
    <div
      className="h-full flex flex-col bg-gray-950 text-gray-100"
      style={{ background: "radial-gradient(circle at top, rgba(6, 78, 59, 0.35) 0%, rgba(3, 7, 18, 1) 75%)" }}
    >
      <ChatClient corpusSummary={corpusSummary} />
      <Disclaimer />
    </div>
  );
}