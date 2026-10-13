import { describe, expect, test } from "bun:test";
import { jaccard, shingles, similarity, tokenize } from "../server/lib/text";
import { assignChain, durationMinutes, summariseOtj, totalMinutes, type OtjEntry } from "../server/services/chaining";

describe("text", () => {
  test("tokenize lowercases, strips punctuation and stopwords", () => {
    expect(tokenize("I fixed THE login-bug, didn't I?")).toEqual(["fixed", "login", "bug", "didnt"]);
  });

  test("bigram shingles, unigram fallback", () => {
    expect([...shingles("fixed login bug")]).toEqual(["fixed login", "login bug"]);
    expect([...shingles("the deployment")]).toEqual(["deployment"]);
    expect(shingles("the and of").size).toBe(0);
  });

  test("jaccard", () => {
    expect(jaccard(new Set([1, 2]), new Set([2, 3]))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  test("similarity ignores case, punctuation and stopwords", () => {
    expect(similarity("Fixed the login bug.", "fixed a LOGIN bug")).toBe(1);
    expect(similarity("Fixed login bug", "Wrote unit tests")).toBe(0);
  });
});

const c = (id: number, text: string, chain_root_id: number | null = null, chain_index = 0) => ({ id, text, chain_root_id, chain_index });

describe("assignChain", () => {
  const base = "Worked on the payroll reporting dashboard API endpoints and SQL queries";

  test("first entry of the day is a root", () => {
    expect(assignChain(base, [])).toEqual({ chain_root_id: null, chain_index: 0, similarity: 0 });
  });

  test("near-identical text chains to the root at index 1", () => {
    const r = assignChain(`${base}.`, [c(1, base)]);
    expect(r.chain_root_id).toBe(1);
    expect(r.chain_index).toBe(1);
  });

  test("below threshold stays a root", () => {
    const r = assignChain("Worked on the payroll reporting dashboard UI styling", [c(1, base)]);
    expect(r.chain_root_id).toBeNull();
    expect(r.similarity).toBeLessThan(0.8);
  });

  test("threshold is inclusive at 0.80", () => {
    // 5 shingles vs 4 shared + 0 extra... build exact 4/5 = 0.8
    const a = "alpha beta gamma delta epsilon zeta"; // 5 bigrams
    const b = "alpha beta gamma delta epsilon"; // 4 bigrams, all in a
    expect(similarity(a, b)).toBeCloseTo(0.8);
    expect(assignChain(b, [c(1, a)]).chain_root_id).toBe(1);
  });

  test("matching a chained member joins its root at the next index", () => {
    const r = assignChain(base, [c(1, base), c(2, base, 1, 1), c(3, "something else entirely here")]);
    expect(r).toMatchObject({ chain_root_id: 1, chain_index: 2 });
  });

  test("best match wins across chains", () => {
    const other = "Reviewed pull requests for the payroll reporting dashboard API endpoints";
    const r = assignChain(base, [c(1, other), c(2, base)]);
    expect(r.chain_root_id).toBe(2);
  });

  test("orphaned member (root deleted) acts as its own root", () => {
    const r = assignChain(base, [c(5, base, null, 2)]);
    expect(r).toMatchObject({ chain_root_id: 5, chain_index: 3 });
  });
});

describe("OTJ summary", () => {
  const e = (id: number, start: string, end: string, text: string, root: number | null = null, idx = 0, date = "2026-10-13"): OtjEntry => ({
    id,
    date,
    start_time: start,
    end_time: end,
    text,
    chain_root_id: root,
    chain_index: idx,
  });

  test("durationMinutes", () => {
    expect(durationMinutes("09:00", "12:30")).toBe(210);
    expect(durationMinutes("10:00", "09:00")).toBe(0);
  });

  test("sums the whole chain, root text only, no double counting", () => {
    const chains = summariseOtj([
      e(2, "13:00", "14:00", "root text (dup)", 1, 1),
      e(1, "09:00", "10:30", "root text"),
      e(3, "15:00", "15:30", "other"),
      e(4, "10:00", "11:00", "next day", null, 0, "2026-10-14"),
    ]);
    expect(chains).toEqual([
      { root_id: 1, date: "2026-10-13", text: "root text", minutes: 150, entry_ids: [1, 2] },
      { root_id: 3, date: "2026-10-13", text: "other", minutes: 30, entry_ids: [3] },
      { root_id: 4, date: "2026-10-14", text: "next day", minutes: 60, entry_ids: [4] },
    ]);
    expect(totalMinutes(chains)).toBe(240);
  });

  test("root filtered out: lowest-index member supplies the text", () => {
    const [chain] = summariseOtj([e(3, "11:00", "12:00", "second dup", 1, 2), e(2, "10:00", "11:00", "first dup", 1, 1)]);
    expect(chain).toMatchObject({ root_id: 1, text: "first dup", minutes: 120 });
  });
});
