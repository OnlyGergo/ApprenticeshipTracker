// Entry CRUD. Chaining runs on create, and on edit when the date or text changes.
import type { Database } from "bun:sqlite";
import { badRequest, notFound } from "../lib/errors";
import type { EntryDetailT, EntryInputT, EntryPatchT } from "../models";
import { removeUpload } from "../storage/uploads";
import { chainForEntry, durationMinutes, summariseOtj, totalMinutes, toMinutes, type OtjEntry } from "./chaining";
import { EVIDENCE_SELECT, toEvidence, type EvidenceRow } from "./evidence";
import { ENTRY_SUMMARY_SELECT, toEntrySummary, type EntryRow } from "./search";
import { starToRow } from "./star";

type KsbLink = { ksb_id: number; explanation: string; best_evidence: boolean | undefined };

/** Map input codes to KSB ids; unknown or repeated codes are a 400. */
function resolveKsbs(db: Database, inputs: EntryInputT["ksbs"] = []): KsbLink[] {
  const seen = new Set<string>();
  const unknown: string[] = [];
  const out: KsbLink[] = [];
  const lookup = db.query<{ id: number }, { code: string }>("SELECT id FROM ksbs WHERE code = $code");
  for (const k of inputs) {
    const code = k.code.toUpperCase();
    if (seen.has(code)) throw badRequest(`KSB ${code} listed twice`);
    seen.add(code);
    const row = lookup.get({ code });
    if (!row) unknown.push(code);
    else out.push({ ksb_id: row.id, explanation: k.explanation?.trim() ?? "", best_evidence: k.best_evidence });
  }
  if (unknown.length) throw badRequest(`Unknown KSB code(s): ${unknown.join(", ")}`);
  return out;
}

function checkTimes(start: string, end: string) {
  if (toMinutes(end) <= toMinutes(start)) throw badRequest("end_time must be after start_time");
}

/** Replace an entry's KSB links. Best flags not given in the input are kept. */
function writeKsbs(db: Database, entryId: number, links: KsbLink[]) {
  const prevBest = new Map(
    db
      .query<{ ksb_id: number; best_evidence: number }, { id: number }>(
        "SELECT ksb_id, best_evidence FROM entry_ksbs WHERE entry_id = $id",
      )
      .all({ id: entryId })
      .map((r) => [r.ksb_id, r.best_evidence === 1]),
  );
  db.query("DELETE FROM entry_ksbs WHERE entry_id = $id").run({ id: entryId });
  const ins = db.query("INSERT INTO entry_ksbs (entry_id, ksb_id, explanation, best_evidence) VALUES ($e, $k, $x, $b)");
  for (const l of links) {
    ins.run({ e: entryId, k: l.ksb_id, x: l.explanation, b: (l.best_evidence ?? prevBest.get(l.ksb_id) ?? false) ? 1 : 0 });
  }
}

/**
 * Take an entry out of the role of chain root without breaking the chain: its
 * lowest-index member becomes the new root and the rest re-point to it. Used
 * before deleting a root or moving it to another day (otherwise members would
 * be orphaned into separate chains).
 */
function promoteMembers(db: Database, id: number) {
  const members = db
    .query<{ id: number }, { id: number }>("SELECT id FROM entries WHERE chain_root_id = $id ORDER BY chain_index, id")
    .all({ id });
  const head = members[0];
  if (!head) return;
  db.query("UPDATE entries SET chain_root_id = NULL, chain_index = 0 WHERE id = $id").run({ id: head.id });
  db.query("UPDATE entries SET chain_root_id = $head WHERE chain_root_id = $id").run({ head: head.id, id });
}

const hasMembers = (db: Database, id: number) =>
  db.query("SELECT 1 FROM entries WHERE chain_root_id = $id LIMIT 1").get({ id }) !== null;

export function getEntry(db: Database, id: number): EntryDetailT {
  const row = db.query<Parameters<typeof toEntrySummary>[0], { id: number }>(`${ENTRY_SUMMARY_SELECT} WHERE e.id = $id`).get({ id });
  if (!row) throw notFound(`Entry ${id}`);
  const { ksbs: _codes, ...summary } = toEntrySummary(row);

  const ksbs = db
    .query<{ ksb_id: number; code: string; title: string; explanation: string; best_evidence: number }, { id: number }>(
      `SELECT k.id AS ksb_id, k.code, k.title, x.explanation, x.best_evidence
       FROM entry_ksbs x JOIN ksbs k ON k.id = x.ksb_id WHERE x.entry_id = $id ORDER BY k.sort_order, k.code`,
    )
    .all({ id })
    .map((k) => ({ ...k, best_evidence: k.best_evidence === 1 }));

  const evidence = db
    .query<EvidenceRow, { id: number }>(`${EVIDENCE_SELECT} WHERE f.entry_id = $id ORDER BY f.uploaded_at, f.id`)
    .all({ id })
    .map(toEvidence);

  const root = row.chain_root_id ?? row.id;
  const chain = db
    .query<{ id: number; start_time: string; end_time: string; chain_index: number }, { root: number }>(
      `SELECT id, start_time, end_time, chain_index FROM entries
       WHERE id = $root OR chain_root_id = $root ORDER BY chain_index, id`,
    )
    .all({ root })
    .map((m) => ({ ...m, minutes: durationMinutes(m.start_time, m.end_time) }));

  return { ...summary, ksbs, evidence, chain, chain_minutes: chain.reduce((s, m) => s + m.minutes, 0) };
}

export function createEntry(db: Database, input: EntryInputT): EntryDetailT {
  checkTimes(input.start_time, input.end_time);
  const id = db.transaction(() => {
    const links = resolveKsbs(db, input.ksbs);
    const chain = chainForEntry(db, input.date, input.text);
    const { id } = db
      .query<{ id: number }, Record<string, string | number | null>>(
        `INSERT INTO entries (date, start_time, end_time, text, chain_root_id, chain_index,
                              star_situation, star_task, star_action, star_result)
         VALUES ($date, $start, $end, $text, $root, $idx, $s, $t, $a, $r) RETURNING id`,
      )
      .get({
        date: input.date,
        start: input.start_time,
        end: input.end_time,
        text: input.text.trim(),
        root: chain.chain_root_id,
        idx: chain.chain_index,
        ...starParams(input.star),
      })!;
    writeKsbs(db, id, links);
    return id;
  })();
  return getEntry(db, id);
}

function starParams(star: EntryInputT["star"]) {
  const r = starToRow(star ?? {});
  return { s: r.star_situation, t: r.star_task, a: r.star_action, r: r.star_result };
}

/**
 * Partial update. Re-chains when the date or text changes, except that a root
 * with members keeps its place on a text-only edit (a typo fix shouldn't
 * reshuffle the chain). Moving a root to another day hands its chain over to
 * the next member first.
 */
export function updateEntry(db: Database, id: number, patch: EntryPatchT): EntryDetailT {
  db.transaction(() => {
    const cur = db
      .query<EntryRow, { id: number }>("SELECT * FROM entries WHERE id = $id")
      .get({ id });
    if (!cur) throw notFound(`Entry ${id}`);
    const next = {
      date: patch.date ?? cur.date,
      start_time: patch.start_time ?? cur.start_time,
      end_time: patch.end_time ?? cur.end_time,
      text: patch.text?.trim() ?? cur.text,
    };
    checkTimes(next.start_time, next.end_time);
    const links = patch.ksbs ? resolveKsbs(db, patch.ksbs) : null;

    let chain = { chain_root_id: cur.chain_root_id, chain_index: cur.chain_index };
    const dateChanged = next.date !== cur.date;
    if (dateChanged) promoteMembers(db, id);
    if (dateChanged || (next.text !== cur.text && !hasMembers(db, id))) {
      chain = chainForEntry(db, next.date, next.text, id);
    }

    const star = patch.star
      ? starParams({
          situation: patch.star.situation ?? cur.star_situation === 1,
          task: patch.star.task ?? cur.star_task === 1,
          action: patch.star.action ?? cur.star_action === 1,
          result: patch.star.result ?? cur.star_result === 1,
        })
      : { s: cur.star_situation, t: cur.star_task, a: cur.star_action, r: cur.star_result };

    db.query(
      `UPDATE entries SET date = $date, start_time = $start, end_time = $end, text = $text,
         chain_root_id = $root, chain_index = $idx,
         star_situation = $s, star_task = $t, star_action = $a, star_result = $r,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = $id`,
    ).run({
      id,
      date: next.date,
      start: next.start_time,
      end: next.end_time,
      text: next.text,
      root: chain.chain_root_id,
      idx: chain.chain_index,
      ...star,
    });
    if (links) writeKsbs(db, id, links);
  })();
  return getEntry(db, id);
}

export function deleteEntry(db: Database, id: number): void {
  const paths = db.transaction(() => {
    if (!db.query("SELECT 1 FROM entries WHERE id = $id").get({ id })) throw notFound(`Entry ${id}`);
    const paths = db
      .query<{ path: string }, { id: number }>("SELECT path FROM evidence_files WHERE entry_id = $id")
      .all({ id })
      .map((r) => r.path);
    promoteMembers(db, id);
    db.query("DELETE FROM entries WHERE id = $id").run({ id }); // entry_ksbs + evidence rows cascade
    return paths;
  })();
  for (const p of paths) removeUpload(p);
}

/** Flag/unflag an entry as a top pick for one of its KSBs. */
export function setEntryKsbBest(db: Database, id: number, code: string, best: boolean): EntryDetailT {
  const res = db
    .query(
      `UPDATE entry_ksbs SET best_evidence = $best
       WHERE entry_id = $id AND ksb_id = (SELECT id FROM ksbs WHERE code = $code)`,
    )
    .run({ id, code: code.toUpperCase(), best: best ? 1 : 0 });
  if (res.changes === 0) throw notFound(`Entry ${id} tagged with ${code.toUpperCase()}`);
  return getEntry(db, id);
}

/** OTJ hours by chain. Chains never span days, so a date filter can't split one. */
export function otjSummary(db: Database, from?: string, to?: string) {
  const rows = db
    .query<OtjEntry, { from: string | null; to: string | null }>(
      `SELECT id, date, start_time, end_time, text, chain_root_id, chain_index FROM entries
       WHERE ($from IS NULL OR date >= $from) AND ($to IS NULL OR date <= $to)`,
    )
    .all({ from: from ?? null, to: to ?? null });
  const chains = summariseOtj(rows);
  return { chains, total_minutes: totalMinutes(chains) };
}
