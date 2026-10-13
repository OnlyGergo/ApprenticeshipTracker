// Per-KSB coverage stats + traffic light, and the stale-entry check.
import type { Database } from "bun:sqlite";

export type Light = "red" | "yellow" | "green";

/** Quality is 1-5, 1 = best. */
export const STRONG_MAX = 2; // 1-2 = strong
export const WEAK_MIN = 4; // 4-5 = weak
/** Green needs strong evidence plus at least this many touches (entries + files) in total. */
export const GREEN_MIN_TOUCHES = 2;

export interface KsbCounts {
  entries: number; // distinct chains, so a chained duplicate doesn't inflate it
  evidence: [number, number, number, number, number]; // files by quality 1..5
}

/**
 * - red:    untouched (no entries, no evidence)
 * - green:  at least one strong (1-2) file AND a solid mix (>= GREEN_MIN_TOUCHES touches)
 * - yellow: anything in between (entries only, only weak/medium files, or a lone strong file)
 */
export function trafficLight({ entries, evidence }: KsbCounts): Light {
  const files = evidence.reduce((a, b) => a + b, 0);
  if (entries === 0 && files === 0) return "red";
  const strong = evidence.slice(0, STRONG_MAX).reduce((a, b) => a + b, 0);
  if (strong > 0 && entries + files >= GREEN_MIN_TOUCHES) return "green";
  return "yellow";
}

export interface KsbStats {
  ksb_id: number;
  code: string;
  title: string;
  category: string;
  entry_count: number;
  evidence_count: number;
  evidence_by_quality: KsbCounts["evidence"];
  has_best_evidence: boolean;
  last_touched: string | null; // ISO date
  light: Light;
}

/**
 * Stats for every KSB (or one, by id). A file counts towards a KSB when it's
 * attached to the KSB directly or to an entry tagged with it; each file once.
 */
export function ksbStats(db: Database, ksbId?: number): KsbStats[] {
  const ksbs = db
    .query<{ id: number; code: string; title: string; category: string }, { id: number | null }>(
      `SELECT id, code, title, category FROM ksbs WHERE $id IS NULL OR id = $id ORDER BY sort_order, code`,
    )
    .all({ id: ksbId ?? null });

  const entryRows = db
    .query<{ ksb_id: number; chains: number; last_date: string | null; best: number }, []>(
      `SELECT ek.ksb_id,
              COUNT(DISTINCT COALESCE(e.chain_root_id, e.id)) AS chains,
              MAX(e.date) AS last_date,
              MAX(ek.best_evidence) AS best
       FROM entry_ksbs ek JOIN entries e ON e.id = ek.entry_id
       GROUP BY ek.ksb_id`,
    )
    .all();

  // Distinct (ksb, file) pairs from both attachment routes.
  const fileRows = db
    .query<{ ksb_id: number; quality: number; n: number; last_upload: string | null; best: number }, []>(
      `WITH links AS (
         SELECT ksb_id, id AS file_id FROM evidence_files WHERE ksb_id IS NOT NULL
         UNION
         SELECT ek.ksb_id, f.id FROM evidence_files f JOIN entry_ksbs ek ON ek.entry_id = f.entry_id
       )
       SELECT l.ksb_id, f.quality, COUNT(*) AS n, MAX(f.uploaded_at) AS last_upload, MAX(f.best_evidence) AS best
       FROM links l JOIN evidence_files f ON f.id = l.file_id
       GROUP BY l.ksb_id, f.quality`,
    )
    .all();

  const entryBy = new Map(entryRows.map((r) => [r.ksb_id, r]));
  const filesBy = new Map<number, typeof fileRows>();
  for (const r of fileRows) (filesBy.get(r.ksb_id) ?? filesBy.set(r.ksb_id, []).get(r.ksb_id)!).push(r);

  return ksbs.map((k) => {
    const e = entryBy.get(k.id);
    const files = filesBy.get(k.id) ?? [];
    const byQ: KsbCounts["evidence"] = [0, 0, 0, 0, 0];
    let lastUpload: string | null = null;
    let bestFile = false;
    for (const f of files) {
      byQ[f.quality - 1] = f.n;
      const d = f.last_upload?.slice(0, 10) ?? null;
      if (d && (!lastUpload || d > lastUpload)) lastUpload = d;
      bestFile ||= f.best === 1;
    }
    const counts: KsbCounts = { entries: e?.chains ?? 0, evidence: byQ };
    const dates = [e?.last_date ?? null, lastUpload].filter((d): d is string => d !== null).sort();
    return {
      ksb_id: k.id,
      code: k.code,
      title: k.title,
      category: k.category,
      entry_count: counts.entries,
      evidence_count: byQ.reduce((a, b) => a + b, 0),
      evidence_by_quality: byQ,
      has_best_evidence: bestFile || e?.best === 1,
      last_touched: dates.at(-1) ?? null,
      light: trafficLight(counts),
    };
  });
}

// ---- stale check ----

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Today's date in Europe/London as YYYY-MM-DD. */
export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export interface StaleInfo {
  last_entry_date: string | null;
  days_since: number | null; // null when there are no entries yet
}

/** Uses MAX(date) of entries, not created_at, so back-filled logs count. */
export function staleness(db: Database, today = londonToday()): StaleInfo {
  const last = db.query<{ d: string | null }, []>("SELECT MAX(date) AS d FROM entries").get()?.d ?? null;
  return { last_entry_date: last, days_since: last ? daysBetween(last, today) : null };
}
