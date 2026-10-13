import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PASS = "test-pass";
process.env.BASIC_AUTH_USER = "tester";
process.env.BASIC_AUTH_PASS_HASH = await Bun.password.hash(PASS);
const dataDir = mkdtempSync(join(tmpdir(), "ksb-api-"));
process.env.DATA_DIR = dataDir;

const { app } = await import("../server/index");
const { openDb, setDb } = await import("../server/db/client");
const { migrate } = await import("../server/db/migrate");
const { seedKsbs, validateSeed } = await import("../server/db/seed-ksbs");

const auth = `Basic ${Buffer.from(`tester:${PASS}`).toString("base64")}`;

async function call(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { authorization: auth } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res = await app.handle(new Request(`http://localhost/api${path}`, init));
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

const TEXT = "Built the payment reconciliation script and wrote unit tests for the parser module";

beforeAll(async () => {
  const db = openDb(":memory:");
  await migrate(db);
  seedKsbs(db, validateSeed([{ code: "K1", title: "One" }, { code: "S2", title: "Two" }, { code: "B3", title: "Three" }]));
  setDb(db);
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("entries", () => {
  let root: number;
  let member: number;
  let other: number;

  test("create with KSBs + STAR", async () => {
    const r = await call("POST", "/entries", {
      date: "2026-10-13",
      start_time: "09:00",
      end_time: "10:30",
      text: TEXT,
      ksbs: [{ code: "k1", explanation: "Wrote code" }, { code: "S2" }],
      star: { action: true },
    });
    expect(r.status).toBe(201);
    root = r.json.id;
    expect(r.json.minutes).toBe(90);
    expect(r.json.chain_index).toBe(0);
    expect(r.json.ksbs.map((k: any) => k.code)).toEqual(["K1", "S2"]);
    expect(r.json.star).toEqual({ situation: false, task: false, action: true, result: false });
  });

  test("near-duplicate on the same day chains to the root", async () => {
    const r = await call("POST", "/entries", { date: "2026-10-13", start_time: "13:00", end_time: "14:00", text: `${TEXT}.` });
    member = r.json.id;
    expect(r.json.chain_root_id).toBe(root);
    expect(r.json.chain_index).toBe(1);
    expect(r.json.chain_minutes).toBe(150);
  });

  test("same text on another day doesn't chain", async () => {
    const r = await call("POST", "/entries", { date: "2026-10-14", start_time: "09:00", end_time: "09:30", text: TEXT });
    other = r.json.id;
    expect(r.json.chain_root_id).toBeNull();
  });

  test("validation: unknown KSB, bad times, bad date", async () => {
    const base = { date: "2026-10-13", start_time: "09:00", end_time: "10:00", text: "x" };
    const unknown = await call("POST", "/entries", { ...base, ksbs: [{ code: "K99" }] });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toContain("K99");
    expect((await call("POST", "/entries", { ...base, end_time: "08:00" })).status).toBe(400);
    expect((await call("POST", "/entries", { ...base, date: "13/10/2026" })).status).toBe(422);
    expect((await call("GET", "/entries/9999")).status).toBe(404);
  });

  test("OTJ summary sums the chain once", async () => {
    const r = await call("GET", "/entries/otj?from=2026-10-13&to=2026-10-13");
    expect(r.json.chains).toHaveLength(1);
    expect(r.json.total_minutes).toBe(150);
    expect(r.json.chains[0].text).toBe(TEXT);
  });

  test("patch: ksbs replaced, best flag kept, star merged", async () => {
    await call("PUT", `/entries/${root}/ksbs/K1/best`, { best_evidence: true });
    const r = await call("PATCH", `/entries/${root}`, { ksbs: [{ code: "K1", explanation: "Edited" }, { code: "B3" }], star: { result: true } });
    expect(r.status).toBe(200);
    expect(r.json.ksbs).toMatchObject([{ code: "K1", explanation: "Edited", best_evidence: true }, { code: "B3" }]);
    expect(r.json.star).toMatchObject({ action: true, result: true });
  });

  test("text edit on a root with members keeps the chain", async () => {
    const r = await call("PATCH", `/entries/${root}`, { text: `${TEXT} today` });
    expect(r.json.chain_root_id).toBeNull();
    expect(r.json.chain.map((m: any) => m.id)).toEqual([root, member]);
  });

  test("moving a root to another day promotes its member and re-chains", async () => {
    const r = await call("PATCH", `/entries/${root}`, { date: "2026-10-14", text: TEXT });
    expect(r.json.chain_root_id).toBe(other);
    const m = await call("GET", `/entries/${member}`);
    expect(m.json.chain_root_id).toBeNull();
    expect(m.json.chain_index).toBe(0);
  });

  test("deleting a root promotes the next member", async () => {
    await call("DELETE", `/entries/${other}`);
    const r = await call("GET", `/entries/${root}`);
    expect(r.json.chain_root_id).toBeNull();
    expect(r.json.chain_index).toBe(0);
  });

  test("stale + list", async () => {
    const stale = await call("GET", "/entries/stale");
    expect(stale.json.last_entry_date).toBe("2026-10-14");
    const list = await call("GET", "/entries");
    expect(list.json.map((e: any) => e.date)).toEqual(["2026-10-14", "2026-10-13"]);
  });
});

describe("evidence + ksbs + search", () => {
  let entryId: number;
  let fileId: number;

  test("upload against an entry and a KSB", async () => {
    entryId = (await call("GET", "/entries")).json[0].id;
    const form = new FormData();
    form.set("file", new File(["hello"], "../../evil name.txt", { type: "text/plain" }));
    form.set("quality", "1");
    form.set("entry_id", String(entryId));
    form.set("ksb", "k1");
    const r = await call("POST", "/evidence", form);
    expect(r.status).toBe(201);
    fileId = r.json.id;
    expect(r.json).toMatchObject({ ksb_code: "K1", original_name: "evil name.txt", quality: 1, size: 5, best_evidence: false });

    const file = await call("GET", `/evidence/${fileId}/file`);
    expect(file.text).toBe("hello");
    expect(file.headers.get("content-disposition")).toStartWith("inline");
  });

  test("upload needs a target and a valid quality", async () => {
    const form = new FormData();
    form.set("file", new File(["x"], "a.txt"));
    form.set("quality", "3");
    expect((await call("POST", "/evidence", form)).status).toBe(400);
    form.set("ksb", "K1");
    form.set("quality", "7");
    expect((await call("POST", "/evidence", form)).status).toBe(422);
  });

  test("patch quality / best", async () => {
    const r = await call("PATCH", `/evidence/${fileId}`, { quality: 2, best_evidence: true });
    expect(r.json).toMatchObject({ quality: 2, best_evidence: true });
  });

  test("ksb stats + detail", async () => {
    const stats = await call("GET", "/ksbs/stats");
    const k1 = stats.json.find((s: any) => s.code === "K1");
    expect(k1).toMatchObject({ light: "green", evidence_count: 1, has_best_evidence: true });
    const detail = await call("GET", "/ksbs/k1");
    expect(detail.json.entries.map((e: any) => e.id)).toContain(entryId);
    expect(detail.json.evidence).toHaveLength(1);
    expect((await call("GET", "/ksbs/K42")).status).toBe(404);
  });

  test("search by text, KSB, date and quality", async () => {
    expect((await call("GET", "/search?q=reconciliation")).json.entries.length).toBeGreaterThan(0);
    expect((await call("GET", "/search?q=100%25")).json.entries).toHaveLength(0);
    const byKsb = await call("GET", "/search?ksb=B3");
    expect(byKsb.json.entries.every((e: any) => e.ksbs.includes("B3"))).toBe(true);
    const q = await call("GET", "/search?quality_max=2");
    expect(q.json.entries.map((e: any) => e.id)).toEqual([entryId]);
    expect(q.json.evidence.map((f: any) => f.id)).toEqual([fileId]);
    expect((await call("GET", "/search?from=2026-11-01")).json.entries).toHaveLength(0);
  });

  test("deleting evidence removes the file from disk", async () => {
    const { json } = await call("GET", `/evidence/${fileId}`);
    expect(json.url).toBe(`/api/evidence/${fileId}/file`);
    const dir = join(dataDir, "uploads");
    expect(existsSync(dir)).toBe(true);
    expect((await call("DELETE", `/evidence/${fileId}`)).status).toBe(204);
    expect((await call("GET", `/evidence/${fileId}`)).status).toBe(404);
    expect(Array.from(new Bun.Glob("**/*").scanSync(dir))).toHaveLength(0);
  });
});
