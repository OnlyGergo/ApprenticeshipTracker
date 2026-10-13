// Backup bundle: app.db (consistent snapshot) + uploads/**, zipped with fflate.
import { unzipSync, zipSync, type Zippable } from "fflate";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

export const DB_NAME = "app.db";
export const MANIFEST = "ksb-tracker-backup.json";

/** Every file under `dir`, as POSIX paths relative to `root`. */
function walk(dir: string, root: string): string[] {
  let out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(walk(full, root));
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

/** Zip a DB snapshot file plus DATA_DIR/uploads. Uploads are stored (mostly already compressed). */
export function buildBackup(dbSnapshot: Uint8Array, dataDir: string, meta: Record<string, unknown>): Uint8Array {
  const files: Zippable = {
    [MANIFEST]: [new TextEncoder().encode(JSON.stringify(meta, null, 2)), { level: 6 }],
    [DB_NAME]: [dbSnapshot, { level: 6 }],
  };
  for (const rel of walk(join(dataDir, "uploads"), dataDir)) {
    files[rel] = [readFileSync(join(dataDir, rel)), { level: 0 }];
  }
  return zipSync(files);
}

export interface BackupContents {
  db: Uint8Array;
  uploads: Array<{ path: string; data: Uint8Array }>; // path relative to DATA_DIR, starts with "uploads/"
}

/** Unzip and validate a backup. Throws on anything that isn't app.db, the manifest or a safe uploads/ path. */
export function readBackup(zip: Uint8Array): BackupContents {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new Error("Not a valid zip file");
  }
  const db = files[DB_NAME];
  if (!db) throw new Error(`Backup has no ${DB_NAME}`);
  const uploads: BackupContents["uploads"] = [];
  for (const [name, data] of Object.entries(files)) {
    if (name === DB_NAME || name === MANIFEST || name.endsWith("/")) continue;
    const norm = posix.normalize(name);
    if (!norm.startsWith("uploads/") || norm.includes("..") || norm.includes("\\") || posix.isAbsolute(norm)) {
      throw new Error(`Unexpected file in backup: ${name}`);
    }
    uploads.push({ path: norm, data });
  }
  return { db, uploads };
}
