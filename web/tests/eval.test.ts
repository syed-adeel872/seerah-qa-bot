import { describe, expect, it } from "vitest";
import { answerQuestion, type Answer } from "../src/lib/engine/answer";
import { EVAL_CASES, type EvalCase } from "../src/lib/eval/cases";

interface EvalResult {
  case: EvalCase;
  pass: boolean;
  detail: string;
  answer?: Answer;
}

function evaluateExpectation(c: EvalCase, a: Answer): EvalResult {
  const ex = c.expect;
  const failPrefix = (why: string) => `${c.id}: ${why}`;

  if (ex.kind === "out_of_corpus") {
    const pass = a.status === "out_of_corpus";
    return {
      case: c,
      pass,
      detail: pass
        ? `out_of_corpus ✓ (topScore=${a.matched?.topScore ?? "-"})`
        : failPrefix(`expected out_of_corpus, got ${a.status}`),
      answer: a,
    };
  }

  if (ex.kind === "blocked") {
    const pass = a.status === "blocked" && (ex.sub === "fatwa" ? a.kind === "fatwa" : a.kind === "injection");
    return {
      case: c,
      pass,
      detail: pass ? `blocked(${a.kind}) ✓` : failPrefix(`expected blocked(${ex.sub}), got ${a.status}/${a.kind}`),
      answer: a,
    };
  }

  // answered
  const problems: string[] = [];
  if (a.status !== "answered") {
    return {
      case: c,
      pass: false,
      detail: failPrefix(`expected answered, got ${a.status}/${a.kind}`),
      answer: a,
    };
  }
  if (ex.lang && a.lang !== ex.lang) problems.push(`lang: expected ${ex.lang}, got ${a.lang}`);
  if (a.citations.length === 0) problems.push("no citations");
  if (ex.minCitations !== undefined && a.citations.length < ex.minCitations)
    problems.push(`citations < ${ex.minCitations}`);
  if (ex.requireSource && !a.citations.some((ci) => ci.source === ex.requireSource))
    problems.push(`no ${ex.requireSource} citation`);
  if (ex.topDocId && a.matched?.topDocId !== ex.topDocId)
    problems.push(`topDocId mismatch: expected ${ex.topDocId}, got ${a.matched?.topDocId}`);
  if (ex.allowedCitationIds && !a.citations.some((ci) => ex.allowedCitationIds!.includes(ci.id)))
    problems.push(`no allowed citation`);

  return {
    case: c,
    pass: problems.length === 0,
    detail: problems.length === 0 ? "answered ✓" : failPrefix(problems.join("; ")),
    answer: a,
  };
}

describe("answer pipeline — eval suite", () => {
  const results: EvalResult[] = [];

  it("runs all eval cases", async () => {
    for (const c of EVAL_CASES) {
      const a = await answerQuestion(c.question);
      results.push(evaluateExpectation(c, a));
    }

    const failures = results.filter((r) => !r.pass);
    const answered = results.filter((r) => r.answer?.status === "answered");
    const out = results.filter((r) => r.answer?.status === "out_of_corpus");
    const blocked = results.filter((r) => r.answer?.status === "blocked");

    const citationOk =
      answered.filter((r) => r.answer!.citations.length > 0).length / Math.max(1, answered.length);
    const refusalOk =
      blocked.filter((r) => r.answer!.kind === "fatwa" || r.answer!.kind === "injection").length /
      Math.max(1, blocked.length);
    const groundingOk = out.filter((r) => r.pass).length / Math.max(1, out.length);

    console.log(
      `\n=== EVAL REPORT ===\n` +
        `total: ${results.length} | passed: ${results.length - failures.length} | failed: ${failures.length}\n` +
        `answered: ${answered.length} (citation coverage ${(citationOk * 100).toFixed(0)}%) | ` +
        `out-of-corpus: ${out.length} (grounding ${(groundingOk * 100).toFixed(0)}%) | ` +
        `blocked: ${blocked.length} (refusal ${(refusalOk * 100).toFixed(0)}%)\n` +
        `failures:${failures.length ? "" : " none"}` +
        failures.map((f) => `\n  - ${f.detail}`).join("") +
        `\n====================`,
    );

    // hard gate: at most one failing eval case
    expect(failures.length).toBeLessThanOrEqual(1);
  });
});