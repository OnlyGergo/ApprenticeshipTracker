import { describe, expect, test, beforeAll } from "bun:test";

// Configure auth before the app (and its env) is imported.
const PASS = "test-pass";
process.env.BASIC_AUTH_USER = "tester";
process.env.BASIC_AUTH_PASS_HASH = await Bun.password.hash(PASS);

const { app } = await import("../server/index");
const { openDb } = await import("../server/db/client");
const { migrate } = await import("../server/db/migrate");
const { seedKsbs, sortOrder, validateSeed } = await import("../server/db/seed-ksbs");

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const get = (path: string, auth?: string) =>
  app.handle(new Request(`http://localhost${path}`, auth ? { headers: { authorization: auth } } : {}));

describe("auth gate", () => {
  test("/ without credentials is 401 with a Basic challenge", async () => {
    const res = await get("/");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  test("wrong password is rejected", async () => {
    expect((await get("/api/health", basic("tester", "nope"))).status).toBe(401);
  });

  test("correct credentials reach the API", async () => {
    const res = await get("/api/health", basic("tester", PASS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("db", () => {
  let db: ReturnType<typeof openDb>;
  beforeAll(async () => {
    db = openDb(":memory:");
    await migrate(db);
  });

  test("migrate is idempotent and creates tables", async () => {
    expect(await migrate(db)).toBe(1);
    const tables = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    expect(tables.map((t) => t.name)).toEqual(["entries", "entry_ksbs", "evidence_files", "ksbs", "settings"]);
  });

  test("seed upserts by code and orders K/S/B numerically", () => {
    seedKsbs(db, validateSeed([{ code: "k10", title: "Ten" }, { code: "K2", title: "Two" }, { code: "B1", title: "B" }]));
    seedKsbs(db, validateSeed([{ code: "K2", title: "Two (edited)" }]));
    const rows = db.query<{ code: string; title: string }, []>("SELECT code, title FROM ksbs ORDER BY sort_order").all();
    expect(rows).toEqual([
      { code: "K2", title: "Two (edited)" },
      { code: "K10", title: "Ten" },
      { code: "B1", title: "B" },
    ]);
    expect(sortOrder("S3")).toBe(2003);
  });
});
