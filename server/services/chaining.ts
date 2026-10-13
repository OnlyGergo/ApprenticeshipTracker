// Same-day chaining: a later entry that's near-identical to an earlier one on the
// same day becomes a chained duplicate of that day's root, so OTJ hours add up
// across the chain while the text is shown once.
import type { Database } from "bun:sqlite";
import { similarity } from "../lib/text";

export const CHAIN_THRESHOLD = 0.8;

export interface ChainCandidate {
  id: number;
  text: string;
  chain_root_id: number | null;
  chain_index: number;
}

export interface ChainAssignment {
  chain_root_id: number | null;
  chain_index: number;
  similarity: number; // best score found (0 when nothing to compare)
}

/** Root id of the chain an entry belongs to (itself if it's a root or orphaned). */
const rootOf = (e: Pick<ChainCandidate, "id" | "chain_root_id">) => e.chain_root_id ?? e.id;

/**
 * Decide where a new entry goes given the other entries on the SAME day.
 * Compares against every same-day entry (roots and members); the best match
 * at or above the threshold wins and the new entry joins that match's chain
 * at the next free index. Ties go to the earliest chain (lowest root id).
 */
export function assignChain(text: string, sameDay: readonly ChainCandidate[], threshold = CHAIN_THRESHOLD): ChainAssignment {
  let best: { score: number; root: number } | null = null;
  for (const e of sameDay) {
    const score = similarity(text, e.text);
    const root = rootOf(e);
    if (!best || score > best.score || (score === best.score && root < best.root)) best = { score, root };
  }
  if (!best || best.score < threshold) return { chain_root_id: null, chain_index: 0, similarity: best?.score ?? 0 };

  const maxIndex = Math.max(0, ...sameDay.filter((e) => rootOf(e) === best.root).map((e) => e.chain_index));
  return { chain_root_id: best.root, chain_index: maxIndex + 1, similarity: best.score };
}

/** DB wrapper: load the day's entries (minus `excludeId`, for edits) and assign. */
export function chainForEntry(db: Database, date: string, text: string, excludeId?: number): ChainAssignment {
  const rows = db
    .query<ChainCandidate, { date: string; exclude: number }>(
      `SELECT id, text, chain_root_id, chain_index FROM entries
       WHERE date = $date AND id != $exclude ORDER BY id`,
    )
    .all({ date, exclude: excludeId ?? -1 });
  return assignChain(text, rows);
}

// ---- OTJ summary ----

export interface OtjEntry {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  text: string;
  chain_root_id: number | null;
  chain_index: number;
}

export interface OtjChain {
  root_id: number;
  date: string;
  text: string; // root's text only
  minutes: number; // summed over every entry in the chain
  entry_ids: number[];
}

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`Bad time: ${time}`);
  return +m[1]! * 60 + +m[2]!;
}

export function durationMinutes(start: string, end: string): number {
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

/**
 * Collapse entries into chains. Each entry is counted exactly once. Display
 * text comes from the root; if the root isn't in `entries` (deleted or
 * filtered out), the lowest-index member present stands in for it.
 */
export function summariseOtj(entries: readonly OtjEntry[]): OtjChain[] {
  const groups = new Map<number, OtjEntry[]>();
  for (const e of entries) {
    const key = rootOf(e);
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  const out: OtjChain[] = [];
  for (const [root_id, members] of groups) {
    members.sort((a, b) => a.chain_index - b.chain_index || a.id - b.id);
    const head = members.find((m) => m.id === root_id) ?? members[0]!;
    out.push({
      root_id,
      date: head.date,
      text: head.text,
      minutes: members.reduce((sum, m) => sum + durationMinutes(m.start_time, m.end_time), 0),
      entry_ids: members.map((m) => m.id),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.root_id - b.root_id);
}

export const totalMinutes = (chains: readonly OtjChain[]) => chains.reduce((s, c) => s + c.minutes, 0);
