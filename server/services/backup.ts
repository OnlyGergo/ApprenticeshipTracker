// Full backup/restore: one zip holding a DB snapshot and every upload.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { closeDb, getDb, openDb, setDb } from "../db/client";
import { migrate, SCHEMA_VERSION } from "../db/migrate";
import { env } from "../env";
import { badRequest } from "../lib/errors";
import { buildBackup, DB_NAME, readBackup } from "../lib/zip";
import { absPath } from "../storage/uploads";

const REQUIRED_TABLES = ["entries", "ksbs", "entry_ksbs", "evidence_files", "settings"];
const tmpName = (prefix: string) => join(env.dataDir, `.${prefix}-${crypto.randomUUID().slice(0, 8)}.db`);

/** Zip of a consistent DB snapshot (VACUUM INTO, safe under WAL) plus uploads/. */
export function createBackup(db: Database = getDb()): Uint8Array {
  mkdirSync(env.dataDir, { recursive: true });
  const snap = tmpName("snapshot");
  try {
    db.run(`VACUUM INTO '${snap.replaceAll("'", "''")}'`);
    const counts = db
      .query<{ entries: number; files: number }, []>(
        "SELECT (SELECT COUNT(*) FROM entries) AS entries, (SELECT COUNT(*) FROM evidence_files) AS files",
      )
      .get()!;
    return buildBackup(readFileSync(snap), env.dataDir, {
      app: "ksb-tracker",
      schema_version: SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      ...counts,
    });
  } finally {
    rmSync(snap, { force: true });
  }
}

/** Check a staged DB file looks like ours; returns row counts. */
function inspect(path: string) {
  let db: Database | undefined;
  try {
    db = new Database(path, { readonly: true, strict: true });
    const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
    if (version > SCHEMA_VERSION) throw badRequest(`Backup is from a newer version (schema v${version}, this app has v${SCHEMA_VERSION})`);
    const tables = new Set(
      db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name),
    );
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missing.length) throw badRequest(`Backup database is missing table(s): ${missing.join(", ")}`);
    const ok = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check;
    if (ok !== "ok") throw badRequest("Backup database failed its integrity check");
    const paths = db.query<{ path: string }, []>("SELECT path FROM evidence_files").all().map((r) => r.path);
    const entries = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM entries").get()!.n;
    return { entries, paths };
  } catch (err) {
    if (err instanceof Error && "status" in err) throw err;
    throw badRequest(`Backup database couldn't be read: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    db?.close();
  }
}

/**
 * Replace the live DB and uploads with a backup. The previous state is kept as
 * DATA_DIR/app.db.pre-restore and DATA_DIR/uploads.pre-restore (one generation).
 */
export async function restoreBackup(zip: Uint8Array) {
  let contents: ReturnType<typeof readBackup>;
  try {
    contents = readBackup(zip);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Invalid backup");
  }
  const dir = env.dataDir;
  mkdirSync(dir, { recursive: true });
  const staged = tmpName("restore");
  await Bun.write(staged, contents.db);
  let info: ReturnType<typeof inspect>;
  try {
    info = inspect(staged);
  } catch (err) {
    rmSync(staged, { force: true });
    throw err;
  }
  const have = new Set(contents.uploads.map((u) => u.path));
  const missingFiles = info.paths.filter((p) => !have.has(p)).length;

  // Swap. Closing checkpoints the WAL, so app.db is complete before it's moved.
  closeDb();
  const live = join(dir, DB_NAME);
  const prevDb = `${live}.pre-restore`;
  rmSync(prevDb, { force: true });
  if (existsSync(live)) renameSync(live, prevDb);
  for (const ext of ["-wal", "-shm"]) rmSync(live + ext, { force: true });

  const uploads = join(dir, "uploads");
  const prevUploads = `${uploads}.pre-restore`;
  rmSync(prevUploads, { recursive: true, force: true });
  if (existsSync(uploads)) renameSync(uploads, prevUploads);
  for (const u of contents.uploads) {
    const full = absPath(u.path);
    mkdirSync(dirname(full), { recursive: true });
    await Bun.write(full, u.data);
  }

  renameSync(staged, live);
  const db = openDb(live);
  await migrate(db);
  setDb(db);
  return { entries: info.entries, files: contents.uploads.length, missing_files: missingFiles };
}
