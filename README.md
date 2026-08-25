# Seerah Q&A Bot

> **Code-enforced citation validation. Pre-retrieval fatwa safety. Baked corpus fallback. 4/4 rubric compliance.**

A conversational assistant grounded in the verified Seerah & Shamail corpus — answering questions about the Prophet Muhammad ﷺ's life, character, and habits. Every answer cites verified corpus entries. Every fatwa question is refused by construction, not by prompt. Every response includes a persistent disclaimer.

**Live:** [seerah-qa-bot.vercel.app](https://seerah-qa-bot.vercel.app)

<!-- DEMO: Replace this line with an animated GIF or screen recording showing the bot in action.
     Record: (1) a valid Seerah question → answer with citations, (2) a fatwa question → refusal + redirect,
     (3) an out-of-corpus question → fallback message, (4) the persistent disclaimer below the input.
     Upload the GIF to the repo and update the path: ![Demo](./demo.gif) -->

---

## Rubric Deliverables — 4/4 Verified

| Deliverable | Status | How it works |
|-------------|--------|--------------|
| **In-corpus answer + citation** | **Implemented** | Three-check validation: entry must exist in corpus, have body text, and match the answer's language. Up to 6 citations per response. Source chips are clickable → modal with Hawala reference + full EN/UR text. |
| **Out-of-corpus fallback** | **Implemented** | Classified before answering. Fail-closed: if no corpus entry matches, the bot says so honestly. Never fabricates. |
| **Fatwa/ruling refused + redirected** | **Implemented** | 34+ deterministic regex patterns run BEFORE any retrieval or generation. Fatwa questions are blocked by code, not by LLM instruction. Response redirects to a qualified scholar. |
| **Persistent disclaimer** | **Implemented** | Non-dismissible footer below the chat input. Always visible. Localized in English and Urdu. Corpus version and entry counts displayed. |

---

## Architectural Moats

### 1. Citation Validation is Code-Enforced, Not Prompt-Requested

Most citation bots ask the LLM to cite sources. We **enforce** it:

```
answer.ts — Three-Check Validation:
  ✓ Entry must exist in corpus (not hallucinated)
  ✓ Entry must have body text (not empty)
  ✓ Entry must be in the answer's language
  ✓ Grounding gate: coverage ≥ 0.5, BM25 ≥ 8, semScore ≥ 0.62
  ✓ Up to 6 citations, filtered by hybrid score threshold
```

If the LLM cannot ground its answer in retrieved corpus entries, the answer is rejected. Citations are never taken from model output — they come from the retrieval engine.

### 2. Fatwa Safety is Pre-Retrieval, Not Post-Hoc

Fatwa questions are blocked **before** any search or LLM call happens:

```
blockers.ts — Pre-Retrieval Blockers:
  ✓ 34+ fatwa patterns across English, Urdu script, and Roman Urdu
  ✓ 19 injection patterns (prompt injection, jailbreak, override attempts)
  ✓ Covers: halal, haram, mahr, iddat, sawm, salat, zabihah, shirk, bid'ah, qasam, ...
  ✓ If matched → immediate refusal + scholar redirect. No retrieval. No generation.
```

The LLM never sees a fatwa question. This is not a prompt instruction — it's deterministic code.

### 3. Baked Corpus Snapshot — Works If the API Dies

```
data/corpus.snapshot.json (1162KB)
  ✓ 120 Shamail + 34 Timeline + 20 Courses = 174 entries
  ✓ Frozen fallback when live API (api.islamicdesk.com) is unavailable
  ✓ Precomputed embeddings in web/data/embeddings.json
  ✓ Zero external dependencies for core functionality
```

### 4. Post-LLM Refusal Inspection — Defense in Depth

Even if the LLM disobeys system prompts, a second safety net catches it:

```
answer.ts — Post-LLM Refusal Patterns:
  ✓ 26 regex patterns detect LLM-generated refusals
  ✓ English: "shari'i masla", "religious ruling", "I don't have details"
  ✓ Roman Urdu: "daaira-e-kaam mein nahi", "tafseel nahi"
  ✓ Urdu script: lazy fallbacks, scope hedging
  ✓ System prompt leakage: "system prompt", "my rules are", "i am told to"
  ✓ When detected → status becomes "blocked", citations stripped
```

### 5. Frontend Citation Gating — Visual Enforcement

```typescript
// chat-client.tsx — Source chips and share button are hidden for non-"answered" responses
const showCitations = answer.status === "answered" && answer.citations.length > 0;
```

---

## How It Works

```
User Question
     │
     ▼
┌─────────────────────────┐
│ 1. Language Detection    │  detectQueryLang() → en | ur | roman-ur
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 2. Deterministic Blockers│  checkBlockers() → fatwa/injection/empty → REFUSE
│    (34+ FATWA patterns)  │  Runs BEFORE retrieval — LLM never sees fatwa Qs
│    (19 INJECTION patterns)│  Prompt-injection detection
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 3. Hybrid Retrieval      │  BM25 (per-field weighted) + Semantic (cosine)
│    Pass 1: Original Q    │  → merged candidate pool
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 4. Grounding Gates       │  Coverage ≥ 0.5, BM25 ≥ 8, semScore ≥ 0.62
│    (Anti-Hallucination)  │  → confirmed support set (up to 6 citations)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 5. LLM Answer Generation │  Language-specific system prompts
│    + Post-LLM Refusal    │  → isLlmRefusal() strips citations if refused
│    (26 refusal patterns) │  Detects lazy fallbacks & prompt leakage
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 6. Response              │  Grounded answer + up to 6 citations + disclaimer
│    (Source Chips + Modal)│  Clickable chips → modal with Hawala + full EN/UR text
└─────────────────────────┘
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Code-Enforced Citations** | Every answer cites verified corpus entries; generation is gated by dual retrieval thresholds |
| **Hybrid BM25 + Semantic Search** | 76 trilingual conflation groups + Gemini embeddings for cross-language retrieval |
| **LLM-Powered Synthesis** | 3 language-specific system prompts (EN/Roman Urdu/Urdu) with anti-refusal rules |
| **Trilingual Support** | English, Urdu script, and Roman Urdu — with automatic language mirroring |
| **Pre-Retrieval Fatwa Safety** | 34+ deterministic regex blockers run before any retrieval or generation |
| **Post-LLM Refusal Inspection** | 26 regex patterns catch LLM disobedience, lazy fallbacks, and prompt leakage |
| **Premium Chat UI** | Dark theme, trust badges (Verified Corpus · Fatwa-Safe · EN·UR·Roman), source chips, citation modal |
| **Advanced Source Modal** | Clickable citation chips → modal with Hawala reference, English text, Urdu text — scrollable containers |
| **Persistent Disclaimer** | Non-dismissible footer below chat input, localized in English and Urdu |
| **Baked Corpus Snapshot** | 174 entries frozen in JSON — works if live API dies |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.3.0 (App Router) |
| UI | React 19.2.8, Tailwind CSS 4 |
| Language | TypeScript 5 |
| Validation | Zod 4.4.3 |
| Search | Custom BM25 (hand-rolled, zero ML deps) |
| Embeddings | Gemini `gemini-embedding-001` (3072-dim) |
| LLM | OpenAI-compatible endpoint (`gemini-3.5-flash-lite`) |
| Testing | Vitest 4.1.10 |
| Deployment | Vercel (auto-deploy from `main`) |

---

## Quick Start

```bash
# Install dependencies
cd web && npm install

# Run development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

---

## Environment Variables

All variables are **optional** — the bot works in fully-deterministic mode without any API keys.

```env
# LLM synthesis (optional — enables LLM-powered answers)
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_API_KEY=your-gemini-api-key
LLM_MODEL=gemini-3.5-flash-lite
LLM_MODEL_FALLBACKS=gemini-2.5-flash-lite,gemini-3.5-flash-lite

# Semantic search (optional — enables embedding-based retrieval)
EMBEDDINGS_API_KEY=your-gemini-api-key
EMBEDDINGS_MODEL=gemini-embedding-001
EMBEDDINGS_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

See `web/.env.example` for the full template.

---

## Corpus

- **120 Shamail entries** — character, habits, physical traits
- **34 Seerah Timeline entries** — key life events
- **20 Course entries** — structured knowledge
- **Source:** [api.islamicdesk.com/api/seerathon/corpus](https://api.islamicdesk.com/api/seerathon/corpus)
- **Snapshot:** `data/corpus.snapshot.json` (frozen fallback)
- **Embeddings:** `web/data/embeddings.json` (precomputed vectors)

---

## Safety Architecture

Three layers of protection:

1. **Pre-Retrieval Deterministic Blockers** (`blockers.ts`) — 34+ fatwa patterns + 19 injection patterns evaluated BEFORE any retrieval or generation. Fatwa questions never reach the LLM.
2. **Post-LLM Refusal Inspection** (`answer.ts`) — 26 regex patterns detect LLM-generated refusals, lazy fallbacks, and system prompt leakage. Citations stripped when detected.
3. **Frontend Citation Gating** (`chat-client.tsx`) — `showCitations` gate hides source chips and share button for non-"answered" responses.

---

## Security

- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection`
- API keys are server-side only — never exposed to the client
- `.env.local` is gitignored and never committed
- Input validation via Zod (1–1000 characters)
- Race condition protection via `AbortController` on fetch requests

---

## Testing

```bash
# Unit tests (corpus loader, BM25, tokenizer)
npm run test

# Full eval suite (69 test cases — requires LLM API key)
npx vitest run tests/eval.test.ts
```

16 unit tests covering corpus loading, BM25 retrieval, and trilingual tokenization.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Project Journey](docs/PROJECT_JOURNEY.md) | Complete engineering history — 6 phases, 40+ commits |
| [Architecture](docs/ARCHITECTURE.md) | Technical architecture with ASCII diagrams |
| [Features](docs/FEATURES.md) | Core feature documentation |
| [Data Source](docs/DATA_SOURCE.md) | Corpus grounding and hallucination prevention |
| [Testing](docs/TESTING.md) | Testing methodology and manual audit results |

---

## Known Limitations

- Semantic search depends on Gemini API availability — degrades gracefully to BM25-only when unavailable
- LLM synthesis requires a valid API key — without it, template-based answers are used
- Roman Urdu detection uses a marker dictionary — English text with Islamic loanwords may occasionally be misclassified
- No rate limiting on the API endpoint (would require external service)
- No ErrorBoundary wrapping chat components (React 19 handles most failures gracefully)

---

## License

This project is built for educational and hackathon purposes. The Seerah & Shamail corpus is sourced from Seerat Ki Dunya.
