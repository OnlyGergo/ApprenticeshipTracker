import { useState } from "react";
import { Link } from "react-router";
import { Button, Card, ErrorText, Input, Label, Select, Tag, Textarea, cx } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import type { ImportColumns, ImportPreview, ImportRow } from "~/lib/api";

type Mode = "csv" | "text";
type Row = ImportRow & { include: boolean };
type Field = keyof ImportColumns;

const FIELDS: { key: Field; label: string }[] = [
  { key: "text", label: "Log text" },
  { key: "date", label: "Date" },
  { key: "start", label: "Start" },
  { key: "end", label: "End" },
  { key: "duration", label: "Duration" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date/time problems are re-checked live as the user edits; the rest come from the server. */
function rowErrors(r: ImportRow): string[] {
  const errs = r.errors.filter((e) => !/^No date|^No start|^End /.test(e));
  if (!r.date || !DATE.test(r.date)) errs.push("No date");
  if (!r.start_time || !r.end_time || !TIME.test(r.start_time) || !TIME.test(r.end_time)) errs.push("No start/end time");
  else if (r.end_time <= r.start_time) errs.push("End is not after start");
  return errs;
}

const withInclude = (rows: ImportRow[]): Row[] => rows.map((r) => ({ ...r, include: rowErrors(r).length === 0 && !r.duplicate }));

export default function Import() {
  const [mode, setMode] = useState<Mode>("csv");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<Omit<ImportPreview, "rows"> | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function runPreview(kind: Mode, text: string, columns?: Partial<ImportColumns>) {
    setBusy(true);
    setError("");
    setDone(null);
    const { data, error } = await api.api.import.preview.post({ kind, content: text, ...(columns ? { columns } : {}) });
    setBusy(false);
    if (error) {
      setPreview(null);
      setRows([]);
      return setError(errorMessage(error));
    }
    const { rows, ...rest } = data;
    setPreview(rest);
    setRows(withInclude(rows));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    runPreview("csv", text);
  }

  function setColumn(field: Field, value: string) {
    if (!preview) return;
    const columns = { ...preview.columns, [field]: value === "" ? null : Number(value) };
    runPreview("csv", content, columns);
  }

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const importable = rows.filter((r) => r.include && rowErrors(r).length === 0);

  async function commit() {
    setBusy(true);
    setError("");
    const { data, error } = await api.api.import.commit.post({
      entries: importable.map((r) => ({
        date: r.date!,
        start_time: r.start_time!,
        end_time: r.end_time!,
        text: r.text,
        ksbs: r.ksbs.map((k) => ({ code: k.code, explanation: k.explanation })),
      })),
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setDone(data.created);
    setRows([]);
    setPreview(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Import entries"
        actions={
          <div className="flex text-xs">
            {(["csv", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setPreview(null);
                  setRows([]);
                  setError("");
                }}
                className={cx("border-b-2 px-2 py-0.5", mode === m ? "border-accent text-text" : "border-transparent text-muted hover:text-text")}
              >
                {m === "csv" ? "CSV file" : "Paste text"}
              </button>
            ))}
          </div>
        }
      >
        {mode === "csv" ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              One entry per row. The log text cell holds the description, then KSB lines like <code>K1, B1 - explanation</code>. Dates
              are read UK-style (13/10/2026). With only a duration column, entries start at 09:00.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={onFile}
                className="text-sm text-muted file:mr-2 file:rounded-ui file:border file:border-border file:bg-surface-2 file:px-2 file:py-0.5 file:text-text"
              />
            </div>
            {preview && preview.headers.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {FIELDS.map((f) => (
                  <Label key={f.key} text={f.label}>
                    <Select value={preview.columns[f.key] ?? ""} onChange={(e) => setColumn(f.key, e.target.value)} disabled={busy}>
                      <option value="">—</option>
                      {preview.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </Select>
                  </Label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              Paste one or more logs separated by a <code>---</code> line. Start each with a header like{" "}
              <code>13/10/2026 09:00-12:30</code>, or fill the date and times in below.
            </p>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-40 font-mono" />
            <div>
              <Button variant="primary" disabled={busy || !content.trim()} onClick={() => runPreview("text", content)}>
                Preview
              </Button>
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <ErrorText>{error}</ErrorText>
          {done !== null && (
            <p className="rounded-ui border border-ok/40 px-2 py-1 text-sm text-ok">
              Imported {done} entr{done === 1 ? "y" : "ies"}. <Link to="/entries" className="underline">View entries</Link>
            </p>
          )}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card
          title={`Preview · ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          actions={
            <Button variant="primary" disabled={busy || importable.length === 0} onClick={commit}>
              Import {importable.length} entr{importable.length === 1 ? "y" : "ies"}
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="w-6 py-1 font-normal" />
                  <th className="py-1 pr-2 font-normal">#</th>
                  <th className="py-1 pr-2 font-normal">Date</th>
                  <th className="py-1 pr-2 font-normal">Time</th>
                  <th className="py-1 font-normal">Entry</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const errs = rowErrors(r);
                  return (
                    <tr key={r.row} className={cx("border-b border-border align-top", !r.include && "opacity-60")}>
                      <td className="py-1.5">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={errs.length > 0}
                          onChange={(e) => update(i, { include: e.target.checked })}
                          aria-label={`Include row ${r.row}`}
                          className="accent-[var(--color-accent)]"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-xs tabular-nums text-muted">{r.row}</td>
                      <td className="py-1 pr-2">
                        <Input type="date" value={r.date ?? ""} onChange={(e) => update(i, { date: e.target.value || null, include: true })} className="w-36" />
                      </td>
                      <td className="py-1 pr-2">
                        <div className="flex items-center gap-1">
                          <Input type="time" value={r.start_time ?? ""} onChange={(e) => update(i, { start_time: e.target.value || null, include: true })} className="w-24" />
                          <span className="text-muted">–</span>
                          <Input type="time" value={r.end_time ?? ""} onChange={(e) => update(i, { end_time: e.target.value || null, include: true })} className="w-24" />
                        </div>
                      </td>
                      <td className="py-1.5">
                        <div className="whitespace-pre-line">{r.text || <span className="text-muted">(no description)</span>}</div>
                        {r.ksbs.length > 0 && (
                          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                            {r.ksbs.map((k) => (
                              <li key={k.code} className="flex gap-1.5">
                                <Tag className="h-fit">{k.code}</Tag>
                                <span className="text-muted">{k.explanation}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {(errs.length > 0 || r.warnings.length > 0 || r.duplicate) && (
                          <ul className="mt-1 text-xs">
                            {r.duplicate && <li className="text-warn">Already imported (same date, times and text)</li>}
                            {errs.map((e) => (
                              <li key={e} className="text-bad">{e}</li>
                            ))}
                            {r.warnings.map((w) => (
                              <li key={w} className="text-muted">{w}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
