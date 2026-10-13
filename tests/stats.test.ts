import { beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDb } from "../server/db/client";
import { migrate } from "../server/db/migrate";
import { daysBetween, ksbStats, londonToday, staleness, trafficLight } from "../server/services/stats";
import { missingStar, starFromRow, starScore, starToRow, suggestStar } from "../server/services/star";

describe("trafficLight", () => {
  test("red when untouched", () => {
    expect(trafficLight({ entries: 0, evidence: [0, 0, 0, 0, 0] })).toBe("red");
  });
  test("yellow: entries only, weak only, medium only, lone strong file", () => {
    expect(trafficLight({ entries: 3, evidence: [0, 0, 0, 0, 0] })).toBe("yellow");
    expect(trafficLight({ entries: 2, evidence: [0, 0, 0, 1, 2] })).toBe("yellow");
    expect(trafficLight({ entries: 2, evidence: [0, 0, 3, 0, 0] })).toBe("yellow");
    expect(trafficLight({ entries: 0, evidence: [1, 0, 0, 0, 0] })).toBe("yellow");
  });
  test("green: strong evidence in a mix", () => {
    expect(trafficLight({ entries: 1, evidence: [0, 1, 0, 0, 0] })).toBe("green");
    expect(trafficLight({ entries: 0, evidence: [1, 0, 0, 0, 5] })).toBe("green");
  });
});

describe("ksbStats (db)", () => {
  let db: Database;
  beforeAll(async () => {
    db = openDb(":memory:");
    await migrate(db);
    db.run(`INSERT INTO ksbs (id, code, title, category, sort_order) VALUES
      (1, 'K1', 't', 'knowledge', 1), (2, 'S1', 't', 'skill', 2), (3, 'B1', 't', 'behaviour', 3)`);
    db.run(`INSERT INTO entries (id, date, start_time, end_time, text, chain_root_id, chain_index) VALUES
      (1, '2026-10-01', '09:00', '10:00', 'a', NULL, 0),
      (2, '2026-10-01', '11:00', '12:00', 'a', 1, 1),
      (3, '2026-10-05', '09:00', '10:00', 'b', NULL, 0)`);
    db.run(`INSERT INTO entry_ksbs (entry_id, ksb_id, explanation, best_evidence) VALUES
      (1, 1, '', 0), (2, 1, '', 0), (3, 1, '', 1), (3, 2, '', 0)`);
    // File 1 on entry 3 (K1 + S1) at q1; file 2 directly on K1 at q4; file 3 on entry 3 AND K1 (count once).
    db.run(`INSERT INTO evidence_files (id, entry_id, ksb_id, path, original_name, mime, size, quality, uploaded_at) VALUES
      (1, 3, NULL, 'p', 'n', 'x', 1, 1, '2026-10-07T10:00:00Z'),
      (2, NULL, 1, 'p', 'n', 'x', 1, 4, '2026-10-02T10:00:00Z'),
      (3, 3, 1, 'p', 'n', 'x', 1, 4, '2026-10-03T10:00:00Z')`);
  });

  test("counts chains, dedupes files, picks latest touch", () => {
    const [k1, s1, b1] = ksbStats(db);
    expect(k1).toMatchObject({
      code: "K1",
      entry_count: 2, // entries 1+2 are one chain
      evidence_count: 3,
      evidence_by_quality: [1, 0, 0, 2, 0],
      has_best_evidence: true,
      last_touched: "2026-10-07",
      light: "green",
    });
    expect(s1).toMatchObject({ entry_count: 1, evidence_by_quality: [1, 0, 0, 1, 0], light: "green", has_best_evidence: false });
    expect(b1).toMatchObject({ entry_count: 0, evidence_count: 0, last_touched: null, light: "red" });
  });

  test("single KSB lookup", () => {
    expect(ksbStats(db, 3).map((s) => s.code)).toEqual(["B1"]);
  });

  test("staleness uses max(date)", () => {
    expect(staleness(db, "2026-10-13")).toEqual({ last_entry_date: "2026-10-05", days_since: 8 });
  });
});

describe("dates", () => {
  test("daysBetween across the October clock change", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
  test("londonToday uses UK time", () => {
    expect(londonToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01"); // BST
    expect(londonToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31"); // GMT
  });
});

describe("star", () => {
  test("row round trip and score", () => {
    const flags = starFromRow(starToRow({ situation: true, action: true }));
    expect(flags).toEqual({ situation: true, task: false, action: true, result: false });
    expect(starScore(flags)).toBe(2);
    expect(missingStar(flags)).toEqual(["task", "result"]);
  });
  test("suggestStar keyword hints", () => {
    expect(
      suggestStar("The client's existing report was slow. I needed to speed it up. I refactored the query, which reduced load time by 60%."),
    ).toEqual({ situation: true, task: true, action: true, result: true });
    expect(suggestStar("meeting")).toEqual({ situation: false, task: false, action: false, result: false });
  });
});
