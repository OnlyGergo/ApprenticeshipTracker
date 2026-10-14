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

Everything except the login page and static files needs a signed-in session. Sign in at `/login` with `BASIC_AUTH_USER` and the password whose hash is in `BASIC_AUTH_PASS_HASH` (`bun run hash-password`). The session is an HttpOnly cookie (30 days) held in server memory, so restarting the server means signing in again. In dev, only `/api` (proxied) is gated; the Vite-served pages are not, but the root loader sends you to `/login` when there's no session.

## Data

`DATA_DIR` (default `./data`, gitignored) holds `app.db` (SQLite, WAL mode) and `uploads/`. To back up, use **Settings → Download backup**: one zip with a consistent DB snapshot and every upload. **Restore** replaces everything and keeps the previous state once as `app.db.pre-restore` and `uploads.pre-restore` in `DATA_DIR`.

## Importing old logs

**Import** takes a CSV (one entry per row) or pasted text. In a CSV, the log text cell holds the description, then one line per KSB or KSB group:

```
I did a thing, it went well, I developed the skills:
K1, B1 - I tried hard
S1 - I need to improve how I did X but I achieved this by doing yz
```

Date, start, end, duration and text columns are guessed from the headers and can be re-mapped in the preview. Dates are read UK-style (`13/10/2026`); with only a duration column, entries start at 09:00. Rows with errors (unknown KSB codes, no date/time) aren't imported until fixed, and rows already imported are flagged as duplicates and unticked. The import runs in one transaction, earliest first, so same-day chaining matches entering them by hand.

## Coverage and gaps

Set the apprenticeship start date, EPA gateway date and OTJ target in **Settings**. **Coverage** plots cumulative OTJ hours against a straight target line (start → gateway) and KSBs touched against the total. **Gaps** lists every red/yellow KSB with the reason it isn't green, and can be copied as text.
