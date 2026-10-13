-- v1: initial schema. Dates are ISO 'YYYY-MM-DD', times 'HH:MM' (Europe/London wall clock).

CREATE TABLE ksbs (
  id         INTEGER PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE,            -- e.g. K1, S12, B3
  title      TEXT    NOT NULL,
  category   TEXT    NOT NULL CHECK (category IN ('knowledge', 'skill', 'behaviour')),
  sort_order INTEGER NOT NULL DEFAULT 0          -- numeric order so K2 sorts before K10
);

CREATE TABLE entries (
  id             INTEGER PRIMARY KEY,
  date           TEXT    NOT NULL,
  start_time     TEXT    NOT NULL,
  end_time       TEXT    NOT NULL CHECK (end_time > start_time),
  text           TEXT    NOT NULL,
  chain_root_id  INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  chain_index    INTEGER NOT NULL DEFAULT 0,     -- 0 = root, 1+ = chained duplicate
  star_situation INTEGER NOT NULL DEFAULT 0 CHECK (star_situation IN (0, 1)),
  star_task      INTEGER NOT NULL DEFAULT 0 CHECK (star_task IN (0, 1)),
  star_action    INTEGER NOT NULL DEFAULT 0 CHECK (star_action IN (0, 1)),
  star_result    INTEGER NOT NULL DEFAULT 0 CHECK (star_result IN (0, 1)),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_entries_date ON entries(date);
CREATE INDEX idx_entries_chain_root ON entries(chain_root_id);

CREATE TABLE entry_ksbs (
  entry_id      INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  ksb_id        INTEGER NOT NULL REFERENCES ksbs(id)    ON DELETE CASCADE,
  explanation   TEXT    NOT NULL DEFAULT '',
  best_evidence INTEGER NOT NULL DEFAULT 0 CHECK (best_evidence IN (0, 1)),  -- entry is a top pick for this KSB
  PRIMARY KEY (entry_id, ksb_id)
);
CREATE INDEX idx_entry_ksbs_ksb ON entry_ksbs(ksb_id);

CREATE TABLE evidence_files (
  id            INTEGER PRIMARY KEY,
  entry_id      INTEGER REFERENCES entries(id) ON DELETE CASCADE,
  ksb_id        INTEGER REFERENCES ksbs(id)    ON DELETE CASCADE,
  path          TEXT    NOT NULL,                -- relative to DATA_DIR
  original_name TEXT    NOT NULL,
  mime          TEXT    NOT NULL,
  size          INTEGER NOT NULL,
  quality       INTEGER NOT NULL CHECK (quality BETWEEN 1 AND 5),  -- 1 = best
  best_evidence INTEGER NOT NULL DEFAULT 0 CHECK (best_evidence IN (0, 1)),
  uploaded_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (entry_id IS NOT NULL OR ksb_id IS NOT NULL)
);
CREATE INDEX idx_evidence_ksb ON evidence_files(ksb_id);
CREATE INDEX idx_evidence_entry ON evidence_files(entry_id);

-- Key/value app settings: target hours, start date, gateway date, etc.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
