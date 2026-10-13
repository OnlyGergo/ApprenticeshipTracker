import { Elysia } from "elysia";
import { join, normalize } from "node:path";
import { isAuthorised, unauthorised } from "./auth";
import { migrate } from "./db/migrate";
import { env } from "./env";
import { HttpError } from "./lib/errors";
import { entryRoutes } from "./routes/entries";
import { evidenceRoutes } from "./routes/evidence";
import { exportRoutes } from "./routes/export";
import { importRoutes } from "./routes/import";
import { ksbRoutes } from "./routes/ksbs";
import { reportRoutes } from "./routes/reports";
import { searchRoutes } from "./routes/search";
import { settingsRoutes } from "./routes/settings";

const CLIENT_DIR = join(import.meta.dir, "..", "build", "client");

const api = new Elysia({ prefix: "/api" })
  .get("/health", () => ({ ok: true as const }))
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
  // Everything (API and static) sits behind Basic Auth.
  .onRequest(async ({ request }) => {
    if (!(await isAuthorised(request.headers.get("authorization")))) return unauthorised();
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
