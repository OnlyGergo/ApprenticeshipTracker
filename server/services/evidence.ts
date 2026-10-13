// Evidence files: upload, metadata edits (quality / best flag), delete.
import type { Database } from "bun:sqlite";
import { badRequest, notFound } from "../lib/errors";
import type { EvidenceFileT } from "../models";
import { removeUpload, saveUpload } from "../storage/uploads";

export interface EvidenceRow {
  id: number;
  entry_id: number | null;
  ksb_id: number | null;
  ksb_code: string | null;
  path: string;
  original_name: string;
  mime: string;
  size: number;
  quality: number;
  best_evidence: number;
  uploaded_at: string;
}

/** Select list for EvidenceRow; alias `f` = evidence_files. */
export const EVIDENCE_SELECT = `
  SELECT f.id, f.entry_id, f.ksb_id, k.code AS ksb_code, f.path, f.original_name, f.mime, f.size,
         f.quality, f.best_evidence, f.uploaded_at
  FROM evidence_files f LEFT JOIN ksbs k ON k.id = f.ksb_id`;

export function toEvidence({ path: _path, best_evidence, ...r }: EvidenceRow): EvidenceFileT {
  return { ...r, best_evidence: best_evidence === 1, url: `/api/evidence/${r.id}/file` };
}

export function evidenceRow(db: Database, id: number): EvidenceRow {
  const row = db.query<EvidenceRow, { id: number }>(`${EVIDENCE_SELECT} WHERE f.id = $id`).get({ id });
  if (!row) throw notFound(`Evidence ${id}`);
  return row;
}

export const getEvidence = (db: Database, id: number) => toEvidence(evidenceRow(db, id));

export interface UploadInput {
  file: File;
  quality: number;
  entry_id?: number;
  ksb?: string; // KSB code
  best_evidence?: boolean;
}

export async function uploadEvidence(db: Database, input: UploadInput): Promise<EvidenceFileT> {
  if (input.entry_id === undefined && !input.ksb) throw badRequest("Attach evidence to an entry, a KSB, or both");
  if (input.entry_id !== undefined) {
    const ok = db.query("SELECT 1 FROM entries WHERE id = $id").get({ id: input.entry_id });
    if (!ok) throw notFound(`Entry ${input.entry_id}`);
  }
  let ksbId: number | null = null;
  if (input.ksb) {
    const code = input.ksb.toUpperCase();
    ksbId = db.query<{ id: number }, { code: string }>("SELECT id FROM ksbs WHERE code = $code").get({ code })?.id ?? null;
    if (ksbId === null) throw notFound(`KSB ${code}`);
  }

  const rel = await saveUpload(input.file, ksbId !== null ? String(ksbId) : `entries/${input.entry_id}`);
  try {
    const { id } = db
      .query<{ id: number }, Record<string, string | number | null>>(
        `INSERT INTO evidence_files (entry_id, ksb_id, path, original_name, mime, size, quality, best_evidence)
         VALUES ($entry_id, $ksb_id, $path, $name, $mime, $size, $quality, $best) RETURNING id`,
      )
      .get({
        entry_id: input.entry_id ?? null,
        ksb_id: ksbId,
        path: rel,
        name: input.file.name.split(/[/\\]/).pop() || "file",
        mime: input.file.type || "application/octet-stream",
        size: input.file.size,
        quality: input.quality,
        best: input.best_evidence ? 1 : 0,
      })!;
    return getEvidence(db, id);
  } catch (err) {
    removeUpload(rel);
    throw err;
  }
}

export function updateEvidence(db: Database, id: number, patch: { quality?: number; best_evidence?: boolean }): EvidenceFileT {
  evidenceRow(db, id);
  db.query(
    `UPDATE evidence_files SET quality = COALESCE($quality, quality), best_evidence = COALESCE($best, best_evidence)
     WHERE id = $id`,
  ).run({ id, quality: patch.quality ?? null, best: patch.best_evidence === undefined ? null : patch.best_evidence ? 1 : 0 });
  return getEvidence(db, id);
}

export function deleteEvidence(db: Database, id: number): void {
  const row = evidenceRow(db, id);
  db.query("DELETE FROM evidence_files WHERE id = $id").run({ id });
  removeUpload(row.path);
}

/** Types safe to show inline; everything else downloads. */
export const isInlineSafe = (mime: string) =>
  /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(mime.split(";")[0]!.trim().toLowerCase());
