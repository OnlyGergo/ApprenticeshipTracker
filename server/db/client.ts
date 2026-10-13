import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env";

export function openDb(path = join(env.dataDir, "app.db")): Database {
  if (path !== ":memory:") mkdirSync(env.dataDir, { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA synchronous = NORMAL");
  return db;
}

let instance: Database | undefined;

/** Shared app connection, opened lazily. */
export function getDb(): Database {
  instance ??= openDb();
  return instance;
}

/** Swap the shared connection (tests use an in-memory db). */
export function setDb(db: Database): void {
  instance = db;
}

/** Close the shared connection (checkpoints the WAL); the next getDb() reopens. Used by restore. */
export function closeDb(): void {
  instance?.close();
  instance = undefined;
}
