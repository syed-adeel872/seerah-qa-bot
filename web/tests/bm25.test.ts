import { describe, expect, it } from "vitest";
import { search } from "../src/lib/search/search";
import { tokenize, uniqueTokens, conflateToken } from "../src/lib/search/tokenize";

describe("tokenizer + conflation", () => {
  it("splits English, Urdu script and roman-Urdu", () => {
    expect(uniqueTokens("The Prophet ﷺ was born")).toContain("prophet");
    expect(uniqueTokens("صبر")).toEqual(["patience"]);
    expect(uniqueTokens("huzoor ka sabr")).toEqual(["prophet", "ka", "patience"]);
  });

  it("conflates vowel-less roman-Urdu slug forms", () => {
    expect(conflateToken("wladt")).toBe("birth");
    expect(conflateToken("wiladat")).toBe("birth");
  });

  it("normalizes Arabic letter variants", () => {
    expect(tokenize("\u0627\u0644\u0646\u0628\u06CC")).toContain("prophet");
  });
});

describe("BM25 retrieval", () => {
  it("finds patience/sabr entries from English, Urdu, and roman-Urdu", () => {
    for (const q of ["patience", "صبر", "huzoor ka sabr", "prophet patience"]) {
      const r = search(q, { topK: 5 });
      expect(r.hits.length).toBeGreaterThan(0);
      const top = r.hits[0];
      expect(top.substantive).toBe(true);
      // The known "Patience of Messenger of Allah" entry should be near the top.
      const patienceHit = r.hits.find((h) => h.doc.id === "672b449ad458540020750f9f");
      expect(patienceHit).toBeDefined();
    }
  });

  it("retrieves the Blessed Birth timeline entry for a birth question", () => {
    const r = search("when was the prophet born", { topK: 5 });
    expect(r.hits.length).toBeGreaterThan(0);
    const birth = r.hits.find((h) => h.doc.citation.section === "wiladat");
    expect(birth).toBeDefined();
  });

  it("returns empty hits for an out-of-corpus query", () => {
    const r = search("quantum mechanics in antarctica", { topK: 8 });
    expect(r.hits).toEqual([]);
  });

  it("reports matched categories and sections for explainability", () => {
    const r = search("mother of the prophet", { topK: 5 });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.matchedSections.length).toBeGreaterThan(0);
    expect(r.corpus.shamail).toBe(120);
    expect(r.corpus.timeline).toBe(34);
  });

  it("is deterministic and ranks higher-scoring docs first", () => {
    const a = search("prophet marriage", { topK: 6 });
    const b = search("prophet marriage", { topK: 6 });
    expect(a.hits.map((h) => h.doc.id)).toEqual(b.hits.map((h) => h.doc.id));
    const scores = a.hits.map((h) => h.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
});
