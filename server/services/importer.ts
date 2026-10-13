// Import: CSV export (one entry per row, log text in one cell) or a plain paste
// of fixed-format logs. Preview first, then commit the rows the user kept.
import type { Database } from "bun:sqlite";
import { badRequest, HttpError } from "../lib/errors";
import { parseCsv } from "../lib/csv";
import type { EntryInputT, ImportColumnsT, ImportRowT } from "../models";
import { toMinutes } from "./chaining";
import { createEntry } from "./entries";
import { parseLog, parseLogs, type ParsedEntry } from "./parser";

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const DEFAULT_START = "09:00";

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** UK-first date reader: 2026-10-13, 13/10/2026, 13-10-26, 13.10.2026, 13 Oct 2026, Tue 13 October 2026. */
export function parseDateCell(s: string): string | null {
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return isoDate(+m[1]!, +m[2]!, +m[3]!);
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(s);
  if (m) return isoDate(+m[3]!, +m[2]!, +m[1]!);
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})\b/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2]!.toLowerCase());
    if (month >= 0) return isoDate(+m[3]!, month + 1, +m[1]!);
  }
  return null;
}

/** 9:00, 09:00:00, 9.00, 9am, 2:30 pm, or the time part of a date-time cell. */
export function parseTimeCell(s: string): string | null {
  const rest = s.replace(/\d{4}-\d{1,2}-\d{1,2}T?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/, " ");
  const m = /(?:^|[^\d:.])(\d{1,2})(?:[:.](\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*(am|pm)?(?![\d:.])/i.exec(rest);
  if (!m || (m[2] === undefined && !m[3])) return null; // a bare number isn't a time
  let h = +m[1]!;
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.toLowerCase();
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

/** Duration in minutes: "1.5" (hours, or minutes if the column says so), "1:30", "1h 30m", "90 mins", "2 hours". */
export function parseDuration(s: string, bareIsMinutes = false): number | null {
  const v = s.trim().toLowerCase();
  if (!v) return null;
  let m = /^(\d+(?:\.\d+)?)$/.exec(v);
  if (m) return Math.round(+m[1]! * (bareIsMinutes ? 1 : 60));
  m = /^(\d{1,3}):(\d{2})$/.exec(v);
  if (m) return +m[1]! * 60 + +m[2]!;
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(v);
  const mins = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/.exec(v);
  if (!h && !mins) return null;
  return Math.round((h ? +h[1]! * 60 : 0) + (mins ? +mins[1]! : 0));
}

const fromMinutes = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

// Header patterns per field, best first.
const HEADER_PATTERNS: Record<keyof ImportColumnsT, RegExp[]> = {
  date: [/^date$/, /^(activity|entry|log|session|otj)\s*date$/, /^day$/, /^(?!.*(start|end|from|to|created|updated|modified)).*date/],
  start: [/^start(\s*time)?$/, /start/, /^(from|begin|time\s*in)/],
  end: [/^(end|finish)(\s*time)?$/, /end|finish/, /^(to|until|time\s*out)$/],
  duration: [/^duration/, /^(hours|hrs|minutes|mins)$/, /duration|hours|hrs|time\s*spent|length|minutes|mins/],
  text: [/^(description|details|text|log|notes|reflection|activity)$/, /description|detail|text|note|log|reflection|summary|content|activity|evidence|comment/],
};

/** Guess which column holds what. Falls back to the column with the longest text for `text`. */
export function detectColumns(headers: string[], rows: string[][]): ImportColumnsT {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const used = new Set<number>();
  const out: ImportColumnsT = { date: null, start: null, end: null, duration: null, text: null };
  for (const field of ["text", "date", "start", "end", "duration"] as const) {
    for (const re of HEADER_PATTERNS[field]) {
      const i = lower.findIndex((h, idx) => !used.has(idx) && re.test(h));
      if (i >= 0) {
        out[field] = i;
        used.add(i);
        break;
      }
    }
  }
  if (out.text === null && headers.length) {
    const avg = headers.map((_, i) => (used.has(i) ? -1 : rows.reduce((s, r) => s + (r[i]?.length ?? 0), 0)));
    const best = avg.indexOf(Math.max(...avg));
    if (avg[best]! > 0) out.text = best;
  }
  return out;
}

/** Codes the DB knows, uppercase. */
const knownCodes = (db: Database) => new Set(db.query<{ code: string }, []>("SELECT code FROM ksbs").all().map((r) => r.code));

interface RawRow {
  row: number;
  parsed: ParsedEntry;
  date: string | null;
  start: string | null;
  end: string | null;
  duration: number | null;
  warnings: string[];
}

function finishRow(db: Database, raw: RawRow, known: Set<string>, seen: Set<string>): ImportRowT {
  const { parsed } = raw;
  const warnings = [...raw.warnings, ...parsed.warnings.filter((w) => w !== "Missing description line")];
  const errors: string[] = [];
  const date = raw.date ?? parsed.date;
  let start = raw.start ?? parsed.start_time;
  let end = raw.end ?? parsed.end_time;

  if (raw.duration !== null && raw.duration > 0) {
    if (start && !end) end = toMinutes(start) + raw.duration < 24 * 60 ? fromMinutes(toMinutes(start) + raw.duration) : null;
    else if (!start && end) start = toMinutes(end) - raw.duration >= 0 ? fromMinutes(toMinutes(end) - raw.duration) : null;
    else if (!start && !end) {
      start = DEFAULT_START;
      end = fromMinutes(toMinutes(DEFAULT_START) + raw.duration);
      warnings.push(`No start time; assumed ${DEFAULT_START}`);
    }
  }
  if (!date) errors.push("No date");
  if (!start || !end) errors.push("No start/end time or duration");
  else if (end <= start) errors.push(`End ${end} is not after start ${start}`);
  if (!parsed.description) errors.push("No description");
  const unknown = parsed.ksbs.map((k) => k.code).filter((c) => !known.has(c));
  if (unknown.length) errors.push(`Unknown KSB code(s): ${unknown.join(", ")}`);

  const text = parsed.description;
  const key = `${date}|${start}|${end}|${text.trim()}`;
  const duplicate =
    seen.has(key) ||
    db
      .query("SELECT 1 FROM entries WHERE date = $d AND start_time = $s AND end_time = $e AND text = $t LIMIT 1")
      .get({ d: date, s: start, e: end, t: text.trim() }) !== null;
  seen.add(key);

  return { row: raw.row, date, start_time: start, end_time: end, text, ksbs: parsed.ksbs, warnings, errors, duplicate };
}

export function previewCsv(db: Database, csv: string, override?: Partial<ImportColumnsT>) {
  const all = parseCsv(csv);
  if (all.length === 0) throw badRequest("CSV is empty");
  const [headers, ...rows] = all as [string[], ...string[][]];
  const columns = { ...detectColumns(headers, rows), ...override };
  if (columns.text === null) throw badRequest("Pick the column holding the log text");

  const col = (r: string[], i: number | null) => (i === null ? "" : (r[i] ?? "").trim());
  const minutesHeader = columns.duration !== null && /min/i.test(headers[columns.duration] ?? "");
  const known = knownCodes(db);
  const seen = new Set<string>();

  const out = rows.map((r, idx) => {
    const warnings: string[] = [];
    const dateCell = col(r, columns.date);
    const startCell = col(r, columns.start);
    const endCell = col(r, columns.end);
    const durCell = col(r, columns.duration);
    const date = parseDateCell(dateCell) ?? parseDateCell(startCell);
    if (dateCell && !parseDateCell(dateCell)) warnings.push(`Couldn't read date "${dateCell}"`);
    const start = startCell ? parseTimeCell(startCell) : null;
    const end = endCell ? parseTimeCell(endCell) : null;
    if (startCell && !start) warnings.push(`Couldn't read start time "${startCell}"`);
    if (endCell && !end) warnings.push(`Couldn't read end time "${endCell}"`);
    const duration = durCell ? parseDuration(durCell, minutesHeader) : null;
    if (durCell && duration === null) warnings.push(`Couldn't read duration "${durCell}"`);
    return finishRow(
      db,
      { row: idx + 2, parsed: parseLog(col(r, columns.text)), date, start, end, duration, warnings }, // +2: 1-based, after header
      known,
      seen,
    );
  });
  return { headers, columns, rows: out };
}

export function previewText(db: Database, text: string) {
  const known = knownCodes(db);
  const seen = new Set<string>();
  const rows = parseLogs(text).map((parsed, i) =>
    finishRow(db, { row: i + 1, parsed, date: null, start: null, end: null, duration: null, warnings: [] }, known, seen),
  );
  return { headers: [], columns: { date: null, start: null, end: null, duration: null, text: null }, rows };
}

/**
 * Create entries in one transaction (all or nothing). Sorted by date and time
 * first so the earliest entry of a day becomes the chain root.
 */
export function commitImport(db: Database, entries: EntryInputT[]): { created: number; ids: number[] } {
  const ordered = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.start_time.localeCompare(b.e.start_time) || a.i - b.i);
  const ids = db.transaction(() =>
    ordered.map(({ e, i }) => {
      try {
        return createEntry(db, e).id;
      } catch (err) {
        if (err instanceof HttpError) throw new HttpError(err.status, `Entry ${i + 1}: ${err.message}`);
        throw err;
      }
    }),
  )();
  return { created: ids.length, ids };
}
