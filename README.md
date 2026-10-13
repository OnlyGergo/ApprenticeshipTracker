# KSB Tracker

A personal, local-only tool for logging DTS apprenticeship off-the-job (OTJ) entries and tracking evidence against KSBs. Bun + Elysia + SQLite on the back end, React Router v7 (SPA mode) + Tailwind on the front end.

## Setup

```sh
bun install
cp .env.example .env
bun run hash-password 'your-password'   # paste the printed line into .env
bun run seed                            # creates data/app.db and loads server/db/ksbs.json
```

> Bun expands `$` in `.env`, so the hash needs every `$` written as `\$`. The `hash-password` script does this for you. If startup says the hash "looks mangled", that's why.

### KSB list

`server/db/ksbs.json` holds the KSBs: `[{ "code": "K1", "title": "...", "category": "knowledge" }]`. `category` is optional and inferred from the K/S/B prefix. The seed upserts by code, so you can edit the file and run `bun run seed` again without losing links. You can also pass another file: `bun run seed path/to/ksbs.json`.

## Running

| Command | What it does |
|---|---|
| `bun run dev` | API server with watch (port `PORT`, default 3000) |
| `bun run dev:web` | Vite dev server on :5173, proxies `/api` to the API server |
| `bun run build` | Builds the frontend to `build/client` |
| `bun run start` | Production: one server on `PORT` for the API and the built frontend |
| `bun test` | Runs the tests |
| `bun run typecheck` | Generates route types and runs `tsc` |
| `bun run migrate` | Applies pending DB migrations (also done on server start) |

Everything the server serves is behind HTTP Basic Auth. In dev, only `/api` (proxied) is gated; the Vite-served pages are not.

## Data

`DATA_DIR` (default `./data`, gitignored) holds `app.db` (SQLite, WAL mode) and `uploads/`. To back up, copy that folder; zip backup/restore is coming in stage 5.
