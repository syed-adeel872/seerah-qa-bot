import { z } from "zod";

/**
 * Zod schemas + TS types for the frozen corpus snapshot produced by
 * scripts/verify-api-schema.mjs (see data/corpus.snapshot.json).
 * Shapes mirror the live API at /api/seerathon/corpus.
 */

export const LangText = z.object({ en: z.string().default(""), ur: z.string().default("") });

export const CategorySchema = z.object({
  id: z.string(),
  name: LangText,
});

export const SlugSchema = z.object({
  en: z.string().optional().default(""),
  romanUrdu: z.string().optional().default(""),
});

export const ShamailEntrySchema = z.object({
  id: z.string(),
  source: z.literal("shamail"),
  category: CategorySchema,
  slug: SlugSchema,
  keywords: z.array(z.string()).default([]),
  en: z.object({
    title: z.string().default(""),
    hadeesTarjama: z.string().optional().default(""),
    hadeesHawala: z.string().optional().default(""),
    hikayat: z.string().optional().default(""),
    type: z.string().optional().default(""),
    points: z.array(z.string()).optional().default([]),
  }),
  ur: z.object({
    title: z.string().default(""),
    hadeesTarjama: z.string().optional().default(""),
    hadeesHawala: z.string().optional().default(""),
    hikayat: z.string().optional().default(""),
    type: z.string().optional().default(""),
    points: z.array(z.string()).optional().default([]),
  }),
}).passthrough();

export const TimelineBlockSchema = z.object({
  title: z.string().optional().default(""),
  sequence: z.number().optional(),
  content_text: z.string().optional().default(""),
}).passthrough();

export const TimelineEntrySchema = z.object({
  id: z.string(),
  source: z.literal("seerah_timeline"),
  slug: SlugSchema,
  en: z.object({
    title: z.string().default(""),
    description: z.string().optional().default(""),
    section: z.string().optional().default(""),
    umarMubarak: z.number().optional(),
    gregorianDate: z.number().optional(),
    content: z.array(TimelineBlockSchema).optional().default([]),
  }),
  ur: z.object({
    title: z.string().optional().default(""),
    description: z.string().optional().default(""),
    section: z.string().optional().default(""),
    umarMubarak: z.number().optional(),
    gregorianDate: z.number().optional(),
    content: z.array(TimelineBlockSchema).optional().default([]),
  }),
}).passthrough();

export const CourseEntrySchema = z.object({
  id: z.string(),
  source: z.literal("courses_index"),
  slug: SlugSchema,
  title: LangText,
  description: LangText,
  isLive: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
}).passthrough();

export const SnapshotMetaSchema = z.object({
  version: z.string(),
  sources: z.array(z.string()),
  disclaimer: LangText,
  rate_limit: z.object({ window_seconds: z.number(), max_per_ip: z.number() }),
  counts: z.record(z.string(), z.number()),
}).passthrough();

export const CorpusSnapshotSchema = z.object({
  meta: SnapshotMetaSchema,
  shamail: z.array(ShamailEntrySchema),
  timeline: z.array(TimelineEntrySchema),
  courses: z.array(CourseEntrySchema),
  generatedAt: z.string(),
  corpus_version: z.string(),
  schema_verified: z.boolean().optional(),
  sha256: z.string().optional(),
}).passthrough();

export type LangText = z.infer<typeof LangText>;
export type Category = z.infer<typeof CategorySchema>;
export type Slug = z.infer<typeof SlugSchema>;
export type ShamailEntry = z.infer<typeof ShamailEntrySchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type TimelineBlock = z.infer<typeof TimelineBlockSchema>;
export type CourseEntry = z.infer<typeof CourseEntrySchema>;
export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;
export type CorpusSnapshot = z.infer<typeof CorpusSnapshotSchema>;

export type CorpusSource = "shamail" | "timeline";

/** A citation — used verbatim for answer "source chips". */
export interface Citation {
  id: string;
  source: CorpusSource;
  title: LangText;
  hawala?: LangText; // shamail hadeesHawala (en/ur)
  category?: Category; // shamail
  section?: string; // timeline
  slug: Slug;
}

/**
 * Normalized, searchable unit of the corpus.
 * One entry per Shamail item and one per Timeline item.
 */
export interface IndexedDoc {
  id: string;
  source: CorpusSource;
  titleEn: string;
  titleUr: string;
  /** Weighted search fields */
  fields: {
    title: string;
    body: string;
    keywords: string;
    slug: string;
  };
  /** Plain concatenated text per language (display context / summary input) */
  textEn: string;
  textUr: string;
  citation: Citation;
}
