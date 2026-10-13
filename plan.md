# KSB Tracker — Tech Spec

Personal tool for logging DTS apprenticeship OTJ (off-the-job) entries and tracking evidence against KSBs, supplementing  OneAdvanced.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Database | SQLite via `bun:sqlite` (single file, WAL mode) |
| API | `Bun.serve` |
| Frontend | Vite + React + Tailwind CSS |
| Routing | React Router v7 (framework mode) — file-based routing + generated types |
| Auth | Basic Auth, single user, credentials in `.env`, hashed with `Bun.password` |
| File uploads | Handled natively via `request.formData()` in `Bun.serve` |
| Zip/export | `fflate` |

No encryption, no cloud sync, no multi-tenancy — deliberately dropped as unnecessary complexity for a single-user local tool.

## Data model

```
entries
  id, date, start_time, end_time, text,
  chain_root_id  (nullable FK -> entries.id)
  chain_index    (0 = root, 1+ = chained duplicate)

ksbs
  id, code, title, category

entry_ksbs        -- join table, one entry can map to multiple KSBs
  entry_id, ksb_id

evidence_files
  id, entry_id (or ksb_id), path, mime, size,
  quality        -- integer 1-5, 1 = best
  uploaded_at
```

## Core features

**1. Structured entry form**
Input via form: a description field, plus one or more KSB lines — each line explains how one KSB (or a comma-separated group of related KSBs) was hit. A group on one line means those KSBs share the same explanation/evidence.

**2. Fixed-format log parsing**
Existing logs follow a consistent shape — description line, then per-KSB (or per-KSB-group) explanation lines — parsed with a straightforward regex/line-splitter, no NLP needed. Parser needs to split comma-separated KSB groups per line into individual `entry_ksbs` rows sharing the same explanation text.

**3. Same-day chaining / dedup**
- Compare entries only within the same day (small N, cheap).
- Similarity: Jaccard over word shingles (lowercase, strip stopwords, bigrams).
- Threshold: ≥80% similarity same day = related.
- First entry = `chain_index 0` (root); subsequent related entries get `chain_index 1+` with `chain_root_id` pointing to root.
- OTJ summary sums duration across the full chain but pulls display text only from the root entry — no double-counting.

**4. KSB coverage dashboard**
Per-KSB stats: entry count, evidence count broken down by quality score (1-5), last-touched date. Traffic-light view: grey/red = untouched, yellow = only low-quality (4-5) evidence, green = solid mix including strong (1-2) evidence.

**5. File uploads**
Uploaded evidence stored on disk under `/data/uploads/{ksb_id}/`, referenced by path in `evidence_files`, tagged with a quality rating.

**6. Export/backup**
Zip the SQLite file + uploads folder together via `fflate` — full backup/restore in one file.

**7. Coverage-over-time chart**
Hours logged / KSBs evidenced plotted against a target line for the apprenticeship duration.

**8. Gap report / portfolio-readiness view**
One-click list of KSBs still red/yellow, useful ahead of the EPA gateway.

**9. STAR tagging**
Lightweight per-entry flag for whether it captures Situation/Task/Action/Result.

**10. Search/filter**
Across entries by KSB, date range, and quality score.

**11. "Best evidence" flag**
Mark specific entries as top pick per KSB, independent of the quality score — speeds up professional-discussion prep.

**12. Stale-entry reminder**
Simple banner/flag showing days since the last log entry.

Here is an idea of the file path. this isn't set in stone

Could you also use subagents to implement things efficiently like so: sonnet as developer, haiku as very capable intern. you, opus, are the architect and manager
Create and maintain a Claude.md, and a readme.md, in above example, haiku can do that.

ksb-tracker/
├── package.json
├── bunfig.toml
├── tsconfig.json
├── .env                     # BASIC_AUTH_USER, BASIC_AUTH_PASS_HASH, DATA_DIR
├── vite.config.ts
├── react-router.config.ts   # framework mode config
│
├── server/                  # Bun.serve API
│   ├── index.ts             # Bun.serve entry, routing table, static fallback
│   ├── auth.ts              # Basic Auth check (Bun.password.verify)
│   ├── db/
│   │   ├── client.ts        # bun:sqlite connection, WAL mode, pragmas
│   │   ├── schema.sql       # entries, ksbs, entry_ksbs, evidence_files
│   │   ├── migrate.ts       # apply schema / versioned migrations
│   │   └── seed-ksbs.ts     # load DTS KSB list
│   ├── routes/
│   │   ├── entries.ts       # CRUD, chain_root_id handling
│   │   ├── ksbs.ts          # list, per-KSB stats
│   │   ├── evidence.ts      # multipart upload, quality (1-5), best-evidence flag
│   │   ├── search.ts        # filter by KSB / date / quality
│   │   ├── reports.ts       # gap report, coverage-over-time, stale-entry check
│   │   └── export.ts        # PDF per KSB, zip backup/restore
│   ├── services/
│   │   ├── parser.ts        # fixed-format log parser (description + KSB lines)
│   │   ├── chaining.ts      # same-day Jaccard shingle similarity (>=0.8)
│   │   ├── stats.ts         # traffic-light status, coverage aggregates
│   │   ├── star.ts          # STAR tag helpers
│   │   └── pdf.ts           # per-KSB PDF rendering
│   ├── storage/
│   │   └── uploads.ts       # write to DATA_DIR/uploads/{ksb_id}/, path + metadata
│   └── lib/
│       ├── text.ts          # normalise, stopword strip, shingles
│       └── zip.ts           # fflate backup bundle
│
├── app/                     # React Router v7 framework mode (file-based routes)
│   ├── root.tsx             # shell, Tailwind import, dark theme
│   ├── routes.ts            # route config (flatRoutes or explicit)
│   ├── routes/
│   │   ├── _index.tsx       # dashboard: traffic-light KSB grid
│   │   ├── entries._index.tsx
│   │   ├── entries.new.tsx  # structured entry form
│   │   ├── entries.$id.tsx  # view/edit, chain display, STAR tag
│   │   ├── ksbs.$code.tsx   # KSB detail: entries, evidence, best-evidence
│   │   ├── coverage.tsx     # coverage-over-time chart
│   │   ├── gaps.tsx         # portfolio-readiness report
│   │   ├── search.tsx       # filter UI
│   │   ├── import.tsx       # paste existing logs -> parse preview
│   │   └── settings.tsx     # backup/restore, target hours, gateway date
│   ├── components/
│   │   ├── ui/              # buttons, inputs, quality slider (1-5)
│   │   ├── KsbCard.tsx
│   │   ├── EntryForm.tsx
│   │   ├── QualitySlider.tsx
│   │   ├── EvidenceUpload.tsx
│   │   ├── CoverageChart.tsx
│   │   └── StaleBanner.tsx
│   ├── lib/
│   │   ├── api.ts           # typed fetch wrapper for server routes
│   │   └── format.ts        # date/time helpers (Europe/London)
│   └── styles/
│       └── app.css          # Tailwind + dark/orange-outline tokens
│
├── data/                    # gitignored, runtime
│   ├── app.db
│   └── uploads/{ksb_id}/
│
└── tests/
    ├── parser.test.ts
    └── chaining.test.ts

Thanks
