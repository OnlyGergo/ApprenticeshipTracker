import { describe, expect, test } from "bun:test";
import { parseLog, parseLogs } from "../server/services/parser";

describe("parseLog", () => {
  test("description then one line per KSB", () => {
    const r = parseLog(`Built the login page for the HR portal
K1: Applied knowledge of web frameworks
S3: Wrote and tested the form validation`);
    expect(r.description).toBe("Built the login page for the HR portal");
    expect(r.ksbs).toEqual([
      { code: "K1", explanation: "Applied knowledge of web frameworks" },
      { code: "S3", explanation: "Wrote and tested the form validation" },
    ]);
    expect(r.warnings).toEqual([]);
    expect(r.date).toBeNull();
  });

  test("comma group becomes one row per KSB sharing the explanation", () => {
    const r = parseLog(`Sprint retro\nK2, S4, B1: Reflected on delivery and agreed actions`);
    expect(r.ksbs).toEqual([
      { code: "K2", explanation: "Reflected on delivery and agreed actions" },
      { code: "S4", explanation: "Reflected on delivery and agreed actions" },
      { code: "B1", explanation: "Reflected on delivery and agreed actions" },
    ]);
  });

  test("other separators, bullets, lowercase codes, dashes", () => {
    const r = parseLog(`Desc\n- k5 - first\n* S10/B2 – second\n• K7 & K8 — third\nS1 and S2: fourth`);
    expect(r.ksbs.map((k) => [k.code, k.explanation])).toEqual([
      ["K5", "first"],
      ["S10", "second"],
      ["B2", "second"],
      ["K7", "third"],
      ["K8", "third"],
      ["S1", "fourth"],
      ["S2", "fourth"],
    ]);
  });

  test("continuation lines append to the previous KSB group", () => {
    const r = parseLog(`Desc\nK1, K2: started here\n  and carried on here\nS1: other`);
    expect(r.ksbs[0]!.explanation).toBe("started here and carried on here");
    expect(r.ksbs[1]!.explanation).toBe("started here and carried on here");
    expect(r.ksbs[2]!.explanation).toBe("other");
  });

  test("multi-line description before the first KSB line", () => {
    const r = parseLog(`Line one\nLine two\nK1: x`);
    expect(r.description).toBe("Line one\nLine two");
  });

  test("description mentioning things that look KSB-ish is not a KSB line", () => {
    const r = parseLog(`S3 bucket policy review with B2B team\nK1: x`);
    expect(r.description).toBe("S3 bucket policy review with B2B team");
    expect(r.ksbs).toHaveLength(1);
  });

  test("duplicate code merges explanations with a warning", () => {
    const r = parseLog(`Desc\nK1: a\nK1, S1: b`);
    expect(r.ksbs).toEqual([
      { code: "K1", explanation: "a b" },
      { code: "S1", explanation: "b" },
    ]);
    expect(r.warnings.some((w) => w.includes("K1"))).toBe(true);
  });

  test("optional header with ISO date and time range", () => {
    const r = parseLog(`2026-10-13 09:00-12:30\nDesc\nK1: x`);
    expect([r.date, r.start_time, r.end_time]).toEqual(["2026-10-13", "09:00", "12:30"]);
    expect(r.description).toBe("Desc");
  });

  test("UK date, en dash and 'to', weekday allowed", () => {
    expect(parseLog(`Mon 13/10/2026 9.00 – 17:15\nDesc\nK1: x`)).toMatchObject({
      date: "2026-10-13",
      start_time: "09:00",
      end_time: "17:15",
    });
    expect(parseLog(`13/10/2026 9:00 to 10:00\nD\nK1: x`).end_time).toBe("10:00");
  });

  test("bad header values warn", () => {
    expect(parseLog(`31/02/2026 09:00-10:00\nD\nK1: x`).warnings[0]).toContain("Invalid date");
    expect(parseLog(`2026-10-13 12:00-09:00\nD\nK1: x`).warnings[0]).toContain("not after");
  });

  test("prose containing a time is description, not header", () => {
    const r = parseLog(`Stand-up 09:00-09:15 with the team\nK1: x`);
    expect(r.start_time).toBeNull();
    expect(r.description).toBe("Stand-up 09:00-09:15 with the team");
  });

  test("warns on missing parts and stray lines", () => {
    expect(parseLog(`K1: only ksb`).warnings).toContain("Missing description line");
    expect(parseLog(`just text`).warnings).toContain("No KSB lines found");
    expect(parseLog(`D\nK1:`).warnings[0]).toContain("No explanation");
    expect(parseLog(`D\nK1: x\n\nstray`).warnings[0]).toContain("Ignored line");
  });

  test("CRLF input", () => {
    expect(parseLog("D\r\nK1: x\r\n").ksbs).toEqual([{ code: "K1", explanation: "x" }]);
  });
});

describe("parseLogs", () => {
  test("splits on --- and skips empty blocks", () => {
    const r = parseLogs(`2026-10-13 09:00-10:00\nA\nK1: a\n---\n2026-10-14 10:00-11:00\nB\nS1: b\n---\n\n`);
    expect(r).toHaveLength(2);
    expect(r.map((e) => [e.date, e.description])).toEqual([
      ["2026-10-13", "A"],
      ["2026-10-14", "B"],
    ]);
  });
});
