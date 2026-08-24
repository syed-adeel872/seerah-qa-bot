import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CorpusSnapshotSchema,
  type CorpusSnapshot,
  type IndexedDoc,
  type ShamailEntry,
  type TimelineEntry,
  type Citation,
} from "./schema";

/** Base URL of the spec-mandated corpus API (see "Developers, AI Engineer Brief.pdf"). */
export const CORPUS_API_BASE = "https://api.islamicdesk.com/api/seerathon/corpus";

export interface Corpus {
  meta: CorpusSnapshot["meta"];
  docs: IndexedDoc[];
  /** All 120 shamail + 34 timeline entries in normalized form. */
  entries: IndexedDoc[];
  byId: Map<string, IndexedDoc>;
  categories: Map<string, { id: string; en: string; ur: string }>;
  timelineSections: Map<string, string>;
  counts: { shamail: number; timeline: number; courses: number };
  sha256?: string;
  generatedAt: string;
  corpusVersion: string;
}

/**
 * Resolve the frozen corpus snapshot file. Works under `next dev`/`next start`
 * (cwd = web/) and under vitest (cwd = web/). Uses plain fs + cwd instead of a
 * `new URL(..., import.meta.url)` so Turbopack does not try to statically
 * resolve the JSON as a module asset at build time.
 */
const SNAPSHOT_CANDIDATES = [
  path.resolve(process.cwd(), "data", "corpus.snapshot.json"),
  path.resolve(process.cwd(), "..", "data", "corpus.snapshot.json"),
  path.resolve(process.cwd(), "web", "data", "corpus.snapshot.json"),
];

function findSnapshotPath(): string {
  const found = SNAPSHOT_CANDIDATES.find((p) => existsSync(p));
  if (found) return found;
  return SNAPSHOT_CANDIDATES[0];
}

const DEFAULT_SNAPSHOT_PATH = findSnapshotPath();

function shamailCitation(e: ShamailEntry): Citation {
  return {
    id: e.id,
    source: "shamail",
    title: { en: e.en.title, ur: e.ur.title },
    hawala: { en: e.en.hadeesHawala, ur: e.ur.hadeesHawala },
    category: { id: e.category.id, name: { en: e.category.name.en, ur: e.category.name.ur } },
    slug: e.slug,
    textEn: [e.en.title, e.en.hadeesTarjama, e.en.hadeesHawala, ...e.en.points, e.en.hikayat]
      .filter(Boolean)
      .join("\n\n"),
    textUr: [e.ur.title, e.ur.hadeesTarjama, e.ur.hadeesHawala, ...e.ur.points, e.ur.hikayat]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function timelineCitation(e: TimelineEntry): Citation {
  return {
    id: e.id,
    source: "timeline",
    title: { en: e.en.title, ur: e.ur.title || e.en.title },
    section: e.en.section || undefined,
    slug: e.slug,
    textEn: [e.en.title, e.en.description, ...e.en.content.map((b) => b.content_text)]
      .filter(Boolean)
      .join("\n\n"),
    textUr: [e.ur.title, e.ur.description, ...(e.ur.content ?? []).map((b) => b.content_text)]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function normalizeShamail(e: ShamailEntry): IndexedDoc {
  const points = [...e.en.points, ...e.ur.points].filter(Boolean).join(" ");
  const hikayat = [e.en.hikayat, e.ur.hikayat].filter(Boolean).join(" ");
  const keywords = (e.keywords ?? []).join(" ");
  return {
    id: e.id,
    source: "shamail",
    titleEn: e.en.title,
    titleUr: e.ur.title,
    fields: {
      title: `${e.en.title} ${e.ur.title} ${e.category.name.en} ${e.category.name.ur}`,
      body: `${e.en.hadeesTarjama} ${e.ur.hadeesTarjama} ${points} ${hikayat}`,
      keywords: keywords,
      slug: `${e.slug.en} ${e.slug.romanUrdu}`,
    },
    textEn: [e.en.title, e.en.hadeesTarjama, e.en.hadeesHawala, ...e.en.points, e.en.hikayat]
      .filter(Boolean)
      .join("\n\n"),
    textUr: [e.ur.title, e.ur.hadeesTarjama, e.ur.hadeesHawala, ...e.ur.points, e.ur.hikayat]
      .filter(Boolean)
      .join("\n\n"),
    citation: shamailCitation(e),
  };
}

function normalizeTimeline(e: TimelineEntry): IndexedDoc {
  const blocksEn = e.en.content
    .map((b) => [b.title, b.content_text].filter(Boolean).join(" "))
    .join(" ");
  const blocksUr = (e.ur.content ?? [])
    .map((b) => [b.title, b.content_text].filter(Boolean).join(" "))
    .join(" ");
  return {
    id: e.id,
    source: "timeline",
    titleEn: e.en.title,
    titleUr: e.ur.title || e.en.title,
    fields: {
      title: `${e.en.title} ${e.ur.title || ""} ${e.en.section || ""}`,
      body: `${e.en.description} ${e.ur.description || ""} ${blocksEn} ${blocksUr}`,
      keywords: "",
      slug: `${e.slug.en} ${e.slug.romanUrdu}`,
    },
    textEn: [e.en.title, e.en.description, ...e.en.content.map((b) => b.content_text)]
      .filter(Boolean)
      .join("\n\n"),
    textUr: [e.ur.title, e.ur.description, ...(e.ur.content ?? []).map((b) => b.content_text)]
      .filter(Boolean)
      .join("\n\n"),
    citation: timelineCitation(e),
  };
}

/**
 * Loads, validates and normalizes the frozen corpus snapshot.
 * In-memory caches the result across calls.
 */
export function loadCorpus(snapshotPath = DEFAULT_SNAPSHOT_PATH): Corpus {
  const raw = readFileSync(snapshotPath, "utf8");
  const parsed = CorpusSnapshotSchema.parse(JSON.parse(raw)) as CorpusSnapshot;
  return buildCorpus(parsed);
}

export function buildCorpus(snapshot: CorpusSnapshot): Corpus {
  const docs = [
    ...snapshot.shamail.map(normalizeShamail),
    ...snapshot.timeline.map(normalizeTimeline),
  ];
  const byId = new Map<string, IndexedDoc>();
  for (const d of docs) byId.set(d.id, d);

  const categories = new Map<string, { id: string; en: string; ur: string }>();
  for (const s of snapshot.shamail) {
    categories.set(s.category.id, {
      id: s.category.id,
      en: s.category.name.en,
      ur: s.category.name.ur,
    });
  }
  const timelineSections = new Map<string, string>();
  for (const t of snapshot.timeline) {
    if (t.en.section && !timelineSections.has(t.en.section)) timelineSections.set(t.en.section, t.en.title);
  }

  return {
    meta: snapshot.meta,
    docs,
    entries: docs,
    byId,
    categories,
    timelineSections,
    counts: {
      shamail: snapshot.shamail.length,
      timeline: snapshot.timeline.length,
      courses: snapshot.courses.length,
    },
    sha256: snapshot.sha256,
    generatedAt: snapshot.generatedAt,
    corpusVersion: snapshot.corpus_version,
  };
}

// ---------------------------------------------------------------------------
// Live corpus fetch (spec-mandated: /api/seerathon/corpus at runtime)
// ---------------------------------------------------------------------------

interface ApiListResponse {
  items?: unknown[];
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
}

async function apiGet(path: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${CORPUS_API_BASE}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { error?: boolean; msg?: string; data?: unknown };
      if (json.error) throw new Error(json.msg ?? "corpus API error");
      return json.data;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Fetch every page of a list endpoint (page, limit, plus extra query params). */
async function apiFetchAll(
  endpoint: "shamail" | "timeline",
  limit: number,
  extra: Record<string, string> = {},
): Promise<unknown[]> {
  const collected: unknown[] = [];
  let page = 1;
  for (let i = 0; i < 30; i++) {
    const params = new URLSearchParams({ limit: String(limit), page: String(page) });
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    const data = (await apiGet(`/${endpoint}?${params.toString()}`)) as ApiListResponse;
    if (!Array.isArray(data.items)) break;
    collected.push(...data.items);
    const pages = data.pages ?? 0;
    if (page >= pages || pages === 0) break;
    page += 1;
  }
  return collected;
}

/**
 * Pull the full corpus live from /api/seerathon/corpus using the spec's query
 * parameters (limit max 120; include_hikayat=true for Shamail longer text).
 * Validates the result against the same zod schema as the snapshot.
 */
export async function fetchCorpusFromAPI(): Promise<Corpus> {
  const meta = (await apiGet("/meta")) as CorpusSnapshot["meta"];
  const shamail = await apiFetchAll("shamail", 120, { include_hikayat: "true" });
  const timeline = await apiFetchAll("timeline", 50);
  const courses = (await apiGet("/courses")) as { items?: unknown[] };
  const items = courses.items ?? [];

  const snapshot = CorpusSnapshotSchema.parse({
    meta: {
      version: meta?.version ?? "unknown",
      sources: meta?.sources ?? ["shamail", "seerah_timeline", "courses_index"],
      disclaimer: meta?.disclaimer ?? { en: "", ur: "" },
      rate_limit: meta?.rate_limit ?? { window_seconds: 60, max_per_ip: 60 },
      counts: meta?.counts ?? {},
    },
    shamail,
    timeline,
    courses: items,
    generatedAt: new Date().toISOString(),
    corpus_version: meta?.version ?? "unknown",
    schema_verified: true,
    sha256: "",
  }) as CorpusSnapshot;
  snapshot.sha256 = createHash("sha256")
    .update(
      JSON.stringify({
        corpus_version: snapshot.corpus_version,
        shamail,
        timeline,
        courses: items,
      }),
    )
    .digest("hex");

  return buildCorpus(snapshot);
}
