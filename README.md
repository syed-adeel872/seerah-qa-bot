# Seerah Q&A Bot

> A conversational assistant grounded in the verified Seerah & Shamail corpus — answering questions about the Prophet Muhammad ﷺ's life, character, and habits.

**Live:** [seerah-qa-bot.vercel.app](https://seerah-qa-bot.vercel.app)

---

## Overview

Seerah Q&A Bot is a production-grade AI assistant that answers questions **only** from a fixed Islamic corpus of 174 verified entries (120 Shamail + 34 Seerah Timeline + 20 Courses). It combines hybrid BM25+semantic retrieval, LLM-powered synthesis, and a multi-layered safety engine to deliver accurate, grounded answers in English, Urdu, and Roman Urdu.

The bot is designed for hackathon judges and end users who need reliable, citation-backed information about the Prophet ﷺ — with zero tolerance for fabrication or religious ruling generation.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Grounded Q&A** | Every answer cites verified corpus entries; generation is gated by dual retrieval thresholds |
| **Hybrid BM25 + Semantic Search** | 76 trilingual conflation groups + Gemini embeddings for cross-language retrieval |
| **LLM-Powered Synthesis** | 3 language-specific system prompts (EN/Roman Urdu/Urdu) with anti-refusal rules |
| **Trilingual Support** | English, Urdu script, and Roman Urdu — with automatic language mirroring |
| **Fatwa-Safe Guardrails** | 34+ deterministic regex blockers + 26 post-LLM refusal patterns |
| **Premium Chat UI** | Dark theme, trust badges, source chips, citation modal, copy/share buttons |
| **Advanced Source Modal** | Clickable citation chips open a modal with Hawala reference, English translation text, and Urdu text — both in scrollable containers |
| **Persistent Disclaimer** | Every response includes the required corpus disclaimer below the chat input |

### UI Status Badges (rendered in header)

- **Verified Corpus** — confirms data provenance
- **Fatwa-Safe** — confirms safety guardrails active
- **EN · UR · Roman** — confirms trilingual support

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
│    (34+ FATWA patterns)  │  Across English, Urdu script, and Roman Urdu
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

## Documentation

| Document | Description |
|----------|-------------|
| [Project Journey](docs/PROJECT_JOURNEY.md) | Complete engineering history — 6 phases, 40+ commits |
| [Architecture](docs/ARCHITECTURE.md) | Technical architecture with ASCII diagrams |
| [Features](docs/FEATURES.md) | Core feature documentation |
| [Data Source](docs/DATA_SOURCE.md) | Corpus grounding and hallucination prevention |
| [Testing](docs/TESTING.md) | Testing methodology and manual audit results |

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

All variables are **optional** — the bot works in fully-deterministic mode without any API keys. When LLM keys are provided, responses are synthesized via the LLM instead of template-based generation.

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

1. **Deterministic Blockers** (`blockers.ts`) — 34+ fatwa patterns + 19 injection patterns evaluated BEFORE any retrieval or generation
2. **Post-LLM Refusal Inspection** (`answer.ts`) — 26 regex patterns detect LLM-generated refusals, lazy fallbacks, and system prompt leakage
3. **Frontend Citation Gating** (`chat-client.tsx`) — `showCitations` gate hides source chips and share button for non-"answered" responses

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

## Known Limitations

- Semantic search depends on Gemini API availability — degrades gracefully to BM25-only when unavailable
- LLM synthesis requires a valid API key — without it, template-based answers are used
- Roman Urdu detection uses a marker dictionary — English text with Islamic loanwords may occasionally be misclassified
- No rate limiting on the API endpoint (would require external service)
- No ErrorBoundary wrapping chat components (React 19 handles most failures gracefully)

---

## License

This project is built for educational and hackathon purposes. The Seerah & Shamail corpus is sourced from Seerat Ki Dunya.
