import { Elysia } from "elysia";
import { join, normalize } from "node:path";
import { isAuthorised, unauthorised } from "./auth";
import { migrate } from "./db/migrate";
import { env } from "./env";
import { HttpError } from "./lib/errors";
import { entryRoutes } from "./routes/entries";
import { evidenceRoutes } from "./routes/evidence";
import { ksbRoutes } from "./routes/ksbs";
import { searchRoutes } from "./routes/search";

const CLIENT_DIR = join(import.meta.dir, "..", "build", "client");

const api = new Elysia({ prefix: "/api" })
  .get("/health", () => ({ ok: true as const }))
  .use(entryRoutes)
  .use(ksbRoutes)
  .use(evidenceRoutes)
  .use(searchRoutes);

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
  app.listen(env.port);
  console.log(`KSB Tracker on http://localhost:${env.port}`);
}
