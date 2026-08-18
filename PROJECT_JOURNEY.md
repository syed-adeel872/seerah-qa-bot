# PROJECT_JOURNEY.md

## Seerah Q&A Bot — Complete Development History (Day Zero → Today)

A chronological, technical log of every step taken to build the **zero-hallucination Seerah & Shamail Q&A bot** — from a bare Next.js scaffold to a production hybrid (BM25 + vector-semantic + LLM-rewrite) engine deployed on Vercel.

---

## 0. Project DNA & Ground Rules

| Fact | Value |
| ---- | ----- |
| Product | Conversational bot answering ONLY from a fixed Islamic corpus (Shamail 120 + Seerah Timeline 34 + Courses 20) |
| Corpus source | `https://api.islamicdesk.com/api/seerathon/corpus` (rate-limited: 60 req/min/IP) |
| Corpus snapshot | `data/corpus.snapshot.json` (1,162 KB), SHA-256 `71adf67ea8ffa94e2874303b4dd6b20ba07923aa286678bbc26179d123f67ffb`, corpus version `1.0.0` |
| Core mandate | **Zero hallucination** — answer only from retrieved corpus text; cite every source; refuse fatwa/ruling queries and redirect to a scholar |
| Stack | Next.js `16.3.0` (App Router, Turbopack), React `19.2.8`, TypeScript `^5`, Tailwind CSS `^4`, `zod` `^4.4.3`, Vitest `^4.1.10`, Node `>=20` |
| Git history | `f290176` "feat: complete Seerah QA Bot" → `5fc7aed` "feat: hybrid semantic search, LLM query rewrite, and roman-urdu mirroring" |
| Production | `https://seerah-qa-bot.vercel.app` (Vercel, project `seerah-qa-bot`) |

### Repository layout (final state)

```
Seerah_QA_Bot/
├── package.json                      # root: "phase0" script (schema verification)
├── scripts/
│   ├── verify-api-schema.mjs         # Phase 0: probe + assert the live API, write snapshot + SchemaReport
│   └── embed-corpus.mjs              # Phase 4: offline embedding precompute -> web/data/embeddings.json
├── data/
│   ├── corpus.snapshot.json          # frozen corpus (120 + 34 + 20 entries)
│   ├── SchemaReport.md               # full API schema verification report
│   └── brief_extracted.txt           # text pulled from the project brief PDF
├── web/                              # the Next.js application (Vercel root)
│   ├── data/embeddings.json          # 2.5 MB precomputed vector cache (keyed by doc id)
│   ├── src/
│   │   ├── app/{layout,page}.tsx, api/chat/route.ts
│   │   ├── components/chat/{chat-client,samples}.tsx, disclaimer.tsx
│   │   └── lib/
│   │       ├── corpus/{schema,load}.ts
│   │       ├── search/{bm25,tokenize,search,rewrite}.ts
│   │       ├── semantic/{embed,index,docText}.ts
│   │       ├── engine/{answer,generate}.ts
│   │       ├── l10n/{detect,translit}.ts
│   │       ├── guardrails/blockers.ts
│   │       └── eval/cases.ts
│   └── tests/{eval,bm25,corpus}.test.ts, setup-env.ts, vitest.config.ts
```

---

## 1. Initial Setup & Foundation

### 1.1 Framework scaffolding

- Created the root monorepo-shaped package (`package.json`, `"name": "seerah-qa-bot"`, Node `>=20`, `"type": "module"`) and a `web/` Next.js App-Router application.
- Web app scripts: `dev` (`next dev`), `build` (`next build`), `start`, `lint` (`eslint`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `eval` (`vitest run tests/eval.test.ts --no-color`).
- Dependencies kept intentionally tiny: Next, React, Tailwind, zod (API validation), vitest (tests). No heavy ML/ORM deps — retrieval is hand-rolled.

### 1.2 Loading the corpus (schema + snapshot)

- **`web/src/lib/corpus/schema.ts`** — Zod schemas mirroring the live API exactly:
  - `ShamailEntrySchema`: `{ id, category{id,name}, slug{en,romanUrdu}, keywords[], en{title,hadeesTarjama,hadeesHawala,hikayat,type,points[]}, ur{...} }`.
  - `TimelineEntrySchema`: `{ id, slug, en{title,description,section,umarMubarak,gregorianDate,content[{title,sequence,content_text}]}, ur{...} }`.
  - `CourseEntrySchema`, `SnapshotMetaSchema` (version, sources, disclaimer, rate_limit, counts), `CorpusSnapshotSchema`.
  - Derived types: `IndexedDoc` — the **normalized searchable unit** with `titleEn/titleUr`, weighted `fields { title, body, keywords, slug }`, plain `textEn/textUr` (display/generation), and `citation` (verbatim source chips).
- **`web/src/lib/corpus/load.ts`** — `loadCorpus()` parses the frozen snapshot and flattens every entry into an `IndexedDoc`; `fetchCorpusFromAPI()` fetches the live corpus at runtime.

### 1.3 Phase 0: schema verification harness

- **`scripts/verify-api-schema.mjs`** — a probing/assertion harness that hit the live API (meta, pagination math, shamail/timeline/courses endpoints, bad-id behavior, `include_hikayat`) and wrote:
  - `data/corpus.snapshot.json` (frozen fallback corpus),
  - `data/SchemaReport.md` — 45+ assertions, **0 failures**, snapshot SHA pinned.
- This "fail closed to a frozen snapshot" approach became the cornerstone: the bot never depends on the live API being up.

### 1.4 Strict AI guardrails (zero-hallucination core)

- **`web/src/lib/guardrails/blockers.ts`** — deterministic, **fail-closed** blockers evaluated *before any retrieval or generation*:
  - `FATWA_PATTERNS`: English (`fatwa`, `permissible`, `halal/haram`, `is it ok`, `can I ...`, `ruling`), Urdu script (فتوی, جائز, حکم, سود/جوا), roman-Urdu (`riwa`, `sud`, `jaiz`, ...).
  - `INJECTION_PATTERNS`: prompt-extraction & jailbreak families (`ignore previous instructions`, `you are now`, `reveal system prompt`, `jailbreak`, `developer mode`, `repeat prompt`) with Urdu-script variants constructed via `new RegExp`.
  - `refusalText(kind, lang)` — refusal copy in **all three languages** (English / Urdu / roman-Urdu).
  - `redirectInfo()` — the "consult a scholar" mailto redirect shown for fatwa queries.
- Rationale encoded in the code comments: *"better to refuse an ambiguous fatwa-adjacent question than risk a ruling."* Refusals are conservative on purpose.

---

## 2. Core Search & UI Generation

### 2.1 Deterministic BM25 retrieval

- **`web/src/lib/search/bm25.ts`** — a from-scratch BM25 index:
  - **Per-field weighting**: `title × 4`, `keywords × 3`, `body × 2`, `slug × 1`.
  - Standard BM25 with `k1 = 1.5`, `b = 0.75`, smoothed IDF `log(1 + (N − df + 0.5)/(df + 0.5))`, length normalization per field.
  - Every hit carries `matchedGroups` (conflated query tokens that matched) and `substantive` (matched a real field, not just slug noise).
  - `docGroupsOf(docId)` — the unique conflated token **groups** per doc across all fields; this becomes the backbone of the grounding/coverage gates later.
- **`web/src/lib/search/search.ts`** — `search(query)` = `expandQuestion` (synonym layer) → `BM25Index.search`, plus `getEngine()` singletons (corpus + index), `getSemantic()`, `searchSemantic()` (best-effort, returns `[]` on any failure), and `ensureLiveCorpus()` (live-API warm with a 15-minute TTL, snapshot fallback, 60-req/min respect).

### 2.2 Deterministic grounded generation

- **`web/src/lib/engine/generate.ts`** — `generateDeterministicAnswer(sources, lang)` builds the reply **exclusively from retrieved doc text**:
  - Intro line per language ("Based on the Seerah & Shamail corpus" / "ذخیرے سے ماخوذ جواب" / "Seerah aur Shamail corpus se makhuz jawab").
  - Per source: `[n] Title`, a trimmed narration excerpt (`trimExcerpt`, 600 chars for shamail, 700 for timeline), and up to **2 key points** extracted from the entry's own trailing "points" paragraphs.
  - Closing line reiterating that every statement is drawn only from cited entries.
  - Roman-Urdu titles come from the corpus's own `slug.romanUrdu` (e.g. `huzoor-ka-salan-mubarak`) so roman output stays natural.
- Generation is the *only* answer path (spec-mandated safe fallback) — no external LLM is ever used to *write* an answer.

### 2.3 Chat UI, citations & source-linking

- **`web/src/app/api/chat/route.ts`** — POST `/api/chat`, zod-validated (`question` 1–1000 chars), Node runtime, force-dynamic; returns the full `Answer` JSON.
- **`web/src/components/chat/chat-client.tsx`** — the chat interface:
  - Message bubbles with Urdu RTL styling (`font-ur rtl`), source chips, expandable source list, **citation cards** linking to corpus sources.
  - A footer showing `engine: …`, `corpus v…`, and `match NN%` — which later grows observability fields (Phase 7).
  - Fatwa/warn styling for blocked answers and the scholar-redirect.
- **`web/src/components/chat/samples.ts`** — quick sample questions; **`web/src/components/disclaimer.tsx`** — the persistent disclaimer required by the spec.

### 2.4 Tests land early

- **`web/tests/bm25.test.ts`** and **`web/tests/corpus.test.ts`** — unit coverage for tokenization, indexing, and scoring so the search core is locked down before higher layers are added.

---

## 3. The Synonym & Tokenization Fix (the "English-only" wall)

### 3.1 The problem

The first retrieval was purely English-keyword based. Real users type Urdu script and roman-Urdu ("huzoor ka **libas** kaisa tha", "huzoor ka **khana**", "نبی ﷺ کا **صبر**"). Without conflation, these queries matched nothing and the bot refused — even though the corpus contained the answer in three languages.

### 3.2 `web/src/lib/search/tokenize.ts` — the conflation engine

- **Arabic/Urdu normalization**: tashkeel + tatweel stripped, alif forms (أ إ آ ا) → ا, ؤ→و, ئ→ي, ة→ه, Farsi ی→ي, ھ ہ→ه, plus a defined set of Urdu retroflex letters.
- **`ALIAS_GROUPS`** — **76 conflation groups** (e.g. `prophet`, `birth`, `marriage`, `eating`, `drinking`, `stature`, `clothing`, `armor`, `battle`, `badr`, `khaybar`, `tabuk`, `gravy`, `complexion`, `smile`, `fragrance`, `silence`, `love`, `worship`, ...). Each maps English + Urdu-script + roman-Urdu spellings to ONE canonical group. Example: `clothing` = `{clothing, clothes, cloth, dress, dressed, attire, libas, kapra, kapre, kapray, pehnawa, pehnaw, poshaak, poshak, لباس, کپڑا, کپڑے, پہنتے}`.
- **`GROUP_CANONICALS`** — one canonical English keyword per group (e.g. `clothing → "clothing"`, `armor → "armor"`).
- **`TO_GROUP`** — a precomputed token→group map (all members normalized identically to query/doc text so keys match exactly).
- **`ALIAS_GROUP_NAMES`** — exported set of group ids; later used as the "topical anchor" tokens by the semantic/rewrite gates.
- **`expandQuestion()`** — the synonym-mapping layer: for every query token that resolves to a group, appends the group's canonical English keyword. Because synonym and canonical conflate to the SAME group id, dedup makes this *additive-only* — it never lowers coverage and can never invent a match for an out-of-corpus word.
- **`STOP_WORDS`** — a large function-word list across English, Urdu script, and roman-Urdu (plus patronymic connectors `bin/ibn/bint`), all normalized through the same pipeline so `میں` matches its own normalized form. `queryTokens()` = unique tokens minus stop words.

### 3.3 Result

One query token now unifies three scripts. "huzoor ka **libas**", "هزور کے **کپڑے**", and "what was the Prophet's **clothing**" all land on the same group — and BM25 across the trilingual corpus finally works.

---

## 4. The Semantic & Hybrid Engine Upgrade

### 4.1 Why BM25 alone wasn't enough

BM25 is lexical: a question phrased with words the corpus never uses (e.g. "metal gear" for **armor**) scores zero. We needed *meaning* — vector embeddings.

### 4.2 Embedding layer (`web/src/lib/semantic/`)

- **`docText.ts`** — `docEmbedText()` packs **English title + Urdu title + keywords + first 700 chars of EN + first 700 chars of UR + roman slug** into one embedding string, so a query in *any* of the three languages lands near the same entry. A comment pins the contract: *"This MUST stay identical between the offline precompute script and the runtime SemanticIndex."*
- **`embed.ts`** — Gemini embeddings client:
  - Model `gemini-embedding-001` (3072-dim), native `batchEmbedContents` endpoint (`…/v1beta/models/{model}:batchEmbedContents`), key via `x-goog-api-key` (`EMBEDDINGS_API_KEY || LLM_API_KEY`).
  - Batch size 32; **3 attempts with exponential backoff**, honoring the server's `Retry-After` header, capped at 5 s per wait.
  - Failures are **logged** (`[semantic] embeddings unavailable after retries: …`) rather than silently swallowed — a key observability requirement from later phases.
- **`index.ts`** — `SemanticIndex`:
  - Loads precomputed vectors from disk, computes cosine similarity, keeps a query-embedding LRU cache (256 entries).
  - Lazy-embeds any doc id missing from the cache and exposes `coverage` (fraction of docs with vectors) and `lastError`.
  - `search()` returns `[]` on any failure so the deterministic pipeline is never blocked — but now *records why*.

### 4.3 Offline precompute

- **`scripts/embed-corpus.mjs`** — embeds the whole snapshot (154 searchable entries) offline and writes **`web/data/embeddings.json` (2.5 MB)** of base64-encoded Float32 vectors keyed by doc id. The runtime therefore never re-embeds the corpus in the common case.
- `web/.gitignore` allows exactly `web/data/embeddings.json` through (`/data/*` + `!/data/embeddings.json`).

### 4.4 The hybrid scoring in `web/src/lib/engine/answer.ts`

- Retrieval runs **both** pipelines: `search(query)` (BM25) and `searchSemantic(query, 8)` (cosine top-K).
- Each candidate in the merged pool carries `bm25Score`, `semScore`, `coverage`, `titleOverlap`, and a **hybrid score**:
  `hybridScore = bm25 + (semScore − 0.45) × 120` when `semScore ≥ 0.45` (the boost scale lets a strong semantic match overtake a BM25 gap of up to ~30 points).
- Ranking: `hybridScore desc → coverage desc → titleOverlap desc`.

### 4.5 The grounding gates (the anti-hallucination contract)

`OUT_OF_CORPUS` thresholds, all empirically calibrated against the live corpus:

| Constant | Value | Meaning |
| -------- | ----- | ------- |
| `minAbsScore` | 8 | absolute minimum BM25 for a title-anchored hit |
| `titlelessMinScore` | 16 | higher bar for titleless hits (Khalid incidental mention ≈ 13 → rejected) |
| `minCoverage` | 0.5 | minimum fraction of content query tokens covered |
| `semTitlelessMin` | 0.62 | cosine required for the relaxed semantic anchor |
| `semBoostThreshold` | 0.45 | cosine floor before an embedding match may boost rank |
| `semBoostScale` | 120 | boost per cosine unit |

- Gate 1 (`grounded`): `coverage > 0` AND (`bm25 ≥ 8` OR `semScore ≥ 0.5`).
- Gate 2 (unified grounding proof): the best candidate must satisfy EITHER
  - **Lexical**: `coverage ≥ 0.5` and BM25 ≥ the title-anchored (8) or titleless (16) bar; OR
  - **Semantic**: a *recognized topical group* shared by query and doc AND `semScore ≥ 0.62`.

---

## 5. Advanced Language Mirroring

### 5.1 Detection (`web/src/lib/l10n/detect.ts`)

- `QueryLang = "ur" | "roman-ur" | "en"`; `hasArabicScript()` checks `[\u0600-\u06FF]`.
- `detectQueryLang()`: Arabic script → `ur`; otherwise a dictionary of ~90 near-infallible roman-Urdu markers (`huzoor`, `kya`, `hai`, `sabr`, `jung`, `kaisa`, `saalan`, ...) → `roman-ur`; else `en`.
- `explicitlyRequestsUrdu()` — "اردو میں" or a bare "urdu" forces Urdu even in an otherwise English query; a bare "roman urdu" does NOT (that reads English).
- `answerLang(q, question?)` — **mirroring rule**: English → English, Urdu script → Urdu script, roman-Urdu → roman-Urdu; an explicit Urdu request always wins.

### 5.2 Transliteration (`web/src/lib/l10n/translit.ts`, 16 KB)

- A large, ordered Urdu→roman transliteration rule table (`urduToRoman`) implementing Urdu orthography (aspirates, retroflexes, nasal forms like ں, yeh/wao variants) so `textUr` can be rendered as natural roman-Urdu when the user typed roman-Urdu.
- Roman-Urdu *titles* prefer the corpus's own `slug.romanUrdu`; body text is generated by `urduToRoman`.
- Eval enforces this with `noArabicScript` assertions: a roman-Urdu answer must contain **zero** Arabic-script characters and must contain expected roman tokens (e.g. `salan`, `qad`, `libas`).

---

## 6. The LLM Query Rewriter (Crucial Edge-Case Fix)

### 6.1 The failures that motivated it

Two stubborn classes refused under pure lexical+semantic retrieval:
- **Roman-Urdu slang**: "Aqa Kareem ﷺ **pehnawa** kaisa tha?" — even with the `clothing` group, pass-1 coverage was ⅓ → rejected.
- **Indirect English**: "**metal gear** during war" / "what protection did the prophet **wear** going into battle" — the corpus keyword *armor* never appears in the query; the intended doc only surfaces after normalization.

### 6.2 `web/src/lib/search/rewrite.ts`

- A **retrieval-only** LLM step: the raw question is rewritten into a clean, search-friendly English phrase (3–12 words) before BM25 + semantic search. The rewrite is **never** used for output — language detection, answer generation, and mirroring still use the original question.
- `SYSTEM_PROMPT` gives explicit roman-Urdu→English mappings (`pehnawa/poshaak/libas/kapray → clothing`, `zirah/jangi libas → armor`, `salan → gravy`, `qad/hulya → stature and appearance`, `jung → battle`, `huzoor/aqa/aap → Prophet`) and forbids inventing facts.
- Uses the **OpenAI-compatible** endpoint `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, `temperature 0`, `max_tokens 48`.
- **Model fallback chain**: `LLM_MODEL` first, then each `LLM_MODEL_FALLBACKS` entry. A known-404 model is cached (`MODEL_CACHE`) and skipped on subsequent calls. The double-slash URL bug (`/openai//chat/completions` → HTTP 404) was fixed by stripping the trailing slash.
- **Model field-notes**: `gemini-2.5-flash` and `gemini-2.5-flash-lite` both return 404 ("no longer available to new users"); `gemini-3.5-flash-lite` returns 200 with content; `gemini-3.6-flash` returns 200 but *empty* content (thinking model) → rejected by the empty-output guard.
- **Resilience** (hardened later): transient errors (timeout / 5xx / 429) are retried once per model with a short backoff, a failing model falls through to the next candidate, and the first attempt gets a 15 s budget while the retry gets 8 s. On total failure the raw query is returned **with a logged warning** — never silently.
- A 512-entry in-memory result cache avoids re-invoking the LLM for repeated questions.

### 6.3 The pass-1 / pass-2 routing in `answer.ts`

```
answerQuestion():
  1. ensureLiveCorpus(), detect lang, blockers (fail closed)
  2. PASS 1: answerFromQuery(original question, original tokens, BM25(original))
       -> if answered, return (deterministic, pre-rewrite behavior; no LLM dependency)
  3. ELIGIBILITY gate: pass 2 only if the user's OWN words carry >= 1
     ALIAS_GROUP_NAMES token.  (A name-only query like "Khalid Bin Waleed"
     must not get a topic invented for it by a rewrite.)
  4. PASS 2: rewrite = rewriteSearchQuery(question)
       significant = queryTokens(rewritten) minus GENERIC_REWRITE_TOKENS
                   (prophet, muhammad, physical, general, description,
                    characteristics, history, beloved, blessed, dear, noble)
       answerFromQuery(rewritten, significant, BM25(rewritten))
       -> answered ? return it : return the pass-1 (refusal) result
```

### 6.4 Verification pins added

`web/src/lib/eval/cases.ts` grew to **69 cases** with hard doc pins and language assertions:
- `en-sem-armor` "metal gear during war" → `6754230f1ce008001f091239` (armor)
- `en-sem-armor2` "what protection did the prophet wear going into battle" → armor
- `roman-zirah-mirror` "huzoor ne jung mein zirah pehni thi?" → armor + `requireTextToken: "zirah"` + `noArabicScript`
- `roman-pehnawa-mirror` "Aqa Kareem ﷺ pehnawa kaisa tha?" → clothing `675176a1d2c9eb00202fca07` + `requireTextToken: "libas"` + `noArabicScript`

---

## 7. Resilience, Fallbacks & Debugging

### 7.1 The title-anchor constraint relaxed

The original semantic proof required a title-anchor (query token in the doc title) for semantic grounding. Body-only matches (armor, clothing) were rejected. The anchor was replaced with a **topical-group anchor**: the query must share a *recognized conflation group* with the doc, plus `semScore ≥ 0.62`. Calibration on `gemini-embedding-001`: armor → Battle-of-Uhud ≈ 0.76, clothing ≈ 0.78 (pass); incidental name mentions do not clear the bar. This is what finally lets body-only documents be accepted *without* relaxing the Khalid/out-of-corpus gates.

### 7.2 The "prophet is in every doc" coverage fix

The `prophet` group appears in essentially every corpus entry, so counting it toward coverage let any doc "cover" a query purely via the universal reference. Two probes exposed the exact failure:

```
"metal gear during war"        -> significant: metal, gear, during, battle
   Battle of Khaybar  cov=0.50 (during+battle)  <- WRONG top doc
"what protection did the prophet wear going into battle"
   Battle of Tabuk   cov=0.60 (prophet+wear+battle)  <- WRONG top doc
```

Fixes applied:
- Coverage now uses `coverageTokens = significant minus "prophet"` (both numerator **and** denominator), so the universal token can neither inflate nor be relied upon.
- `during, wear, wore, worn, wearing` were added to `STOP_WORDS` (function/light-verb filler the battle docs happen to contain). Deliberately **not** added: `going`/`ever` — unmatched tokens must stay in the denominator to keep the ratio low for indirect queries.
- Net effect: the battle docs dropped to cov 0.33/0.25 → pass-1 rejects → pass-2 rewrite surfaces the armor doc lexically (armor is in its title), *even while the embedding API is down*.

### 7.3 Retry / backoff for embedding API rate limits

- `embedBatch` upgraded from 2 attempts×500 ms to **3 attempts with exponential backoff** (500 ms, 1 s, 1.5 s), honors `Retry-After`, and emits a `[semantic]` warning on exhaustion.
- `SemanticIndex` now exposes `lastError` and logs when doc/query embedding fails, so a rate-limit or key issue is visible in server logs instead of a quiet BM25 fallback.

### 7.4 Graceful degradation, made *visible*

- Generation is always deterministic; retrieval degrades gracefully (semantic → pure BM25). What changed is **observability**:
  - `Answer.engine` is now `"deterministic" | "hybrid"` — `hybrid` only when the winning candidate carried a real `semScore > 0`.
  - New `Answer.rewrittenQuery` — the LLM rewrite actually used (pass 2).
  - New `Answer.semantic { available, used }` — whether the embedding layer returned hits and whether they influenced the winner.
- The chat footer (`chat-client.tsx`) now renders: `engine: hybrid|deterministic`, `semantic: ok/unavailable (used)`, `rewrite: "…"`, `corpus v…`, `match NN%`.

### 7.5 The embedding-quota incident (documented)

During verification the Gemini embedding API hit its **daily rate-limit/quota** (all `searchSemantic` calls returned empty; every `rewSem` was 0.000). This is environmental, not a code bug — the code path was validated earlier (armor rewSem 0.760–0.768, clothing 0.778), and the new `semantic.available:false` footer/field now surfaces the degraded state honestly instead of hiding it.

### 7.6 Evaluation hardening

- `tests/eval.test.ts` asserts a **hard gate of ≤ 1 failure** across all 69 cases and prints a per-case report (answered citation coverage, out-of-corpus grounding, blocked refusal rate).
- Known flakiness (rewrites drift run-to-run) is a documented caveat; the lexical pass-2 path (armor/clothing in titles) is what keeps the semantic-dependent cases stable even without embeddings.

---

## 8. Final Deployment & Version Control

### 8.1 The critical finding

Production was running the **first and only commit** (`f290176`). Every hybrid/rewrite/mirroring feature lived in the *uncommitted* working tree — so the live bot had none of them. That is exactly why, in live testing, the Urdu query answered but "pehnawa" and indirect-English queries refused: the deployed code had no `clothing`/`armor` groups, no pass-2 rewrite, and no semantic layer.

### 8.2 Deployment steps

1. **Build verification**: `npm run build` (Next.js production build) succeeds; only a benign Turbopack fs-trace note around `semantic/index.ts`'s `readFileSync`.
2. **Vercel CLI linking**: `vercel link --yes --project seerah-qa-bot` (the CLI account owns the production project; a stray `web` project created mid-link was corrected).
3. **Environment**: refreshed production `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (`gemini-3.5-flash-lite`), `LLM_MODEL_FALLBACKS` from the local `.env.local` values. Embeddings reuse the same `LLM_API_KEY` (`EMBEDDINGS_API_KEY || LLM_API_KEY`) with defaults `gemini-embedding-001` + v1beta base.
4. **Deploy**: `vercel --prod --yes` → built in ~14 s, ready in 28 s, **aliased to `https://seerah-qa-bot.vercel.app`**.

### 8.3 Live verification (against production)

| Query | Result |
| ----- | ------ |
| "Aqa Kareem ﷺ pehnawa kaisa tha?" | **answered**, clothing doc `675176a1…`, `rewrittenQuery: "Prophet Muhammad clothing attire and dress"`, lang `roman-ur` |
| "huzoor ne jung mein zirah pehni thi?" | answered, armor doc `6754230f…` |
| "metal gear during war" | answered, armor doc, rewrite shown |
| "what protection did the prophet wear going into battle" | answered, armor doc, rewrite shown |
| "نبی ﷺ کا صبر کیسا تھا؟" | answered, patience doc `672b449a…`, lang `ur` (an earlier "refusal" was a PowerShell UTF-8 body-mangling artifact — correct UTF-8 passes) |
| "Khalid Bin Waleed" | `out_of_corpus` (rewrite tried to invent "military campaigns" but eligibility + coverage gates still reject) |
| "Who won the 2022 football World Cup?" | `out_of_corpus` |

### 8.4 Version control & rollback safety

- Staged the full working tree (semantic layer, `rewrite.ts`, `translit.ts`, tokenize mappings, `embeddings.json`, eval suite, corpus snapshot, guardrails, UI) — **excluding** `.env.local`/`.vercel` (gitignored) and the stray `Agent.md.md`.
- A secret scan over the staged diff found only documentation placeholders (`your_google_ai_api_key`), never real keys.
- **Commit `5fc7aed`** — `feat: hybrid semantic search, LLM query rewrite, and roman-urdu mirroring` — pushed to `origin/main` (`f290176..5fc7aed main -> main`).
- `origin/main` now exactly matches production, so **any future Vercel auto-deploy from git rebuilds the same code** — no accidental rollback.

---

## 9. File Map (current, authoritative)

| Module | Path | Role |
| ------ | ---- | ---- |
| Corpus schema | `web/src/lib/corpus/schema.ts` | Zod schemas + `IndexedDoc` |
| Corpus load | `web/src/lib/corpus/load.ts` | Snapshot parse + live fetch + TTL cache |
| Tokenization | `web/src/lib/search/tokenize.ts` | 76 conflation groups, normalization, stop words, `expandQuestion` |
| BM25 | `web/src/lib/search/bm25.ts` | Weighted per-field BM25 + `docGroupsOf` |
| Search facade | `web/src/lib/search/search.ts` | `search`, `searchSemantic`, engine singletons |
| LLM rewrite | `web/src/lib/search/rewrite.ts` | Query normalization w/ model fallback + retries |
| Embeddings | `web/src/lib/semantic/embed.ts` | Gemini batch embedder w/ backoff + logging |
| Semantic index | `web/src/lib/semantic/index.ts` | Cosine top-K, vector cache, `lastError` |
| Embed text | `web/src/lib/semantic/docText.ts` | Canonical trilingual embed payload |
| Pipeline | `web/src/lib/engine/answer.ts` | Pass 1/2, hybrid scoring, grounding proofs, engine attribution |
| Generation | `web/src/lib/engine/generate.ts` | Deterministic answer builder |
| Language | `web/src/lib/l10n/{detect,translit}.ts` | Mirroring + romanization |
| Guardrails | `web/src/lib/guardrails/blockers.ts` | Fatwa/injection blockers, refusal copy |
| Eval | `web/src/lib/eval/cases.ts` | 69 pinned cases |
| API route | `web/src/app/api/chat/route.ts` | POST /api/chat |
| UI | `web/src/components/chat/chat-client.tsx` | Chat, citations, engine footer |
| Vectors | `web/data/embeddings.json` | 2.5 MB precomputed embeddings |
| Snapshot | `data/corpus.snapshot.json` | Frozen corpus fallback |
| Schema report | `data/SchemaReport.md` | Phase-0 verification artifact |
| Embed precompute | `scripts/embed-corpus.mjs` | Offline vector generation |
| Tests | `web/tests/{eval,bm25,corpus}.test.ts` | Eval gate + unit coverage |

## 10. Known Limitations & Future Work

- **Embedding daily quota**: when the Gemini embeddings quota is exhausted, `semantic.available` reports `false`, `engine` reports `deterministic`, and only BM25+rewrite drive answers (still correct, thanks to the title-anchored lexical pass-2 path). A quota pool / secondary key would restore full hybrid ranking 24/7.
- **Eval flakiness**: the LLM rewrite drifts slightly run-to-run; the hard gate is ≤ 1 failure. The lexical pass-2 path keeps semantic-dependent pins stable even with embeddings down.
- **`Agent.md.md`** remains untracked by design (a stray instruction file, not application code).
- Candidate future work: streaming responses, multi-turn context, per-category grounding tuning, and a secondary embedding provider failover.