import { describe, expect, test, beforeAll } from "bun:test";

// Configure auth before the app (and its env) is imported.
const PASS = "test-pass";
process.env.BASIC_AUTH_USER = "tester";
process.env.BASIC_AUTH_PASS_HASH = await Bun.password.hash(PASS);

const { app } = await import("../server/index");
const { openDb } = await import("../server/db/client");
const { migrate } = await import("../server/db/migrate");
const { seedKsbs, sortOrder, validateSeed } = await import("../server/db/seed-ksbs");

const get = (path: string, cookie?: string) =>
  app.handle(new Request(`http://localhost${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} }));
const login = (password: string) =>
  app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "tester", password }),
    }),
  );

describe("auth gate", () => {
  test("pages without a session redirect to /login, keeping the destination", async () => {
    const res = await get("/entries?q=x");
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!, "http://localhost").pathname).toBe("/login");
    expect(res.headers.get("location")).toContain(encodeURIComponent("/entries?q=x"));
  });

  test("API calls without a session are 401 JSON", async () => {
    const res = await get("/api/entries/stale");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
  });

  test("login page, health check and auth endpoints are public", async () => {
    expect((await get("/login")).status).not.toBe(302);
    expect((await get("/api/health")).status).toBe(200);
    expect((await get("/api/auth/me")).status).toBe(401);
  });

  test("wrong password is rejected and sets no cookie", async () => {
    const res = await login("nope");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Wrong username or password" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("correct password sets an HttpOnly session cookie that reaches the API", async () => {
    const res = await login(PASS);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    const cookie = setCookie.split(";")[0];
    expect((await get("/api/auth/me", cookie)).status).toBe(200);
    expect((await get("/api/health", cookie)).status).toBe(200);
    expect((await get("/api/entries/stale", cookie)).status).not.toBe(401);
  });

  test("logout ends the session server-side", async () => {
    const cookie = (await login(PASS)).headers.get("set-cookie")!.split(";")[0]!;
    await app.handle(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { cookie } }));
    expect((await get("/api/entries/stale", cookie)).status).toBe(401);
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
