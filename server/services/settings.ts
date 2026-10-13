// App settings in the key/value `settings` table. Unknown keys are ignored.
import type { Database } from "bun:sqlite";
import { badRequest } from "../lib/errors";
import type { SettingsT } from "../models";

export const DEFAULT_SETTINGS: SettingsT = {
  start_date: null,
  gateway_date: null,
  target_hours: null,
  stale_after_days: 7,
};

export function getSettings(db: Database): SettingsT {
  const rows = db.query<{ key: string; value: string }, []>("SELECT key, value FROM settings").all();
  const out: SettingsT = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key === "start_date" || key === "gateway_date") out[key] = value || null;
    else if (key === "target_hours" || key === "stale_after_days") {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    }
  }
  return out;
}

/** Merge a partial update; `null` clears a value back to its default. */
export function updateSettings(db: Database, patch: Partial<SettingsT>): SettingsT {
  const next = { ...getSettings(db), ...patch };
  if (next.start_date && next.gateway_date && next.gateway_date <= next.start_date) {
    throw badRequest("Gateway date must be after the start date");
  }
  const upsert = db.query("INSERT INTO settings (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = $v");
  const del = db.query("DELETE FROM settings WHERE key = $k");
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) del.run({ k });
      else upsert.run({ k, v: String(v) });
    }
  })();
  return getSettings(db);
}
