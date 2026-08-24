# Seerah Q&A Bot

> A zero-hallucination conversational agent grounded exclusively in the verified Seerah & Shamail corpus — answering questions about the Prophet Muhammad ﷺ's life, character, and habits.

**Live:** [seerah-qa-bot.vercel.app](https://seerah-qa-bot.vercel.app)

---

## Overview

Seerah Q&A Bot is a production-grade, trust-first AI assistant that answers questions **only** from a fixed Islamic corpus of 174 verified entries (120 Shamail + 34 Seerah Timeline + 20 Courses). It combines hybrid BM25+semantic retrieval, LLM-powered synthesis, and a multi-layered safety engine to deliver accurate, grounded answers in English, Urdu, and Roman Urdu.

The bot is designed for hackathon judges and end users who need reliable, citation-backed information about the Prophet ﷺ — with zero tolerance for fabrication or religious ruling generation.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Zero-Hallucination Architecture** | Every answer cites verified corpus entries; generation is grounded by dual retrieval gates |
| **Hybrid BM25 + Semantic Search** | 76 trilingual conflation groups + Gemini embeddings for cross-language retrieval |
| **LLM-Powered Synthesis** | 3 language-specific system prompts (EN/Roman Urdu/Urdu) with strict anti-refusal rules |
| **Trilingual Support** | English, Urdu script, and Roman Urdu — with automatic language mirroring |
| **Fatwa-Safe Guardrails** | Two-layer safety: deterministic blockers + post-LLM refusal inspection |
| **Premium Chat UI** | Dark theme, trust badges, source chips, citation modal, copy/share buttons |
| **Persistent Disclaimer** | Every response includes the required corpus disclaimer |
| **WhatsApp Share** | One-tap share formatted for WhatsApp knowledge cards |

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
│    (FATWA_PATTERNS)      │  50+ regex patterns across 3 languages
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
│    (Anti-Hallucination)  │  → confirmed support set
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 5. LLM Answer Generation │  Language-specific system prompts
│    + Post-LLM Refusal    │  → isLlmRefusal() strips citations if refused
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 6. Response              │  Grounded answer + citations + disclaimer
│    (Source Chips + Cards)│  Source chips, Hawala references, copy/share
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
| [Project Journey](docs/PROJECT_JOURNEY.md) | Complete engineering history from Day 1 to production — 60+ commits, 6 phases |
| [Data Source](docs/DATA_SOURCE.md) | Corpus grounding, out-of-corpus handling, and hallucination prevention |

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

```env
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_API_KEY=your-gemini-api-key
LLM_MODEL=gemini-3.5-flash-lite
EMBEDDINGS_API_KEY=your-gemini-api-key
```

---

## Corpus

- **120 Shamail entries** — character, habits, physical traits
- **34 Seerah Timeline entries** — key life events
- **20 Course entries** — structured knowledge
- **Source:** [api.islamicdesk.com/api/seerathon/corpus](https://api.islamicdesk.com/api/seerathon/corpus)
- **Snapshot:** `data/corpus.snapshot.json` (frozen fallback)

---

## License

This project is built for educational and hackathon purposes. The Seerah & Shamail corpus is sourced from Seerat Ki Dunya.
