import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signIn } from "./helpers";
import { parseCsv } from "../server/lib/csv";
import { detectColumns, parseDateCell, parseDuration, parseTimeCell } from "../server/services/importer";

const PASS = "test-pass";
process.env.BASIC_AUTH_USER = "tester";
process.env.BASIC_AUTH_PASS_HASH = await Bun.password.hash(PASS);
const dataDir = mkdtempSync(join(tmpdir(), "ksb-extras-"));
process.env.DATA_DIR = dataDir;

const { app } = await import("../server/index");
const { openDb, setDb, getDb } = await import("../server/db/client");
const { migrate } = await import("../server/db/migrate");
const { seedKsbs, validateSeed } = await import("../server/db/seed-ksbs");
const { coverage } = await import("../server/services/reports");
const { updateSettings } = await import("../server/services/settings");

const auth = await signIn(app, PASS);

async function call(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { cookie: auth } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res = await app.handle(new Request(`http://localhost/api${path}`, init));
  const buf = new Uint8Array(await res.arrayBuffer());
  let json: any = null;
  try {
    json = JSON.parse(new TextDecoder().decode(buf));
  } catch {}
  return { status: res.status, json, buf, headers: res.headers };
}

beforeAll(async () => {
  const db = openDb(":memory:");
  await migrate(db);
  seedKsbs(db, validateSeed(["K1", "K2", "S1", "S2", "B1"].map((code) => ({ code, title: code }))));
  setDb(db);
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("csv", () => {
  test("quoted multi-line cells, escaped quotes, BOM, CRLF", () => {
    const rows = parseCsv('﻿Date,Text\r\n13/10/2026,"line one\r\nline ""two"""\r\n\r\n14/10/2026,plain\r\n');
    expect(rows).toEqual([
      ["Date", "Text"],
      ["13/10/2026", 'line one\nline "two"'],
      ["14/10/2026", "plain"],
    ]);
  });

  test("sniffs semicolons", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("import cell readers", () => {
  test("dates, times, durations", () => {
    expect(parseDateCell("13/10/2026")).toBe("2026-10-13");
    expect(parseDateCell("Tue 13 Oct 2026")).toBe("2026-10-13");
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseTimeCell("2:30 pm")).toBe("14:30");
    expect(parseTimeCell("13/10/2026 09:15")).toBe("09:15");
    expect(parseTimeCell("17")).toBeNull();
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("45", true)).toBe(45);
    expect(parseDuration("1h 15m")).toBe(75);
  });

  test("column detection", () => {
    const cols = detectColumns(["Activity Date", "Start Time", "End Time", "Hours", "Description"], []);
    expect(cols).toEqual({ date: 0, start: 1, end: 2, duration: 3, text: 4 });
  });
});

const SAMPLE = `I did a thing, it went well, I developed the skills:
K1, B1 - I tried hard
S1 - I need to improve how I did X but I achieved this by doing yz`;

const csvCell = (s: string) => `"${s.replaceAll('"', '""')}"`;

describe("import API", () => {
  const csv = [
    "Date,Start,End,Description",
    `13/10/2026,09:00,12:30,${csvCell(SAMPLE)}`,
    `14/10/2026,10:00,11:00,${csvCell("Sprint planning\nK2: estimated stories")}`,
    `15/10/2026,10:00,11:00,${csvCell("Bad codes\nK99: nope")}`,
  ].join("\n");

  test("preview parses the log text cell", async () => {
    const r = await call("POST", "/import/preview", { kind: "csv", content: csv });
    expect(r.status).toBe(200);
    expect(r.json.columns).toEqual({ date: 0, start: 1, end: 2, duration: null, text: 3 });
    const [a, b, c] = r.json.rows;
    expect(a).toMatchObject({ row: 2, date: "2026-10-13", start_time: "09:00", end_time: "12:30", errors: [], duplicate: false });
    expect(a.text).toBe("I did a thing, it went well, I developed the skills:");
    expect(a.ksbs).toEqual([
      { code: "K1", explanation: "I tried hard" },
      { code: "B1", explanation: "I tried hard" },
      { code: "S1", explanation: "I need to improve how I did X but I achieved this by doing yz" },
    ]);
    expect(b.ksbs).toEqual([{ code: "K2", explanation: "estimated stories" }]);
    expect(c.errors).toEqual(["Unknown KSB code(s): K99"]);
  });

  test("duration column without times assumes a 09:00 start", async () => {
    const r = await call("POST", "/import/preview", {
      kind: "csv",
      content: `Date,Duration,Notes\n13/10/2026,1.5,${csvCell(SAMPLE)}`,
    });
    expect(r.json.rows[0]).toMatchObject({ start_time: "09:00", end_time: "10:30", errors: [] });
    expect(r.json.rows[0].warnings[0]).toContain("assumed 09:00");
  });

  test("commit creates entries, then re-preview flags duplicates", async () => {
    const preview = (await call("POST", "/import/preview", { kind: "csv", content: csv })).json;
    const entries = preview.rows
      .filter((r: any) => r.errors.length === 0)
      .map((r: any) => ({ date: r.date, start_time: r.start_time, end_time: r.end_time, text: r.text, ksbs: r.ksbs }));
    const r = await call("POST", "/import/commit", { entries });
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(2);
    const again = (await call("POST", "/import/preview", { kind: "csv", content: csv })).json;
    expect(again.rows.map((x: any) => x.duplicate)).toEqual([true, true, false]);
  });

  test("commit is all-or-nothing", async () => {
    const before = (await call("GET", "/entries")).json.length;
    const r = await call("POST", "/import/commit", {
      entries: [
        { date: "2026-10-20", start_time: "09:00", end_time: "10:00", text: "ok" },
        { date: "2026-10-20", start_time: "11:00", end_time: "12:00", text: "bad", ksbs: [{ code: "K98" }] },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("Entry 2");
    expect((await call("GET", "/entries")).json.length).toBe(before);
  });

  test("plain paste preview splits on ---", async () => {
    const r = await call("POST", "/import/preview", { kind: "text", content: `2026-10-16 09:00-10:00\n${SAMPLE}\n---\nOther\nK2: x` });
    expect(r.json.rows).toHaveLength(2);
    expect(r.json.rows[0]).toMatchObject({ date: "2026-10-16", start_time: "09:00", errors: [] });
    expect(r.json.rows[1].errors).toContain("No date");
  });
});

describe("settings + reports", () => {
  test("settings round-trip and validation", async () => {
    expect((await call("GET", "/settings")).json).toEqual({ start_date: null, gateway_date: null, target_hours: null, stale_after_days: 7 });
    const r = await call("PATCH", "/settings", { start_date: "2026-09-01", gateway_date: "2027-09-01", target_hours: 365 });
    expect(r.json).toMatchObject({ start_date: "2026-09-01", target_hours: 365 });
    expect((await call("PATCH", "/settings", { gateway_date: "2026-01-01" })).status).toBe(400);
    expect((await call("GET", "/entries/stale")).json.stale_after_days).toBe(7);
  });

  test("coverage: cumulative hours, KSBs touched, linear target", () => {
    const c = coverage(getDb(), "2026-10-31");
    expect(c.points[0]!.date).toBe("2026-09-01");
    expect(c.points[0]!.target_hours).toBe(0);
    const last = c.points.at(-1)!;
    expect(last.date).toBe("2027-09-01");
    expect(last.target_hours).toBe(365);
    expect(last.hours).toBeNull(); // future
    const today = c.points.find((p) => p.date === "2026-10-31")!;
    expect(today.hours).toBe(4.5); // 3.5h + 1h imported
    expect(today.ksbs).toBe(4); // K1 B1 S1 K2
    expect(c.ksb_total).toBe(5);
    expect(c.target_to_date).toBeCloseTo((60 / 365) * 365, 0);
  });

  test("gap report lists non-green KSBs with reasons, red first", async () => {
    const r = await call("GET", "/reports/gaps");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ total: 5, red: 1, yellow: 4, green: 0 });
    expect(r.json.items[0]).toMatchObject({ code: "S2", light: "red", reasons: ["Untouched: no entries or evidence"] });
    expect(r.json.items[1].reasons).toContain("No evidence files yet");
  });

  test("coverage endpoint responds", async () => {
    expect((await call("GET", "/reports/coverage")).status).toBe(200);
    updateSettings(getDb(), { gateway_date: null, target_hours: null, start_date: null });
  });
});

describe("backup + restore", () => {
  let zip: Uint8Array;

  test("backup zips the DB and uploads", async () => {
    const form = new FormData();
    form.set("file", new File(["hello evidence"], "notes.txt", { type: "text/plain" }));
    form.set("quality", "1");
    form.set("ksb", "S2");
    expect((await call("POST", "/evidence", form)).status).toBe(201);

    const r = await call("GET", "/export/backup");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/zip");
    expect(r.headers.get("content-disposition")).toContain("ksb-tracker-backup-");
    zip = r.buf;
    const { unzipSync } = await import("fflate");
    const names = Object.keys(unzipSync(zip));
    expect(names).toContain("app.db");
    expect(names.some((n) => n.startsWith("uploads/") && n.endsWith("notes.txt"))).toBe(true);
  });

  test("restore rejects junk", async () => {
    const form = new FormData();
    form.set("file", new File(["not a zip"], "x.zip"));
    const r = await call("POST", "/export/restore", form);
    expect(r.status).toBe(400);
  });

  test("restore replaces data and keeps the previous state", async () => {
    // Change something after the backup; restore should undo it.
    await call("POST", "/entries", { date: "2026-11-01", start_time: "09:00", end_time: "10:00", text: "after backup" });
    const before = (await call("GET", "/entries")).json.length;

    const form = new FormData();
    form.set("file", new File([zip as Uint8Array<ArrayBuffer>], "backup.zip", { type: "application/zip" }));
    const r = await call("POST", "/export/restore", form);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ entries: before - 1, files: 1, missing_files: 0 });
    expect((await call("GET", "/entries")).json.length).toBe(before - 1);

    const ev = (await call("GET", "/ksbs/S2")).json.evidence;
    expect(ev).toHaveLength(1);
    const file = await app.handle(new Request(`http://localhost${ev[0].url}`, { headers: { cookie: auth } }));
    expect(await file.text()).toBe("hello evidence");
    expect(existsSync(join(dataDir, "uploads.pre-restore"))).toBe(true);
  });
});
