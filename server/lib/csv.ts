// Minimal RFC 4180 CSV reader: quoted fields, "" escapes, newlines inside quotes,
// CRLF/LF, a UTF-8 BOM. The delimiter (`,` `;` or tab) is sniffed from the first line.

function sniffDelimiter(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch in counts) counts[ch]!++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return n > 0 ? best : ",";
}

/** Parse CSV text into rows of cells. Fully blank rows are dropped. */
export function parseCsv(input: string, delimiter = sniffDelimiter(input.replace(/^﻿/, ""))): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Inside quoted cells keep the author's line breaks, but normalise CRLF.
  return rows
    .map((r) => r.map((c) => c.replace(/\r\n?/g, "\n")))
    .filter((r) => r.some((c) => c.trim() !== ""));
}
