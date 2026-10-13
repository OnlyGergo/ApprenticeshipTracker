// Fixed-format OTJ log parser. Line splitting + regex only.
//
// Format (one entry):
//   [optional header]   2026-10-13 09:00-12:30      (or 13/10/2026, en dash, "to")
//   description line(s) ...
//   K1: explanation
//   K2, S3, B1: one explanation shared by the whole group
//     indented or plain follow-on lines continue the previous explanation
//
// Several entries can be pasted at once, separated by a line of "---".
// A KSB line may start with a bullet ("-", "*", "•"). Separators after the
// codes: ":", "-", "–", "—". Codes are case-insensitive and stored uppercase.

export interface ParsedKsb {
  code: string;
  explanation: string;
}

export interface ParsedEntry {
  date: string | null; // ISO YYYY-MM-DD
  start_time: string | null; // HH:MM
  end_time: string | null;
  description: string;
  ksbs: ParsedKsb[];
  warnings: string[];
}

const CODE = String.raw`[KSBksb]\d{1,3}`;
const KSB_LINE = new RegExp(
  String.raw`^\s*(?:[-*•]\s+)?(${CODE}(?:\s*(?:,|/|&|\band\b)\s*${CODE})*)\s*[:\-–—]\s*(.*)$`,
);
const CODE_G = new RegExp(CODE, "g");
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DATE_UK = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const TIME_RANGE = /\b(\d{1,2})[:.](\d{2})\s*(?:-|–|—|to)\s*(\d{1,2})[:.](\d{2})\b/i;
const SEPARATOR = /^\s*-{3,}\s*$/;

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function validTime(h: number, m: number): string | null {
  return h <= 23 && m <= 59 ? `${pad(h)}:${pad(m)}` : null;
}

/** Header = a line carrying a date and/or time range and nothing much else. */
function parseHeader(line: string): Pick<ParsedEntry, "date" | "start_time" | "end_time"> | null {
  const iso = DATE_ISO.exec(line);
  const uk = iso ? null : DATE_UK.exec(line);
  const range = TIME_RANGE.exec(line);
  if (!iso && !uk && !range) return null;
  // Anything left besides the date/time (and filler) means it's prose, not a header.
  let rest = line;
  for (const m of [iso, uk, range]) if (m) rest = rest.replace(m[0], "");
  if (/[a-z]{3,}/i.test(rest.replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi, ""))) return null;

  const date = iso
    ? validDate(+iso[1]!, +iso[2]!, +iso[3]!)
    : uk
      ? validDate(+uk[3]!, +uk[2]!, +uk[1]!)
      : null;
  const start = range ? validTime(+range[1]!, +range[2]!) : null;
  const end = range ? validTime(+range[3]!, +range[4]!) : null;
  return { date, start_time: start, end_time: end };
}

/** Parse a single entry block. */
export function parseLog(input: string): ParsedEntry {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const out: ParsedEntry = { date: null, start_time: null, end_time: null, description: "", ksbs: [], warnings: [] };
  const desc: string[] = [];
  const byCode = new Map<string, ParsedKsb>();
  let current: ParsedKsb[] = []; // group the last KSB line wrote to (continuations append here)
  let seenContent = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      current = []; // blank line ends a continuation
      continue;
    }

    if (!seenContent) {
      seenContent = true;
      const header = parseHeader(line);
      if (header) {
        Object.assign(out, header);
        if (header.date === null && (DATE_ISO.test(line) || DATE_UK.test(line))) out.warnings.push(`Invalid date in header: "${line}"`);
        if (TIME_RANGE.test(line) && (header.start_time === null || header.end_time === null))
          out.warnings.push(`Invalid time in header: "${line}"`);
        else if (header.start_time && header.end_time && header.end_time <= header.start_time)
          out.warnings.push(`End time ${header.end_time} is not after start time ${header.start_time}`);
        continue;
      }
    }

    const m = KSB_LINE.exec(line);
    if (m) {
      const codes = [...new Set(m[1]!.match(CODE_G)!.map((c) => c.toUpperCase()))];
      const text = m[2]!.trim();
      if (!text) out.warnings.push(`No explanation for ${codes.join(", ")}`);
      current = codes.map((code) => {
        const existing = byCode.get(code);
        if (existing) {
          out.warnings.push(`${code} listed more than once; explanations merged`);
          existing.explanation = [existing.explanation, text].filter(Boolean).join(" ");
          return existing;
        }
        const k = { code, explanation: text };
        byCode.set(code, k);
        out.ksbs.push(k);
        return k;
      });
      continue;
    }

    if (current.length > 0) {
      for (const k of current) k.explanation = [k.explanation, line].filter(Boolean).join(" ");
    } else if (out.ksbs.length === 0) {
      desc.push(line);
    } else {
      out.warnings.push(`Ignored line after KSBs: "${line}"`);
    }
  }

  out.description = desc.join("\n");
  if (!out.description) out.warnings.push("Missing description line");
  if (out.ksbs.length === 0) out.warnings.push("No KSB lines found");
  return out;
}

/** Parse a paste that may hold several entries separated by "---" lines. Empty blocks are skipped. */
export function parseLogs(input: string): ParsedEntry[] {
  const blocks: string[][] = [[]];
  for (const line of input.replace(/\r\n?/g, "\n").split("\n")) {
    if (SEPARATOR.test(line)) blocks.push([]);
    else blocks[blocks.length - 1]!.push(line);
  }
  return blocks.map((b) => b.join("\n")).filter((b) => b.trim()).map(parseLog);
}
