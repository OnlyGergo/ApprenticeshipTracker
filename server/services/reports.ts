// Coverage-over-time series and the EPA-gateway gap report.
import type { Database } from "bun:sqlite";
import { summariseOtj, type OtjEntry } from "./chaining";
import { getSettings } from "./settings";
import { daysBetween, GREEN_MIN_TOUCHES, ksbStats, londonToday, STRONG_MAX, type KsbStats } from "./stats";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface CoveragePoint {
  date: string;
  hours: number | null; // cumulative OTJ hours, null for future points
  ksbs: number | null; // KSBs touched so far (entry or evidence), null for future points
  target_hours: number | null; // straight line from 0 at start to target at gateway
}

/**
 * Weekly points from the start date (setting, else first entry) to the gateway
 * date (if later than today) or today. Hours are chain-aware via summariseOtj.
 */
export function coverage(db: Database, today = londonToday()) {
  const settings = getSettings(db);
  const entries = db
    .query<OtjEntry, []>("SELECT id, date, start_time, end_time, text, chain_root_id, chain_index FROM entries")
    .all();
  const chains = summariseOtj(entries);

  // First date each KSB was touched by an entry or a file.
  const firstTouch = db
    .query<{ d: string }, []>(
      `SELECT MIN(d) AS d FROM (
         SELECT ek.ksb_id, e.date AS d FROM entry_ksbs ek JOIN entries e ON e.id = ek.entry_id
         UNION ALL
         SELECT ksb_id, substr(uploaded_at, 1, 10) FROM evidence_files WHERE ksb_id IS NOT NULL
       ) GROUP BY ksb_id`,
    )
    .all()
    .map((r) => r.d)
    .sort();
  const ksbTotal = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM ksbs").get()!.n;

  const firstEntry = chains.reduce<string | null>((m, c) => (m === null || c.date < m ? c.date : m), null);
  const candidates = [settings.start_date, firstEntry, firstTouch[0] ?? null].filter((d): d is string => !!d);
  const start = candidates.sort()[0] ?? today;
  const end = settings.gateway_date && settings.gateway_date > today ? settings.gateway_date : today;

  // Target runs from the configured start (not the first entry) to the gateway.
  const targetStart = settings.start_date ?? start;
  const target = (d: string): number | null => {
    if (!settings.target_hours || !settings.gateway_date || settings.gateway_date <= targetStart) return null;
    const span = daysBetween(targetStart, settings.gateway_date);
    const t = Math.min(Math.max(daysBetween(targetStart, d) / span, 0), 1);
    return Math.round(t * settings.target_hours * 10) / 10;
  };

  const dates: string[] = [];
  for (let d = start; d < end; d = addDays(d, 7)) dates.push(d);
  dates.push(end);
  if (end !== today && !dates.includes(today) && today > start) {
    dates.push(today);
    dates.sort();
  }

  const sortedChains = [...chains].sort((a, b) => a.date.localeCompare(b.date));
  let ci = 0;
  let minutes = 0;
  let ki = 0;
  const points: CoveragePoint[] = dates.map((date) => {
    while (ci < sortedChains.length && sortedChains[ci]!.date <= date) minutes += sortedChains[ci++]!.minutes;
    while (ki < firstTouch.length && firstTouch[ki]! <= date) ki++;
    const past = date <= today;
    return {
      date,
      hours: past ? Math.round((minutes / 60) * 10) / 10 : null,
      ksbs: past ? ki : null,
      target_hours: target(date),
    };
  });

  return {
    points,
    ksb_total: ksbTotal,
    total_hours: Math.round((chains.reduce((s, c) => s + c.minutes, 0) / 60) * 10) / 10,
    target_hours: settings.target_hours,
    target_to_date: target(today),
    start_date: settings.start_date,
    gateway_date: settings.gateway_date,
  };
}

/** Why a KSB isn't green yet, plus nudges that apply to any KSB. */
export function gapReasons(s: KsbStats): string[] {
  if (s.light === "red") return ["Untouched: no entries or evidence"];
  const reasons: string[] = [];
  const strong = s.evidence_by_quality.slice(0, STRONG_MAX).reduce((a, b) => a + b, 0);
  if (strong === 0) {
    reasons.push(
      s.evidence_count === 0 ? "No evidence files yet" : `No strong evidence (quality 1-${STRONG_MAX}), only weaker files`,
    );
  } else if (s.entry_count + s.evidence_count < GREEN_MIN_TOUCHES) {
    reasons.push("Only one piece of evidence; add an entry or another file");
  }
  if (!s.has_best_evidence) reasons.push("No best-evidence pick");
  return reasons;
}

export function gapReport(db: Database, today = londonToday()) {
  const stats = ksbStats(db);
  const items = stats
    .filter((s) => s.light !== "green")
    .sort((a, b) => (a.light === b.light ? 0 : a.light === "red" ? -1 : 1))
    .map((s) => ({ ...s, reasons: gapReasons(s) }));
  const { gateway_date } = getSettings(db);
  const count = (l: KsbStats["light"]) => stats.filter((s) => s.light === l).length;
  return {
    today,
    gateway_date,
    days_to_gateway: gateway_date ? daysBetween(today, gateway_date) : null,
    total: stats.length,
    red: count("red"),
    yellow: count("yellow"),
    green: count("green"),
    items,
  };
}
