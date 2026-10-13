// Evidence files on disk under DATA_DIR/uploads. DB stores paths relative to DATA_DIR.
import { mkdirSync, rmSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { env } from "../env";

/** Keep a readable, filesystem-safe version of the original name. */
export function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").replace(/^\.+/, "").slice(-100);
  return cleaned || "file";
}

/** Absolute path for a stored relative path; refuses anything escaping DATA_DIR. */
export function absPath(rel: string): string {
  const root = env.dataDir;
  const full = normalize(join(root, rel));
  if (!full.startsWith(root + sep)) throw new Error(`Path escapes data dir: ${rel}`);
  return full;
}

/**
 * Write a file to uploads/{folder}/ and return its path relative to DATA_DIR.
 * `folder` is the KSB id, or `entries/{id}` for files attached only to an entry.
 */
export async function saveUpload(file: File, folder: string): Promise<string> {
  const rel = join("uploads", folder, `${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`);
  const full = absPath(rel);
  mkdirSync(join(full, ".."), { recursive: true });
  await Bun.write(full, file);
  return rel;
}

export function removeUpload(rel: string): void {
  rmSync(absPath(rel), { force: true });
}
