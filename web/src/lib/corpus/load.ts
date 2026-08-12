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
  };
}

function timelineCitation(e: TimelineEntry): Citation {
  return {
    id: e.id,
    source: "timeline",
    title: { en: e.en.title, ur: e.ur.title || e.en.title },
    section: e.en.section || undefined,
    slug: e.slug,
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
