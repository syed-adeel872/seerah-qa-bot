import { getEngine, ensureLiveCorpus } from "@/lib/search/search";
import { ChatClient } from "@/components/chat/chat-client";
import { Disclaimer } from "@/components/disclaimer";

export default async function Home() {
  await ensureLiveCorpus();
  const { corpus } = getEngine();
  const corpusSummary = `${corpus.counts.shamail} Shamail entries + ${corpus.counts.timeline} Seerah timeline entries · corpus v${corpus.corpusVersion}`;

  return (
    <>
      <ChatClient corpusSummary={corpusSummary} />
      <Disclaimer />
    </>
  );
}