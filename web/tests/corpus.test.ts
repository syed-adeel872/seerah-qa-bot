import { describe, expect, it } from "vitest";
import { loadCorpus, buildCorpus } from "../src/lib/corpus/load";
import { CorpusSnapshotSchema } from "../src/lib/corpus/schema";

const corpus = loadCorpus();

describe("corpus loader", () => {
  it("loads the frozen snapshot with expected counts", () => {
    expect(corpus.counts.shamail).toBe(120);
    expect(corpus.counts.timeline).toBe(34);
    expect(corpus.docs.length).toBe(154);
  });

  it("parses the snapshot without zod failures", () => {
    // buildCorpus itself ran CorpusSnapshotSchema.parse — reaching here means it passed.
    expect(corpus.corpusVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has 6 shamail categories and timeline sections present", () => {
    expect(corpus.categories.size).toBe(6);
    expect([...corpus.categories.keys()].sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    for (const s of ["wiladat", "childhood", "larakpan", "youth", "nubuwat", "madni"]) {
      expect(corpus.timelineSections.has(s)).toBe(true);
    }
  });

  it("normalizes every entry into an IndexedDoc with citation + non-empty fields", () => {
    for (const doc of corpus.docs) {
      expect(doc.id.length).toBeGreaterThan(0);
      expect(["shamail", "timeline"]).toContain(doc.source);
      expect(doc.titleEn.length).toBeGreaterThan(0);
      expect(doc.citation.id).toBe(doc.id);
      expect(doc.fields.title.length + doc.fields.body.length).toBeGreaterThan(0);
      expect(doc.textEn.length).toBeGreaterThan(0);
    }
  });

  it("shamail citations carry hadeesHawala when available", () => {
    const withHawala = corpus.docs.filter((d) => d.source === "shamail" && d.citation.hawala?.en);
    const missing = corpus.docs.filter(
      (d) => d.source === "shamail" && !d.citation.hawala?.en && !d.citation.hawala?.ur,
    );
    expect(withHawala.length).toBeGreaterThan(0);
    // exactly one shamail entry lacks a hawala per the live corpus
    expect(missing.length).toBe(1);
  });

  it("byId map contains every entry exactly once", () => {
    expect(corpus.byId.size).toBe(154);
    for (const doc of corpus.docs) expect(corpus.byId.get(doc.id)).toBe(doc);
  });

  it("courses count is present in counts", () => {
    expect(corpus.counts.courses).toBe(20);
  });
});

describe("buildCorpus from raw snapshot shape", () => {
  it("rejects a corrupt snapshot (zod)", () => {
    expect(() =>
      buildCorpus(CorpusSnapshotSchema.parse({} as never)),
    ).toThrow();
  });
});
