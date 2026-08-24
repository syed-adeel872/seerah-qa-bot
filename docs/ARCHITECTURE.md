# ARCHITECTURE.md

## Technical Architecture — Seerah Q&A Bot

A detailed breakdown of the system architecture, from the Next.js frontend through the RAG pipeline to the LLM synthesis engine.

---

## System Overview

The Seerah Q&A Bot is a **full-stack Next.js application** deployed on Vercel. It follows a clean separation of concerns:

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | Chat UI, citation rendering, copy/share, source modal |
| **API Route** | Request validation, orchestration |
| **Guardrails** | Fatwa/injection blocking (pre-retrieval) |
| **Retrieval Engine** | BM25 + semantic hybrid search |
| **LLM Engine** | Query rewriting + answer synthesis |
| **Safety Layer** | Post-LLM refusal detection, citation stripping |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                              │
│                    seerah-qa-bot.vercel.app                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NEXT.JS FRONTEND (React 19)                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │  ChatClient   │ │ CopyButton   │ │ ShareButton  │ │ Disclaimer│  │
│  │  (fragment)   │ │              │ │              │ │ (server)  │  │
│  └──────┬───────┘ └──────────────┘ └──────────────┘ └───────────┘  │
│         │                                                           │
│  ┌──────▼───────┐ ┌──────────────┐ ┌──────────────┐               │
│  │AssistantBubble│ │ SourceChips  │ │ SourceModal  │               │
│  │  (wrapper)   │ │ (clickable)  │ │ (citation)   │               │
│  └──────────────┘ └──────────────┘ └──────────────┘               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ POST /api/chat
                               │ { question: string }
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NEXT.JS API ROUTE (Node.js)                      │
│              web/src/app/api/chat/route.ts                          │
│         Zod validation → answerQuestion() → JSON response           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ANSWER PIPELINE                                   │
│              web/src/lib/engine/answer.ts                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. LANGUAGE DETECTION                                      │   │
│  │     detectQueryLang() → en | ur | roman-ur                  │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │  2. DETERMINISTIC BLOCKERS (Layer 1)                        │   │
│  │     checkBlockers() → 30+ FATWA_PATTERNS + INJECTION        │   │
│  │     → BLOCKED? → return refusalText() + scholar redirect    │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │  3. HYBRID RETRIEVAL                                        │   │
│  │     ┌─────────────┐     ┌─────────────────┐                 │   │
│  │     │ BM25 (lex)  │     │ Semantic (cos)   │                 │   │
│  │     │ 76 groups   │     │ Gemini embed     │                 │   │
│  │     │ per-field   │     │ 3072-dim         │                 │   │
│  │     └──────┬──────┘     └────────┬────────┘                 │   │
│  │            └─────────┬───────────┘                           │   │
│  │                      ▼                                       │   │
│  │            Merged Candidate Pool                             │   │
│  │            hybridScore = bm25 + boost                       │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │  4. GROUNDING GATES                                         │   │
│  │     Coverage ≥ 0.5 + (BM25 ≥ 8 OR semScore ≥ 0.5)         │   │
│  │     → confirmed support set (best doc + runner-ups)         │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │  5. LLM ANSWER GENERATION                                   │   │
│  │     ┌──────────────────────────────────────┐                │   │
│  │     │  llm-generate.ts                     │                │   │
│  │     │  3 language-specific system prompts  │                │   │
│  │     │  buildContext(passages)              │                │   │
│  │     │  → LLM synthesis                    │                │   │
│  │     │  → fallback: deterministic gen       │                │   │
│  │     └──────────────────────────────────────┘                │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │  6. POST-LLM SAFETY (Layer 2)                               │   │
│  │     isLlmRefusal(text) → 15 refusal patterns               │   │
│  │     → REFUSAL? → status="blocked", citations=[]             │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│                    { status, text, citations, engine }              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND RENDERING                                │
│              chat-client.tsx                                        │
│                                                                     │
│  showCitations = status === "answered" && citations.length > 0     │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│  │ SourceChips   │ │ SourceList   │ │ ShareButton  │               │
│  │ (if answered) │ │ (if answered)│ │ (if answered)│               │
│  └──────────────┘ └──────────────┘ └──────────────┘               │
│                                                                     │
│  ┌──────────────┐                                                  │
│  │ SourceModal   │  ← clicking a chip opens this                   │
│  │ Hawala box    │  ← reference text displayed                     │
│  └──────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Component Hierarchy

```
layout.tsx (h-full overflow-hidden)
  └── page.tsx (flex col, radial gradient)
        ├── ChatClient (fragment — no wrapper div)
        │     ├── Header (persistent, fixed)
        │     │     ├── Logo + title
        │     │     ├── Trust Badges (Verified Corpus, Fatwa-Safe)
        │     │     └── Language Indicator (EN · Roman Urdu)
        │     ├── Message Area (overflow-y-auto, scrollable)
        │     │     ├── Welcome Screen (sample questions)
        │     │     ├── User Message Bubbles (right-aligned)
        │     │     ├── AssistantBubble (left-aligned)
        │     │     │     ├── Answer Text
        │     │     │     ├── SourceChips (clickable → modal)
        │     │     │     ├── SourceList (expanded references)
        │     │     │     ├── CopyButton
        │     │     │     ├── ShareButton
        │     │     │     └── SourceModal (citation detail)
        │     │     └── Typing Indicator
        │     └── Composer (sticky bottom)
        │           ├── Input (max-w-4xl)
        │           └── Ask Button
        └── Disclaimer (persistent, below composer)
```

### Key Frontend Files

| File | Role |
|------|------|
| `chat-client.tsx` | Main chat UI — CopyButton, ShareButton, SourceModal, SourceChips, SourceList, AssistantBubble |
| `disclaimer.tsx` | Async server component — persistent footer |
| `samples.ts` | Sample question data |
| `globals.css` | CSS variables, gradients, `.glow-card`, `.input-glow` |
| `page.tsx` | Landing page — flex column layout with radial gradient |
| `layout.tsx` | Root layout — `h-full overflow-hidden` |

---

## Backend Architecture

### API Route

**`web/src/lib/app/api/chat/route.ts`**

```typescript
export async function POST(req: NextRequest) {
  const parsed = RequestSchema.safeParse(body);  // Zod: question 1-1000 chars
  const answer = await answerQuestion(parsed.data.question);
  return NextResponse.json(answer);
}
```

- Runtime: Node.js
- Dynamic: force-dynamic (no caching)
- Validation: Zod schema

### Pipeline Orchestration

**`web/src/lib/engine/answer.ts`** — the core orchestrator:

```
answerQuestion(rawQuestion)
  → ensureLiveCorpus()           // warm live API, snapshot fallback
  → normalizeQuestion()          // whitespace cleanup
  → detectQueryLang()            // en | ur | roman-ur
  → checkBlockers()              // fatwa/injection (fail closed)
  → answerFromQuery(original)    // Pass 1: BM25 + semantic
  → rewriteSearchQuery()         // LLM normalization (optional)
  → answerFromQuery(rewritten)   // Pass 2: re-retrieval
  → return best answer
```

---

## Retrieval Architecture

### BM25 Engine (`bm25.ts`)

| Parameter | Value |
|-----------|-------|
| k1 | 1.5 |
| b | 0.75 |
| Title weight | 4x |
| Keywords weight | 3x |
| Body weight | 2x |
| Slug weight | 1x |

### Semantic Engine (`semantic/`)

| Parameter | Value |
|-----------|-------|
| Model | gemini-embedding-001 |
| Dimensions | 3072 |
| Batch size | 32 |
| LRU cache | 256 entries |
| Cosine threshold | 0.45 (boost), 0.62 (titleless anchor) |

### Hybrid Scoring

```
hybridScore = bm25Score + (semScore − 0.45) × 120
```

Ranking: `hybridScore desc → coverage desc → titleOverlap desc`

---

## Safety Architecture

### Three-Layer Defense

| Layer | Location | Timing | What It Does |
|-------|----------|--------|--------------|
| **Layer 1** | `blockers.ts` | Pre-retrieval | 30+ regex patterns block fatwa/injection queries |
| **Layer 2** | `answer.ts` | Post-LLM | 15 refusal patterns detect LLM-generated refusals, strip citations |
| **Layer 3** | `chat-client.tsx` | Rendering | `showCitations` gate hides UI for non-"answered" responses |

### Data Flow Safety

```
User Query
  │
  ├─ Layer 1: checkBlockers() → BLOCKED? → refusalText() [no retrieval, no generation]
  │
  ├─ Retrieval + LLM Generation
  │
  ├─ Layer 2: isLlmRefusal(text) → REFUSAL? → citations=[], status="blocked"
  │
  └─ Layer 3: showCitations → HIDE UI if status ≠ "answered"
```

---

## Deployment Architecture

```
Git Push (main)
  │
  ▼
Vercel Auto-Deploy
  │
  ├─ Build: next build (Turbopack)
  ├─ Runtime: Node.js (serverless functions)
  ├─ Edge: Static assets (CDN)
  │
  ▼
Production: seerah-qa-bot.vercel.app
```

---

**End of Document**
