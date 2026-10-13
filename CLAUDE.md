# KSB Tracker

Personal single-user tool for logging DTS apprenticeship OTJ (off-the-job) entries and tracking evidence against KSBs. Replaces manual copy-paste into OneAdvanced. Local-only: no encryption, no cloud sync, no multi-tenancy (deliberately dropped).

## Working rules (read first)

- Work on ONE stage at a time (see Stages). Do not start the next stage unprompted.
- Token budget is tight. Don't re-read files you just wrote, don't explore the whole repo, prefer targeted Read/Grep.
- Hands-on workflow: if a decision is genuinely ambiguous, ask. Otherwise pick the obvious default and note it.
- Finish every stage by (1) running tests/boot check, (2) updating the Status section below, (3) stopping.
- Delegation (only where tasks are truly independent, since each subagent starts cold):
  - Opus: architecture, tricky logic review (chaining, stats thresholds).
  - Sonnet: main implementation.
  - Haiku: boilerplate, README, CLAUDE.md upkeep, simple UI components, seed data.
- PRs aren't needed, but commit with EU format like "feat (frontend): add the thing".
- 
## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| DB | SQLite via `bun:sqlite`, single file, WAL mode |
| API | Elysia on Bun from the start, for an end-to-end typed API (`server/index.ts`); typed client via `@elysiajs/eden` (Treaty) |
| Frontend | Vite + React + Tailwind CSS |
| Routing | React Router v7, framework mode (file-based, generated types) |
| Auth | Basic Auth, single user, creds in `.env`, verified with `Bun.password.verify` |
| Uploads | Elysia multipart body handling (`t.File` validation) |
| Zip/export | `fflate` |

`.env`: `BASIC_AUTH_USER`, `BASIC_AUTH_PASS_HASH`, `DATA_DIR`.

## Data model

```
entries         id, date, start_time, end_time, text,
                chain_root_id (nullable FK -> entries.id),
                chain_index (0 = root, 1+ = chained duplicate)
                + star flags (situation/task/action/result), stale-check uses max(date)
ksbs            id, code, title, category
entry_ksbs      entry_id, ksb_id, explanation   -- one entry -> many KSBs
evidence_files  id, entry_id (or ksb_id), path, mime, size,
                quality (int 1-5, 1 = best), best_evidence (bool), uploaded_at
```

Migrations are versioned in `server/db/migrate.ts`. Schema lives in `server/db/schema.sql`. Seed KSB list in `seed-ksbs.ts`.

## Core logic (the parts that must be right)

**Parser** (`services/parser.ts`): fixed-format log = description line, then per-KSB (or per-KSB-group) explanation lines. A comma-separated KSB group on one line becomes one `entry_ksbs` row per KSB, all sharing the same explanation text. Regex/line-splitter only, no NLP. Must have tests.

**Chaining** (`services/chaining.ts`, `lib/text.ts`):
- Compare only within the same day.
- Similarity = Jaccard over word bigram shingles (lowercase, stopwords stripped).
- Threshold >= 0.80 means related.
- First entry = `chain_index 0` (root); later related entries get `chain_index 1+` and `chain_root_id` -> root.
- OTJ summary sums duration across the whole chain but takes display text from the root only. No double-counting.

**Traffic light** (`services/stats.ts`), per KSB:
- grey/red: untouched (no entries/evidence)
- yellow: only low-quality evidence (quality 4-5)
- green: solid mix including strong evidence (quality 1-2)
- Also: entry count, evidence count by quality 1-5, last-touched date.

**Uploads**: stored at `DATA_DIR/uploads/{ksb_id}/`, path + metadata in `evidence_files`, each tagged with quality.

## Features (build order is in Stages)

1 structured entry form · 2 fixed-format log parsing · 3 same-day chaining · 4 KSB coverage dashboard · 5 file uploads · 6 zip backup/restore · 7 coverage-over-time chart (hours/KSBs vs target line) · 8 gap report (red/yellow KSBs, for EPA gateway) · 9 STAR tagging · 10 search/filter (KSB, date range, quality) · 11 best-evidence flag per KSB · 12 stale-entry banner (days since last entry)

Dropped: per-KSB PDF export (no point). Do not build it or add a PDF dependency.

## Layout

```
server/   index.ts (Elysia app, exports `App` type for Eden) auth.ts | db/{client,schema.sql,migrate,seed-ksbs} |
          routes/{entries,ksbs,evidence,search,reports,export} (each an Elysia plugin) |
          services/{parser,chaining,stats,star} | storage/uploads.ts | lib/{text,zip}
style.css (root) starting-point styles/tokens, imported by app/root.tsx
app/      root.tsx routes.ts | routes/{_index,entries._index,entries.new,entries.$id,
          ksbs.$code,coverage,gaps,search,import,settings}.tsx |
          components/{ui/,KsbCard,EntryForm,QualitySlider,EvidenceUpload,CoverageChart,StaleBanner} |
          lib/{api,format}.ts
data/     gitignored runtime: app.db, uploads/
tests/    parser.test.ts chaining.test.ts
```

Layout is a guide, not fixed. Adjust if there's a good reason and note it in Status.

## Conventions

- TypeScript strict. Bun APIs over Node equivalents where available.
- Dates/times displayed in Europe/London (`app/lib/format.ts`); store ISO strings.
- API returns JSON. Define request/response schemas with Elysia's `t` so types flow to the frontend; `app/lib/api.ts` is the Eden Treaty client built from the server's exported `App` type. No hand-written fetch types. All routes behind Basic Auth.
- Keep route handlers thin; logic goes in `services/`.
- Tests: `bun test`. Parser and chaining need tests before anything depends on them.
- No new dependencies without a reason. Core set: elysia, @elysiajs/eden, react-router, tailwind, vite, fflate.

## Design

Fintech/professional (Revolut-style), dark mode, orange accent.
- Accent is muted and integrated: outlines/borders, not obvious fills, except for "active" state.
- Less blank space than Revolut; density closer to Claude's UI.
- Subtle roundness: ~5px border radius, nothing aggressive.
- `style.css` at the project root is the starting point for styles and tokens. Build on it rather than replacing it; don't create a separate `app/styles/app.css`.

## Stages

Do one per session/usage window. Tick off when done.

- [x] **1 Foundation**: scaffold, tsconfig/bunfig/vite/RR config, `schema.sql`, migrate, `seed-ksbs`, auth, Elysia skeleton (exports `App` type) + static fallback, README. Done when it boots and `/` is auth-gated.
- [ ] **2 Core logic + tests**: `text.ts`, `parser.ts`, `chaining.ts`, `stats.ts`, `star.ts`. Done when tests pass.
- [ ] **3 API routes**: entries (CRUD + chaining), ksbs (+stats), evidence/uploads (quality, best flag), search.
- [ ] **4 Frontend core**: root shell + dark/orange theme, dashboard, entry form, entry view, KSB detail, stale banner.
- [ ] **5 Extras**: coverage chart, gaps, import (paste -> parse preview), settings, then reports API and zip backup/restore (last, most fiddly).

## Status

_Update at the end of every stage: what's done, what's half-done, decisions made, known issues, exact next step._

- Stage: 1 done (2026-10-13). Next: stage 2 (core logic + tests).
- Done: Bun scaffold, tsconfig/bunfig/vite/react-router config, `schema.sql` (v1), `migrate.ts` (PRAGMA user_version, runs on server start), `seed-ksbs.ts` (upsert by code from `server/db/ksbs.json`), Basic Auth gating all requests (`onRequest`), Elysia app exporting `App`, `/api/health`, `/api/ksbs` list, SPA static fallback from `build/client`, Eden client `app/lib/api.ts`, `app/lib/format.ts`, root shell + placeholder dashboard, `style.css` tokens, README, `tests/boot.test.ts` (auth gate, migrate, seed).
- Decisions:
  - React Router v7 (7.18) pinned per this file, even though v8 is out. TypeScript 6 (RR7 peer range). `isbot` was auto-added by RR.
  - SPA mode (`ssr: false`): Elysia serves `build/client` and falls back to `index.html`. Dev: `bun run dev` (API) + `bun run dev:web` (Vite, proxies `/api`). Vite pages aren't auth-gated in dev, only in prod.
  - Extra columns beyond the data model: `ksbs.sort_order` (K2 before K10), `entry_ksbs.best_evidence` (feature 11 "top pick entry per KSB"), `evidence_files.original_name`, `entries.created_at/updated_at`, a `settings` key/value table (target hours, gateway date). `evidence_files.path` is relative to DATA_DIR. CHECK `end_time > start_time` (no overnight entries).
  - Auth caches already-verified headers in memory so argon2 doesn't run on every asset request.
  - `server/env.ts` added for typed env access. `scripts/hash-password.ts` prints a `\$`-escaped `.env` line (Bun's `.env` expands `$`).
- Known issues: `server/db/ksbs.json` has only 3 PLACEHOLDER KSBs. The official ST0119 list couldn't be fetched (IfATE site not reachable from the build container) and needs filling in. RR prints a harmless "`envFile` is deprecated" warning.
