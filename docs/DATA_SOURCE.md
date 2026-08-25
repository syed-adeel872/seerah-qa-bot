# DATA_SOURCE.md

## Corpus Grounding & Hallucination Prevention

This document explains how the Seerah Q&A Bot maintains strict grounding in verified Islamic source material and manages out-of-corpus queries.

---

## The Corpus

### Source

The bot answers **exclusively** from the Seerah & Shamail corpus hosted at:

```
https://api.islamicdesk.com/api/seerathon/corpus
```

### Corpus Composition

| Source | Entries | Content |
|--------|---------|---------|
| **Shamail** | 120 | Character traits, physical appearance, habits, daily routines, clothing, food, manners |
| **Seerah Timeline** | 34 | Key life events — birth, migrations, battles, treaties, milestones |
| **Courses** | 20 | Structured educational content about the Prophet ﷺ |
| **Total** | **174** | Verified, citeable entries |

### Snapshot & Fallback

- **Frozen snapshot:** `data/corpus.snapshot.json` (1,162 KB)
- **Live API:** Fetched at runtime with 15-minute TTL cache
- **Fail-safe:** If the live API is unreachable, the bot falls back to the frozen snapshot — it never depends on external availability
- **Rate limiting:** 60 requests/min/IP respected via `ensureLiveCorpus()`

### Entry Structure

Each Shamail entry contains:
```json
{
  "id": "675176a1d2c9eb00202fca07",
  "category": { "id": "1", "name": { "en": "Clothing", "ur": "لباس" } },
  "slug": { "en": "clothing", "romanUrdu": "libas" },
  "keywords": ["clothing", "dress", "attire", "لباس", "کپڑا"],
  "en": {
    "title": "The Prophet's Clothing",
    "hadeesTarjama": "Narrated Aisha...",
    "hadeesHawala": "Shamail al-Tirmidhi, Hadith No. 123",
    "hikayat": ["..."],
    "type": "shamail",
    "points": ["He wore simple garments", "He preferred white clothing"]
  },
  "ur": { "title": "...', "hadeesTarjama": "...", ... }
}
```

---

## How Grounding Works

### The Zero-Hallucination Contract

Every answer the bot produces must satisfy three constraints:

1. **Source citation:** Every statement traces back to a specific corpus entry
2. **No fabrication:** The bot never adds external knowledge or "filler" content
3. **No rulings:** Religious rulings (fatwa) are refused and redirected to scholars

### Retrieval Grounding

The hybrid retrieval system (BM25 + semantic) returns a ranked list of candidate documents. Before generation, the bot applies **grounding gates**:

| Gate | Condition | Purpose |
|------|-----------|---------|
| **Coverage** | ≥ 50% of content query tokens matched | Ensures the query is actually addressed |
| **BM25 score** | ≥ 8 (title-anchored) or ≥ 16 (titleless) | Proves lexical relevance |
| **Semantic score** | ≥ 0.62 with topical group anchor | Proves thematic relevance |

If no candidate passes these gates, the query is classified as `out_of_corpus` and the bot responds:

> "I can only answer from the fixed Seerah & Shamail corpus, and your question doesn't match it."

### Generation Grounding

When the LLM generates an answer, it receives:
- The user's question
- The retrieved corpus passages (up to 3 entries, 800 chars each)
- A system prompt instructing it to use **ONLY** the provided passages

The system prompt explicitly forbids:
- Adding external knowledge
- Making up facts
- Answering questions not covered by the passages
- Generating religious rulings

---

## Out-of-Corpus Handling

### What Triggers Out-of-Corpus

| Query Type | Example | Response |
|------------|---------|----------|
| **Other companions** | "Tell me about Abu Bakr's life in detail" | Out of corpus |
| **Modern topics** | "What is the ruling on cryptocurrency?" | Blocked (fatwa) |
| **Other religions** | "How does Christianity view..." | Out of corpus |
| **Non-Seerah history** | "Who won the 2022 World Cup?" | Out of corpus |
| **Name-only queries** | "Khalid Bin Waleed" | Out of corpus (no topic anchor) |

### The Out-of-Corpus Response

The bot provides a polite, helpful refusal in the user's language:

**English:**
> "I can only answer from the fixed Seerah & Shamail corpus, and your question doesn't match it. Please ask about the life, character, or habits of the Prophet ﷺ from this corpus."

**Roman Urdu:**
> "Main sirf Seerah aur Shamail corpus se jawab deta hoon. Aap ka sawal us mein nahi hai. Barah-e-meharbani Nabi ﷺ ki zindagi, ikhlaq ya aadaab se poochiye."

**Urdu:**
> "میں صرف اسی سیرت و شمائل کے ذخیرے سے جواب دیتا ہوں، اور آپ کا سوال اس ذخیرے میں ہے نہیں۔ براہِ کرم نبی ﷺ کی زندگی، اوصاف، یا عادات سے متعلق کوئی سوال پوچھیں۔"

### No Citations on Out-of-Corpus

When the bot refuses, **no citation source cards, source chips, or Hawala blocks are displayed**. The `showCitations` gate in the frontend ensures:

```typescript
const showCitations = answer.status === "answered" && answer.citations.length > 0;
```

Only genuine, grounded answers show citations.

---

## Fatwa & Ruling Prevention

### Three-Layer Safety System

The bot has a **three-layer defense** against generating religious rulings:

#### Layer 1: Deterministic Blockers (Pre-Retrieval)

**File:** `web/src/lib/guardrails/blockers.ts`

30+ regex patterns evaluated **before any retrieval or generation**:

| Category | Patterns |
|----------|----------|
| **English fiqh** | `fatwa`, `halal`, `haram`, `makruh`, `qaza`, `qada`, `namaz timing`, `roza`, `zakat`, `nikah`, `talaq`, `wudu`, `ghusl`, `jummah` |
| **Urdu script** | `فتوی`, `جائز`, `حلال`, `حرام`, `مکروہ`, `قضا`, `نماز کا وقت`, `روزہ`, `زکوٰة`, `نکاح`, `طلاق`, `وضو`, `غسل` |
| **Roman Urdu** | `riwa`, `sud`, `jaiz`, `qaza`, `qada`, `namaz`, `roza`, `zakat`, `nikah`, `talaq`, `wuzu`, `ghusl`, `jumma` |
| **Injection** | `ignore previous instructions`, `you are now`, `reveal system prompt`, `jailbreak` |

When a match is found, the bot immediately returns a refusal with scholar redirect — no retrieval, no generation.

#### Layer 2: Post-LLM Refusal Inspection (Post-Generation)

**File:** `web/src/lib/engine/answer.ts`

26 regex patterns that detect when the LLM generated a refusal instead of a genuine answer:

```typescript
const LLM_REFUSAL_PATTERNS: RegExp[] = [
  /shari['']?\s?i\s?masla/i,
  /religious ruling/i,
  /consult\s+a\s+qualified\s+(scholar|aalim|mufti)/i,
  /can\s+only\s+answer\s+(from|questions\s+from)\s+(the\s+)?(seerah|shamail)/i,
  /daaira[-\s]?e[-\s]?kaam\s+mein\s+nahi/i,
  // ... 26 patterns total
];
```

When detected:
- `status` overridden from `"answered"` → `"blocked"`
- `citations` forced to `[]` (empty)
- `kind` set to `"fatwa"`

#### Layer 3: Frontend Citation Gating

**File:** `web/src/components/chat/chat-client.tsx`

```typescript
const showCitations = answer.status === "answered" && answer.citations.length > 0;
```

Hides `SourceChips` and `ShareButton` for all non-"answered" responses.

### The Fatwa Redirect

For blocked fatwa queries, the bot shows:

**Refusal text:**
> "This is a matter of Islamic shari'ah ruling (fatwa), which is outside what I can answer. I cannot issue a religious ruling. Please consult a qualified scholar (Aalim / Mufti) for a definitive answer."

**Scholar redirect button:**
> "Consult a qualified Islamic scholar (Aalim/Mufti)" / "کسی مستند عالمِ دین / مفتی صاحب سے رجوع کریں"

---

## Anti-Hallucination Guarantees

### What the Bot Will NOT Do

1. **Never fabricate facts** — every statement comes from a corpus entry
2. **Never answer fiqh questions** — fatwa/ruling queries are refused
3. **Never add external knowledge** — system prompt forbids it
4. **Never show citations for refusals** — source cards hidden on blocked responses
5. **Never invent sources** — citations are verbatim from the corpus

### What the Bot WILL Do

1. **Answer from verified corpus only** — 174 entries across 3 sources
2. **Cite every statement** — source chips + Hawala references shown
3. **Mirror user language** — English, Urdu, or Roman Urdu
4. **Redirect to scholars** — for any ruling-type query
5. **Gracefully degrade** — if LLM unavailable, deterministic generation still works

---

## Corpus Statistics

| Metric | Value |
|--------|-------|
| Total entries | 174 |
| Shamail entries | 120 |
| Timeline entries | 34 |
| Course entries | 20 |
| Languages | English, Urdu, Roman Urdu |
| Conflation groups | 76 |
| Eval cases | 69 |
| Snapshot size | 1,162 KB |
| Embeddings size | 2.5 MB |
| Vector dimensions | 3072 (Gemini) |
| Corpus version | 1.0.0 |

---

**End of Document**
