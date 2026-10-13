import type { Database } from "bun:sqlite";
import { getDb } from "./client";

// Versioned migrations, tracked via PRAGMA user_version. Append only; never edit a shipped one.
const migrations: Array<(db: Database) => Promise<void> | void> = [
  // v1: initial schema
  async (db) => {
    db.run(await Bun.file(new URL("./schema.sql", import.meta.url)).text());
  },
];

/** Schema version this build migrates to. */
export const SCHEMA_VERSION = migrations.length;

export async function migrate(db: Database = getDb()): Promise<number> {
  const current = db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
  for (let v = current; v < migrations.length; v++) {
    db.run("BEGIN");
    try {
      await migrations[v]!(db);
      db.run(`PRAGMA user_version = ${v + 1}`);
      db.run("COMMIT");
    } catch (err) {
      db.run("ROLLBACK");
      throw err;
    }
  }
  return migrations.length;
}

if (import.meta.main) {
  const version = await migrate();
  console.log(`Database at schema v${version}`);
}
