/**
 * Precompute the semantic embedding cache for the corpus snapshot.
 *
 * Builds one vector per corpus entry (English + Urdu text + keywords + slug
 * packed into a single embedding), then writes web/data/embeddings.json as
 * base64-encoded Float32 vectors keyed by doc id.
 *
 * Usage:  node scripts/embed-corpus.mjs
 *         LLM_API_KEY=... node scripts/embed-corpus.mjs   (unless key exported)
 * Env:    EMBEDDINGS_MODEL (default gemini-embedding-001),
 *         EMBEDDINGS_BASE_URL (default Google v1beta endpoint).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SNAPSHOT_CANDIDATES = [
  path.join(ROOT, "data", "corpus.snapshot.json"),
  path.join(ROOT, "web", "data", "corpus.snapshot.json"),
];
const SNAPSHOT = SNAPSHOT_CANDIDATES.find((p) => existsSync(p));
if (!SNAPSHOT) {
  console.error("corpus.snapshot.json not found; run the corpus export first.");
  process.exit(1);
}

const OUT = path.join(ROOT, "web", "data", "embeddings.json");
const MODEL = process.env.EMBEDDINGS_MODEL || "gemini-embedding-001";
const BASE_URL =
  process.env.EMBEDDINGS_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const API_KEY = process.env.EMBEDDINGS_API_KEY || process.env.LLM_API_KEY || "";

if (!API_KEY) {
  console.error("LLM_API_KEY / EMBEDDINGS_API_KEY not set — cannot embed.");
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));

/**
 * Build the canonical embed text — MUST mirror web/src/lib/semantic/docText.ts
 * operating on the runtime-normalized IndexedDoc (see web/src/lib/corpus/load.ts).
 */
function docEmbedText(doc) {
  const textEn =
    doc.source === "timeline"
      ? [doc.en?.title, doc.en?.description, ...(doc.en?.content || []).map((b) => b.content_text)]
          .filter(Boolean)
          .join("\n\n")
      : [doc.en?.title, doc.en?.hadeesTarjama, doc.en?.hadeesHawala, ...(doc.en?.points || []), doc.en?.hikayat]
          .filter(Boolean)
          .join("\n\n");
  const textUr =
    doc.source === "timeline"
      ? [doc.ur?.title, doc.ur?.description, ...(doc.ur?.content || []).map((b) => b.content_text)]
          .filter(Boolean)
          .join("\n\n")
      : [doc.ur?.title, doc.ur?.hadeesTarjama, doc.ur?.hadeesHawala, ...(doc.ur?.points || []), doc.ur?.hikayat]
          .filter(Boolean)
          .join("\n\n");
  const title = `${doc.en?.title || ""} | ${doc.ur?.title || ""}`;
  const keywords = (doc.keywords || []).join(" ");
  const bodyEn = textEn.slice(0, 700);
  const bodyUr = textUr.slice(0, 700);
  const slug = doc.slug ? `${doc.slug.en || ""} ${doc.slug.romanUrdu || ""}` : "";
  return [title, keywords, bodyEn, bodyUr, slug].filter(Boolean).join("\n");
}

function encodeVector(vec) {
  return Buffer.from(new Float32Array(vec).buffer).toString("base64");
}

async function embedBatch(texts) {
  const requests = texts.map((text) => ({
    model: `models/${MODEL}`,
    content: { parts: [{ text }] },
  }));
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/models/${MODEL}:batchEmbedContents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
        body: JSON.stringify({ model: `models/${MODEL}`, requests }),
      });
      if (res.status === 429 || res.status === 500 || res.status === 503) {
        const delay = (attempt + 1) * 30000;
        console.log(`    rate-limited (HTTP ${res.status}); waiting ${delay / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(`embed HTTP ${res.status}: ${detail?.error?.message || res.statusText}`);
      }
      const json = await res.json();
      return (json.embeddings || []).map((e) => e.values || []);
    } catch (err) {
      lastErr = err;
      if (attempt === 4) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const docs = [...(snapshot.shamail || []), ...(snapshot.timeline || [])];
console.log(`Embedding ${docs.length} docs with ${MODEL}...`);

const vectors = {};
const BATCH = 16;
for (let i = 0; i < docs.length; i += BATCH) {
  const chunk = docs.slice(i, i + BATCH);
  const vecs = await embedBatch(chunk.map(docEmbedText));
  if (vecs.length !== chunk.length) throw new Error("embed count mismatch");
  chunk.forEach((d, j) => {
    vectors[d.id] = encodeVector(vecs[j]);
  });
  console.log(`  ${Math.min(i + BATCH, docs.length)}/${docs.length} done`);
  if (i + BATCH < docs.length) await new Promise((r) => setTimeout(r, 1500));
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({
    model: MODEL,
    dim: 3072,
    count: docs.length,
    generatedAt: new Date().toISOString(),
    docs: vectors,
  }),
);
console.log(`Wrote ${OUT} (${docs.length} vectors, ${MODEL}, dim 3072).`);