import { Elysia } from "elysia";
import { join, normalize } from "node:path";
import { isAuthenticated } from "./auth";
import { migrate } from "./db/migrate";
import { env } from "./env";
import { HttpError } from "./lib/errors";
import { authRoutes } from "./routes/auth";
import { entryRoutes } from "./routes/entries";
import { evidenceRoutes } from "./routes/evidence";
import { exportRoutes } from "./routes/export";
import { importRoutes } from "./routes/import";
import { ksbRoutes } from "./routes/ksbs";
import { reportRoutes } from "./routes/reports";
import { searchRoutes } from "./routes/search";
import { settingsRoutes } from "./routes/settings";

const CLIENT_DIR = join(import.meta.dir, "..", "build", "client");

/** Reachable without a session: the health check, the auth endpoints, the login page and static files. */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/api/health" || pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/")) return false;
  // Anything with a file extension (JS/CSS bundles, favicon) is static, not app data.
  return /\.[a-z0-9]+$/i.test(pathname);
}

const api = new Elysia({ prefix: "/api" })
  .get("/health", () => ({ ok: true as const }))
  .use(authRoutes)
  .use(entryRoutes)
  .use(ksbRoutes)
  .use(evidenceRoutes)
  .use(searchRoutes)
  .use(reportRoutes)
  .use(settingsRoutes)
  .use(importRoutes)
  .use(exportRoutes);

/** Serve the built SPA; unknown paths fall back to index.html for client-side routing. */
async function serveClient(pathname: string): Promise<Response> {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = Bun.file(join(CLIENT_DIR, safe));
  if (safe !== "/" && (await file.exists())) return new Response(file);
  const index = Bun.file(join(CLIENT_DIR, "index.html"));
  if (await index.exists()) return new Response(index);
  return new Response("Frontend not built. Run `bun run build`, or use `bun run dev:web` in development.", {
    status: 503,
  });
}

export const app = new Elysia()
  // Everything except the login endpoints, the login page and static assets needs a session.
  // API calls get a 401 JSON; page loads are sent to /login.
  .onRequest(({ request }) => {
    const { pathname, search } = new URL(request.url);
    if (isPublicPath(pathname) || isAuthenticated(request.headers.get("cookie"))) return;
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    return Response.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, request.url), 302);
  })
  // Service errors -> JSON { error } with their status. Elysia handles validation (422) itself.
  .onError(({ error }) => {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  })
  .use(api)
  .get("/*", ({ request }) => serveClient(new URL(request.url).pathname));

export type App = typeof app;

if (import.meta.main) {
  env.authUser; // fail fast if auth isn't configured
  env.authPassHash;
  await migrate();
  // Raised from Bun's 128 MB default so a backup with lots of uploads can be restored.
  app.listen({ port: env.port, maxRequestBodySize: 1024 * 1024 * 1024 });
  console.log(`KSB Tracker on http://localhost:${env.port}`);
}
