// KSB detail: stats plus every entry and file counting towards it.
import type { Database } from "bun:sqlite";
import { notFound } from "../lib/errors";
import { searchEntries, searchEvidence } from "./search";
import { ksbStats } from "./stats";

export function ksbDetail(db: Database, rawCode: string) {
  const code = rawCode.toUpperCase();
  const ksb = db.query<{ id: number }, { code: string }>("SELECT id FROM ksbs WHERE code = $code").get({ code });
  if (!ksb) throw notFound(`KSB ${code}`);

  const links = new Map(
    db
      .query<{ entry_id: number; explanation: string; best_evidence: number }, { id: number }>(
        "SELECT entry_id, explanation, best_evidence FROM entry_ksbs WHERE ksb_id = $id",
      )
      .all({ id: ksb.id })
      .map((l) => [l.entry_id, l]),
  );
  const entries = searchEntries(db, { ksb: code }).map((e) => ({
    ...e,
    explanation: links.get(e.id)?.explanation ?? "",
    best_evidence: links.get(e.id)?.best_evidence === 1,
  }));

  return { stats: ksbStats(db, ksb.id)[0]!, entries, evidence: searchEvidence(db, { ksb: code }) };
}
