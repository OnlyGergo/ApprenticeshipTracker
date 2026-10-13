// Entry + evidence queries with filters. GET /entries is a filterless search.
import type { Database } from "bun:sqlite";
import { durationMinutes } from "./chaining";
import { EVIDENCE_SELECT, toEvidence, type EvidenceRow } from "./evidence";
import { starFromRow, type StarRow } from "./star";
import type { EntryFiltersT, EntrySummaryT, EvidenceFileT } from "../models";

type Params = Record<string, string | number | null>;

export interface EntryRow extends StarRow {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  text: string;
  chain_root_id: number | null;
  chain_index: number;
}

/** LIKE pattern for a substring match, with wildcards in the input escaped. */
export const likePattern = (q: string) => `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function toEntrySummary(r: EntryRow & { ksb_codes: string | null; evidence_count: number }): EntrySummaryT {
  return {
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    minutes: durationMinutes(r.start_time, r.end_time),
    text: r.text,
    chain_root_id: r.chain_root_id,
    chain_index: r.chain_index,
    star: starFromRow(r),
    ksbs: r.ksb_codes ? r.ksb_codes.split(",") : [],
    evidence_count: r.evidence_count,
  };
}

/** Columns for EntrySummary; alias `e` = entries. */
export const ENTRY_SUMMARY_SELECT = `
  SELECT e.id, e.date, e.start_time, e.end_time, e.text, e.chain_root_id, e.chain_index,
         e.star_situation, e.star_task, e.star_action, e.star_result,
         (SELECT group_concat(code, ',') FROM
            (SELECT k.code FROM entry_ksbs x JOIN ksbs k ON k.id = x.ksb_id WHERE x.entry_id = e.id
             ORDER BY k.sort_order, k.code)) AS ksb_codes,
         (SELECT COUNT(*) FROM evidence_files f WHERE f.entry_id = e.id) AS evidence_count
  FROM entries e`;

const qualityRange = (f: EntryFiltersT) =>
  f.quality_min !== undefined || f.quality_max !== undefined ? { qmin: f.quality_min ?? 1, qmax: f.quality_max ?? 5 } : null;

/**
 * Entries, newest first. `q` matches entry text or a KSB explanation; `ksb`
 * keeps entries tagged with that code; quality keeps entries with an attached
 * file in range; `best` keeps entries flagged best (for `ksb` if given) or
 * with a best file.
 */
export function searchEntries(db: Database, f: EntryFiltersT = {}): EntrySummaryT[] {
  const where: string[] = [];
  const p: Params = { limit: f.limit ?? -1, offset: f.offset ?? 0 };
  if (f.q?.trim()) {
    p.q = likePattern(f.q);
    where.push(`(e.text LIKE $q ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM entry_ksbs x WHERE x.entry_id = e.id AND x.explanation LIKE $q ESCAPE '\\'))`);
  }
  if (f.ksb) {
    p.ksb = f.ksb.toUpperCase();
    where.push(`EXISTS (SELECT 1 FROM entry_ksbs x JOIN ksbs k ON k.id = x.ksb_id WHERE x.entry_id = e.id AND k.code = $ksb)`);
  }
  if (f.from) (p.from = f.from), where.push("e.date >= $from");
  if (f.to) (p.to = f.to), where.push("e.date <= $to");
  const q = qualityRange(f);
  if (q) {
    Object.assign(p, q);
    where.push("EXISTS (SELECT 1 FROM evidence_files f WHERE f.entry_id = e.id AND f.quality BETWEEN $qmin AND $qmax)");
  }
  if (f.best) {
    const forKsb = f.ksb ? "AND x.ksb_id = (SELECT id FROM ksbs WHERE code = $ksb)" : "";
    where.push(`(EXISTS (SELECT 1 FROM entry_ksbs x WHERE x.entry_id = e.id AND x.best_evidence = 1 ${forKsb})
      OR EXISTS (SELECT 1 FROM evidence_files f WHERE f.entry_id = e.id AND f.best_evidence = 1))`);
  }
  const sql = `${ENTRY_SUMMARY_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY e.date DESC, e.start_time DESC, e.id DESC LIMIT $limit OFFSET $offset`;
  return db.query<Parameters<typeof toEntrySummary>[0], Params>(sql).all(p).map(toEntrySummary);
}

/**
 * Evidence files, newest first. `ksb` matches files attached to the KSB or to
 * an entry tagged with it. Dates use the entry's date, else the upload date.
 */
export function searchEvidence(db: Database, f: EntryFiltersT = {}): EvidenceFileT[] {
  const where: string[] = [];
  const p: Params = { limit: f.limit ?? -1, offset: f.offset ?? 0 };
  if (f.q?.trim()) (p.q = likePattern(f.q)), where.push(`f.original_name LIKE $q ESCAPE '\\'`);
  if (f.ksb) {
    p.ksb = f.ksb.toUpperCase();
    where.push(`(k.code = $ksb OR EXISTS (SELECT 1 FROM entry_ksbs x JOIN ksbs k2 ON k2.id = x.ksb_id
      WHERE x.entry_id = f.entry_id AND k2.code = $ksb))`);
  }
  const day = "COALESCE((SELECT date FROM entries WHERE id = f.entry_id), substr(f.uploaded_at, 1, 10))";
  if (f.from) (p.from = f.from), where.push(`${day} >= $from`);
  if (f.to) (p.to = f.to), where.push(`${day} <= $to`);
  const q = qualityRange(f);
  if (q) Object.assign(p, q), where.push("f.quality BETWEEN $qmin AND $qmax");
  if (f.best) where.push("f.best_evidence = 1");
  const sql = `${EVIDENCE_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY f.uploaded_at DESC, f.id DESC LIMIT $limit OFFSET $offset`;
  return db.query<EvidenceRow, Params>(sql).all(p).map(toEvidence);
}
