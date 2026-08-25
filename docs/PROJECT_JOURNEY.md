# PROJECT_JOURNEY.md

## Seerah Q&A Bot — Complete Engineering Journey (Day Zero → Production)

A professional, enterprise-grade chronicle of the Seerah & Shamail Q&A bot — from initial framework selection through production deployment on Vercel. The project was conceived and executed as a trust-first, zero-hallucination conversational agent grounded exclusively in a fixed Islamic corpus.

**Total commits:** 60+ | **Production:** [seerah-qa-bot.vercel.app](https://seerah-qa-bot.vercel.app)

---

## Project DNA & Ground Rules

| Fact | Value |
|------|-------|
| Product | Conversational bot answering ONLY from a fixed Islamic corpus (Shamail 120 + Timeline 34 + Courses 20) |
| Corpus source | `https://api.islamicdesk.com/api/seerathon/corpus` (rate-limited: 60 req/min/IP) |
| Snapshot | `data/corpus.snapshot.json` (1,162 KB), version `1.0.0` |
| Core mandate | **Zero hallucination** — every answer cites source entries; fatwa/injection queries safely refused |
| Stack | Next.js 16.3.0, React 19.2.8, TypeScript ^5, Tailwind CSS ^4, Zod ^4.4.3, Vitest ^4.1.10 |
| Production | `https://seerah-qa-bot.vercel.app` (Vercel, auto-deploy from `main`) |

---

## Phase 1: Setup & Initial Architecture

### 1.1 Framework Scaffolding

The root `package.json` was configured as a Node `>=20` project with `"type": "module"`. A `web/` Next.js App-Router application was created with scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run), and `eval` (vitest run tests/eval.test.ts). Dependencies kept intentionally minimal — no heavy ML/ORM deps; retrieval is hand-rolled.

**Key files created:**
- `web/src/app/layout.tsx` — root layout
- `web/src/app/page.tsx` — landing page
- `web/src/app/api/chat/route.ts` — POST `/api/chat` endpoint
- `web/src/components/chat/chat-client.tsx` — chat interface
- `web/src/components/chat/samples.ts` — sample questions
- `web/src/components/disclaimer.tsx` — persistent disclaimer

### 1.2 Corpus Schema & Loading

**`web/src/lib/corpus/schema.ts`** — Zod schemas mirror the live API exactly:
- `ShamailEntrySchema`: `{ id, category{id,name}, slug{en,romanUrdu}, keywords[], en{title,hadeesTarjama,hadeesHawala,hikayat,type,points[]}, ur{...} }`
- `TimelineEntrySchema`, `CourseEntrySchema`, `SnapshotMetaSchema`
- Derived type `IndexedDoc` — normalized searchable unit with `titleEn/titleUr`, weighted fields, `textEn/textUr`, and `citation`

**`web/src/lib/corpus/load.ts`** — `loadCorpus()` parses frozen snapshot; `fetchCorpusFromAPI()` fetches live corpus at runtime with 15-minute TTL and snapshot fallback.

### 1.3 Phase 0: Schema Verification

**`scripts/verify-api-schema.mjs`** — probing/assertion harness hitting the live API and writing:
- `data/corpus.snapshot.json` (frozen fallback)
- `data/SchemaReport.md` — 45+ assertions, **0 failures**

### 1.4 Strict AI Guardrails (Initial)

**`web/src/lib/guardrails/blockers.ts`** — deterministic, fail-closed blockers:
- `FATWA_PATTERNS`: English (`fatwa`, `halal/haram`, `ruling`), Urdu script (فتوی, جائز, حکم), roman-Urdu (`riwa`, `sud`, `jaiz`)
- `INJECTION_PATTERNS`: prompt-extraction & jailbreak families
- `refusalText(kind, lang)` — tri-language refusal copy
- `redirectInfo()` — scholar-redirect mailto

---

## Phase 2: Seerah/Shamail Data Integration

### 2.1 Deterministic BM25 Retrieval

**`web/src/lib/search/bm25.ts`** — from-scratch BM25 index:
- Per-field weighting: `title × 4`, `keywords × 3`, `body × 2`, `slug × 1`
- Standard BM25 with `k1 = 1.5`, `b = 0.75`, smoothed IDF
- `docGroupsOf(docId)` — conflated token groups per doc

**`web/src/lib/search/search.ts`** — `search(query)` = `expandQuestion` → `BM25Index.search`, plus engine singletons, `searchSemantic()`, and `ensureLiveCorpus()`.

### 2.2 Trilingual Conflation Strategy

**`web/src/lib/search/tokenize.ts`** — 76 conflation groups unifying English + Urdu script + Roman Urdu:
- Arabic/Urdu normalization: tashkeel/tatweel stripped, alif forms unified, Farsi yeh→yeh, haa→haa
- `ALIAS_GROUPS` — 76 groups (e.g. `clothing` = `{clothing, clothes, libas, kapra, کپڑا, ...}`)
- `expandQuestion()` — synonym-mapping layer: appends group canonical keywords
- `STOP_WORDS` — function-word list across 3 scripts

### 2.3 Deterministic Grounded Generation

**`web/src/lib/engine/generate.ts`** — `generateDeterministicAnswer(sources, lang)`:
- Intro line per language ("Based on the Seerah & Shamail corpus" / "ذخیرے سے ماخوذ جواب")
- Per source: `[n] Title`, trimmed narration excerpt (600/700 chars), up to 2 key points
- `cleanText()` helper — strips headings/bullets/brackets for clean output

### 2.4 Tests

- `web/tests/bm25.test.ts` and `web/tests/corpus.test.ts` — unit coverage for tokenization, indexing, scoring

---

## Phase 3: AI & LLM Engine

### 3.1 Hybrid Semantic Engine

**`web/src/lib/semantic/`** — vector-based retrieval alongside BM25:
- `docText.ts` — `docEmbedText()` packs EN title + UR title + keywords + first 700 chars EN + first 700 chars UR + roman slug
- `embed.ts` — Gemini `gemini-embedding-001` (3072-dim), batch size 32, 3 attempts with exponential backoff
- `index.ts` — `SemanticIndex` with cosine similarity, query-embedding LRU cache (256 entries)

**`scripts/embed-corpus.mjs`** — offline precompute → `web/data/embeddings.json` (2.5 MB)

### 3.2 The Hybrid Scoring in `answer.ts`

```
hybridScore = bm25 + (semScore − 0.45) × 120   when semScore ≥ 0.45
```

Ranking: `hybridScore desc → coverage desc → titleOverlap desc`

### 3.3 Grounding Gates (Anti-Hallucination)

| Constant | Value | Meaning |
|----------|-------|---------|
| `minAbsScore` | 8 | absolute minimum BM25 for title-anchored hit |
| `titlelessMinScore` | 16 | higher bar for titleless hits |
| `minCoverage` | 0.5 | minimum fraction of content query tokens covered |
| `semTitlelessMin` | 0.62 | cosine for relaxed semantic anchor |
| `semBoostThreshold` | 0.45 | cosine floor before embedding boost |
| `semBoostScale` | 120 | boost per cosine unit |

### 3.4 LLM Query Rewriter

**`web/src/lib/search/rewrite.ts`** — raw question rewritten into clean English search phrase (3–12 words). Never used for output — detection, generation, mirroring use original question.

- System prompt with explicit roman-Urdu→English mappings
- OpenAI-compatible endpoint, temperature 0, max tokens 48
- Model fallback chain with cached skip list
- 512-entry in-memory result cache

### 3.5 Pass-1 / Pass-2 Routing

```
answerQuestion():
  1. ensureLiveCorpus(), detect lang, blockers (fail closed)
  2. PASS 1: answerFromQuery(original question)
       → if answered, return (deterministic, no LLM dependency)
  3. ELIGIBILITY gate: pass 2 only if user's words carry ≥ 1 ALIAS_GROUP_NAMES token
  4. PASS 2: rewrite = rewriteSearchQuery(question)
       answerFromQuery(rewritten)
       → answered ? return it : return pass-1 result
```

### 3.6 LLM-Powered Answer Generation (NEW)

**`web/src/lib/engine/llm-generate.ts`** — 148-line module for LLM answer synthesis:

**Three Language-Specific System Prompts:**

| Prompt | Language | Rules |
|--------|----------|-------|
| `SYSTEM_PROMPT_EN` | English | 8 rules including fatwa redirect, out-of-corpus, semantic synthesis, ban on lazy fallbacks |
| `SYSTEM_PROMPT_ROMAN_UR` | Roman Urdu | 9 rules including mandatory context usage, flexible semantic synthesis |
| `SYSTEM_PROMPT_UR` | Urdu | 8 rules including post-LLM refusal enforcement |

**Key prompt rules (final version):**
1. Fatwa redirect — refuse ruling queries, redirect to scholar
2. Out-of-corpus redirect — refuse non-Seerah topics
3. **Semantic synthesis** — "Think like a researcher, not a search engine. DO NOT look for exact word matches."
4. Laser-focused — answer only the specific question
5. **Strict ban on lazy fallbacks** — "NEVER say 'I don't have details' if passages contain ANY text"
6. Base only on context — no external knowledge
7. No internal thoughts — no bracketed reasoning
8. No fluff — just answer
9. **Mandatory context usage** — "If passages are provided, you are STRICTLY FORBIDDEN from saying 'I don't have details'"

**`buildContext()`** — builds "Retrieved corpus passages" context string for the LLM

**`generateWithLlm()`** — actual LLM call with:
- 20-second timeout per attempt
- 2 attempts per model
- Model fallback chain: `LLM_MODEL` → `LLM_MODEL_FALLBACKS`
- Returns `null` on any failure (caller falls back to deterministic)

**Integration in `answerFromQuery()`:**
```typescript
let text = generateDeterministicAnswer(sourcesForText, target);
const llmText = await generateWithLlm(retrievalQuery, sourcesForText, target);
if (llmText) text = llmText;
```

**Prompt Refinement Iterations:**
1. Initial 8-rule prompt with Rule 5 allowing "I don't have details" fallback
2. Rule 9 added — "strictly forbidden from saying 'I don't have details'"
3. Rule 5 rewritten — removed "no irrelevant oversharing" permission
4. Final 3-prompt rewrite — "Think like a researcher, not a search engine"
5. Rule 5 became "STRICT BAN ON LAZY FALLBACKS" — only accept absence when passages completely empty

### 3.7 Language Mirroring

**`web/src/lib/l10n/detect.ts`** — `QueryLang = "ur" | "roman-ur" | "en"`:
- Arabic script → Urdu
- 90+ roman-Urdu markers → roman-ur
- `answerLang()` — mirroring rule: English→English, Urdu→Urdu, Roman Urdu→Roman Urdu

**`web/src/lib/l10n/translit.ts`** — Urdu→roman transliteration (16 KB) for natural Roman Urdu output

---

## Phase 4: UI/UX & Layout Engineering

### 4.1 Copy Button

**Commit:** `a24b06c` — `CopyButton` component with:
- Clipboard API with legacy `execCommand` fallback
- 1.5s "Copied!" feedback with visual checkmark
- Applied to both user and bot message bubbles

### 4.2 Cursor & Interaction Fixes

**Commits:** `bd3b70a`, `2ebc54f`, `1d7abc3`
- Cursor pointer applied to all interactive elements
- Ask button disabled when input empty or busy (`cursor-not-allowed`)
- Consistent hover states across all buttons

### 4.3 Radial Gradient & Source Cards

**Commits:** `16e022a`, `ffcff30`, `7ba1e13`, `23b28a8`, `c53fc00`
- Radial gradient background: `radial-gradient(circle at top, rgba(6,78,59,0.35) 0%, rgba(3,7,18,1) 75%)`
- Source cards modernized — sleek emerald-tinted chips
- Suggestion pills redesigned with `rounded-full` emerald styling
- Full-width seamless background — removed nested box layout
- CSS `.glow-card` and `.input-glow` classes for focus effects

### 4.4 Layout Engineering — Scrolling & Alignment

**Commits:** `664ee35`, `9ae0550`, `0bce40c`, `0113232`, `9cc8c4a`, `cd2d71f`
- Layout scrolling: `h-screen`, `overflow-y-auto` on chat area
- Scrollbar moved to edge, footer transparent, debug text hidden
- Dark theme enforced: `bg-gray-950/80` backdrop-blur
- Persistent header — fixed at top, separate from scroll area
- ChatClient as fragment — `page.tsx` wraps ChatClient + Disclaimer in flex column

### 4.5 Bot Bubble Alignment Saga

**Commits:** `470effc`, `67e5e72`, `2b2b91a`, `9321ee5`, `f760aa1`, `6752253`

Six commits iterating on pixel-perfect alignment:
1. `px-4` removed from message list, `pr-4` added to user wrapper
2. `px-4 py-3` symmetric padding on bot bubble
3. Container alignment: both message list and footer share `max-w-4xl mx-auto w-full px-4`
4. Final: `px-4` on message list, `pr-4` on user wrapper

### 4.6 Premium UI Features

**Commit:** `cb3a44d`

**Trust Badges (header):**
- "Verified Corpus" — shield icon, emerald accent
- "Fatwa-Safe" — checkmark icon, gold accent
- "EN · Roman Urdu" — language indicator pill

**ShareButton Component:**
- `navigator.share` API on mobile
- Clipboard fallback on desktop
- Formats response + numbered source list for WhatsApp sharing

**Interactive SourceChips:**
- Each chip is clickable, opens `SourceModal`
- Chevron indicator, hover effects

**SourceModal:**
- Header with source type badge (Shamail/Timeline) and index
- English + Urdu titles
- Hawala / Reference box — `rounded-lg bg-emerald-500/5 border border-emerald-500/10`
- Category display
- Escape key / backdrop click to close

**AssistantBubble:**
- Wraps bot response with SourceChips, CopyButton, ShareButton, SourceModal state management

### 4.7 Citation Modal UI Iterations

**Commits:** `ee22bd8`, `f4c70a7`, `6545663`
1. First attempt — sleek minimal design with pill-style badges
2. Reference text restored — Hawala text made prominent in emerald card
3. Full revert — returned to original detailed layout with heavy Hawala box

---

## Phase 5: Safety & Guardrails System

### 5.1 Deterministic Blockers (Layer 1)

**File:** `web/src/lib/guardrails/blockers.ts`

**Initial FATWA_PATTERNS (12 regexes):**
- English: `fatwa`, `permissible`, `halal/haram`, `is it okay`, `can I...`, `ruling`
- Urdu script: فتوی, جائز, حکم, سود/جوا
- Roman Urdu: `riwa`, `sud`, `jaiz`

**Expanded FATWA_PATTERNS (30 regexes) — after fiqh gap identified:**

| Language | New Terms Added |
|----------|----------------|
| English | `qaza`, `qada`, `missed prayer`, `namaz timing`, `prayer time`, `roza`, `fasting`, `zakat`, `nikah`, `talaq`, `wudu`, `ghusl`, `tayammum`, `jummah` |
| Urdu script | `قضا`, `نماز کا وقت`, `روزہ`, `زکوٰة`, `نکAH`, `طلاق`, `وضو`, `غسل` |
| Roman Urdu | `qaza`, `qada`, `namaz ka/ki waqt`, `roza`, `zakat`, `nikah`, `talaq`, `wuzu`, `wudu`, `ghusl`, `jumma` |

**INJECTION_PATTERNS:** prompt-extraction & jailbreak families with Urdu-script variants

### 5.2 Post-LLM Refusal Inspection (Layer 2)

**File:** `web/src/lib/engine/answer.ts`

**Root Cause Identified:** When `checkBlockers()` misses a fiqh term (e.g., "qaza"), the query goes through full retrieval + LLM generation. The LLM's system prompt instructs it to refuse, but `answerFromQuery()` always returns `status: "answered"` with real citations — because the deterministic blocker didn't fire.

**Solution:**
```typescript
const LLM_REFUSAL_PATTERNS: RegExp[] = [
  // English fatwa/shari'i refusals
  /shari['']?\s?i\s?masla/i,
  /religious ruling/i,
  /consult\s+a\s+qualified\s+(scholar|aalim|mufti)/i,
  // English out-of-corpus refusals
  /can\s+only\s+answer\s+(from|questions\s+from)\s+(the\s+)?(seerah|shamail)/i,
  // Roman Urdu fatwa refusals
  /daaira[-\s]?e[-\s]?kaam\s+mein\s+nahi/i,
  /mustanad\s+aalim/i,
  // Urdu script refusals
  /(\u0634\u0631\u0639\u06CC\s+\u0641\u062A\u0648\u06CC\u06D2)/,
  /(\u0627\u0633\u062A\u0645\u0646\u062F\s+\u0639\u0627\u0644\u0645)/,
  // ... 26 patterns total
];

function isLlmRefusal(text: string): boolean {
  return LLM_REFUSAL_PATTERNS.some((re) => re.test(text));
}
```

**Applied after LLM generation in `answerFromQuery()`:**
```typescript
if (isLlmRefusal(text)) {
  return {
    status: "blocked",
    kind: "fatwa",
    text,
    lang,
    citations: [],  // ← stripped
    engine: "deterministic",
  };
}
```

### 5.3 Frontend Citation Gating

**File:** `web/src/components/chat/chat-client.tsx`

```typescript
const showCitations = answer.status === "answered" && answer.citations.length > 0;
```

Gates `SourceChips` and `ShareButton` — hidden for `"blocked"` and `"out_of_corpus"` statuses.

### 5.4 Two-Layer Safety Summary

| Layer | Location | What It Catches | How |
|-------|----------|-----------------|-----|
| **Layer 1** | `blockers.ts` (pre-retrieval) | Exact keyword matches (fatwa, halal, qaza, namaz, etc.) | 30+ deterministic regex patterns |
| **Layer 2** | `answer.ts` (post-LLM) | LLM-generated refusals that slipped past Layer 1 | 26 refusal text patterns, strips citations, forces `status: "blocked"` |
| **Layer 3** | `chat-client.tsx` (frontend) | Any remaining non-"answered" status | `showCitations` gate hides all citation UI |

---

## Phase 6: File Map & Final Testing

### Repository Layout

```
Seerah_QA_Bot/
├── README.md                                  # Landing page for judges
├── PROJECT_JOURNEY.md                         # Original engineering chronicle
├── docs/
│   ├── PROJECT_JOURNEY.md                     # This file (comprehensive)
│   └── DATA_SOURCE.md                         # Corpus grounding docs
├── package.json                               # root: "phase0" script
├── scripts/
│   ├── verify-api-schema.mjs                  # Phase 0: API verification
│   └── embed-corpus.mjs                       # Phase 4: offline embedding
├── data/
│   ├── corpus.snapshot.json                   # frozen corpus (120+34+20)
│   └── SchemaReport.md                        # 45+ assertions, 0 failures
├── web/
│   ├── data/embeddings.json                   # 2.5 MB precomputed vectors
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                     # root layout (h-full overflow-hidden)
│   │   │   ├── page.tsx                       # landing page (flex col, radial gradient)
│   │   │   ├── globals.css                    # CSS vars, gradients, .glow-card
│   │   │   └── api/chat/route.ts             # POST /api/chat
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── chat-client.tsx            # Chat UI (CopyButton, ShareButton, SourceModal, SourceChips, AssistantBubble)
│   │   │   │   └── samples.ts                # sample questions
│   │   │   └── disclaimer.tsx                 # persistent disclaimer
│   │   └── lib/
│   │       ├── corpus/{schema,load}.ts        # Zod schemas, corpus loading
│   │       ├── search/{bm25,tokenize,search,rewrite}.ts  # BM25, conflation, facade, LLM rewrite
│   │       ├── semantic/{embed,index,docText}.ts  # Gemini embeddings, cosine search
│   │       ├── engine/{answer,llm-generate,generate}.ts  # Pipeline, LLM synthesis, deterministic gen
│   │       ├── l10n/{detect,translit}.ts      # Language detection, transliteration
│   │       ├── guardrails/blockers.ts         # 30+ fatwa/injection patterns
│   │       └── utils.ts                       # cn() helper
│   └── tests/{eval,bm25,corpus}.test.ts       # 69 eval cases + unit tests
```

### Updated File Map

| Module | Path | Role |
|--------|------|------|
| Corpus schema | `web/src/lib/corpus/schema.ts` | Zod schemas + `IndexedDoc` |
| Corpus load | `web/src/lib/corpus/load.ts` | Snapshot parse + live fetch + TTL cache |
| Tokenization | `web/src/lib/search/tokenize.ts` | 76 conflation groups, normalization |
| BM25 | `web/src/lib/search/bm25.ts` | Weighted per-field BM25 |
| Search facade | `web/src/lib/search/search.ts` | `search`, `searchSemantic`, engine singletons |
| LLM rewrite | `web/src/lib/search/rewrite.ts` | Query normalization w/ model fallback |
| Embeddings | `web/src/lib/semantic/embed.ts` | Gemini batch embedder w/ backoff |
| Semantic index | `web/src/lib/semantic/index.ts` | Cosine top-K, vector cache |
| Embed text | `web/src/lib/semantic/docText.ts` | Canonical trilingual embed payload |
| **Pipeline** | `web/src/lib/engine/answer.ts` | Pass 1/2, hybrid scoring, **post-LLM refusal inspection** |
| **LLM generation** | `web/src/lib/engine/llm-generate.ts` | **3 language-specific system prompts, LLM synthesis** |
| Deterministic gen | `web/src/lib/engine/generate.ts` | Deterministic answer builder |
| Language | `web/src/lib/l10n/{detect,translit}.ts` | Mirroring + romanization |
| Guardrails | `web/src/lib/guardrails/blockers.ts` | **30+ fatwa/injection patterns, expanded fiqh terms** |
| Eval | `web/src/lib/eval/cases.ts` | 69 pinned cases |
| API route | `web/src/app/api/chat/route.ts` | POST /api/chat |
| **UI** | `web/src/components/chat/chat-client.tsx` | **Chat, CopyButton, ShareButton, SourceModal, SourceChips, AssistantBubble, citation gating** |
| **CSS** | `web/src/app/globals.css` | **CSS vars, gradients, .glow-card, .input-glow** |
| Vectors | `web/data/embeddings.json` | 2.5 MB precomputed embeddings |
| Snapshot | `data/corpus.snapshot.json` | Frozen corpus fallback |
| Tests | `web/tests/{eval,bm25,corpus}.test.ts` | 69 eval cases + unit coverage |

### Live Verification (Production)

| Query | Result |
|-------|--------|
| "Aqa Kareem ﷺ pehnawa kaisa tha?" | **answered**, clothing doc, lang `roman-ur` |
| "huzoor ne jung mein zirah pehni thi?" | answered, armor doc |
| "metal gear during war" | answered, armor doc |
| "what protection did the prophet wear going into battle" | answered, armor doc |
| "نبی ﷺ کا صبر کیسا تھا؟" | answered, patience doc, lang `ur` |
| "Khalid Bin Waleed" | `out_of_corpus` |
| "Who won the 2022 football World Cup?" | `out_of_corpus` |
| "Fajar ki qaza ka kya waqt hai?" | **blocked** (fatwa) — expanded FATWA_PATTERNS + post-LLM refusal |

---

## Complete Commit History

| # | Hash | Message |
|---|------|---------|
| 1 | `f290176` | feat: complete Seerah QA Bot |
| 2 | `5fc7aed` | feat: hybrid semantic search, LLM query rewrite, and roman-urdu mirroring |
| 3 | `025f89e` | docs: add comprehensive project journey |
| 4 | `a24b06c` | feat: copy button added |
| 5 | `5d31a01` | trigger vercel update |
| 6 | `8cf574c` | update root directory to web |
| 7 | `bd3b70a` | fix: apply cursor pointer to buttons |
| 8 | `2ebc54f` | fix: force update copy button cursor and conditional not-allowed Ask button |
| 9 | `1d7abc3` | fix: fix Ask button disabled state and cursor logic |
| 10 | `16e022a` | polish: modernize source cards, suggestion pills, and background depth |
| 11 | `ffcff30` | style: apply radial gradient background and clean up source cards UI |
| 12 | `7ba1e13` | style: add inline radial glow, limit layout max-width to 3xl, and polish source cards |
| 13 | `23b28a8` | fix: remove full-page boxing, make background full-width, center inner content properly |
| 14 | `c53fc00` | style: complete UI overhaul - remove nested boxes, apply seamless full-width background |
| 15 | `bd79f74` | fix: add missing percentage sign in radial gradient inline style |
| 16 | `75f79bf` | fix: resolve Unterminated regexp literal JSX error to fix Vercel build |
| 17 | `664ee35` | fix: resolve layout scrolling, show input box, and center suggestion chips |
| 18 | `9ae0550` | style: move scrollbar to edge, make footer transparent, hide debug text |
| 19 | `0bce40c` | fix: chat message alignment, prevent top clipping, and force transparent footer |
| 20 | `0113232` | style: fix stark white footer and enforce dark theme backdrop |
| 21 | `9cc8c4a` | fix: make header persistent, correct bot bubble alignment, and enforce natural AI responses |
| 22 | `cd2d71f` | feat: implement persistent header, refined chat bubbles, and natural AI output |
| 23 | `470effc` | style: align bot message bubble strictly to the left |
| 24 | `67e5e72` | style: remove container padding to make bot messages flush left |
| 25 | `2b2b91a` | style: fix bot bubble padding and align chat container with input box |
| 26 | `9321ee5` | style: fix absolute alignment of bot bubble with input box |
| 27 | `f760aa1` | fix: unify chat container and footer input alignment perfectly |
| 28 | `6752253` | fix: make chatbot response strictly flush left |
| 29 | `b918e75` | feat: optimize LLM system prompt for concise and natural Roman Urdu responses |
| 30 | `16c22c8` | fix: enforce LLM to generate descriptive answers from retrieved context |
| 31 | `2860af4` | fix: enforce fatwa redirection rule, hide internal queries, and improve factual extraction |
| 32 | `22e0ad8` | fix: strictly separate fatwa redirection from generic fallback and prevent irrelevant RAG oversharing |
| 33 | `cb3a44d` | feat: implement premium UI features, source chips, and ensure persistent disclaimer visibility |
| 34 | `0c18bc8` | fix: resolve RAG contradiction where LLM outputs no-details fallback despite valid retrieved context |
| 35 | `bdb5453` | fix: enforce global smart semantic synthesis and prevent premature fallbacks across all queries |
| 36 | `ee22bd8` | style: update citation modal design to be sleek and modern with zero backend impact |
| 37 | `f4c70a7` | fix: restore missing citation reference text inside a modern modal badge |
| 38 | `6545663` | style: revert citation modal back to its original clean and detailed layout |
| 39 | `2370c8a` | fix: hide citation cards and source chips on refusal or disclaimer responses |
| 40 | `ca0bfc4` | fix: strip citations and block source cards when LLM generates a refusal or disclaimer |

---

## Recent Additions

| Feature | Description |
|---------|-------------|
| `renderBoldText()` | Parses `**bold**` markdown into `<strong>` elements for formatted bot output |
| `AbortController` | Cancels in-flight LLM requests when user sends a new question, preventing stale responses |
| `sanitizeRomanUrdu()` | Strips all non-ASCII characters from Roman Urdu LLM output to ensure clean Latin-only text |
| SourceModal scrollable text boxes | English and Urdu full text rendered in `max-h-48 overflow-y-auto` containers for long content |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` |
| API error handling | `answerQuestion()` wrapped in try/catch in `route.ts` — returns structured error responses instead of 500s |
| Expanded guardrails | FATWA_PATTERNS expanded from ~30 to 34+, INJECTION_PATTERNS from ~12 to 19, LLM_REFUSAL_PATTERNS from 15 to 26 |

---

**End of Document**
