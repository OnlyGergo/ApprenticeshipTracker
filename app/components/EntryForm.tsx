import { useMemo, useState } from "react";
import { STAR_KEYS, suggestStar, type StarFlags } from "../../server/services/star";
import type { EntryDetail, EntryInput, Ksb } from "~/lib/api";
import { formatDuration, todayIso } from "~/lib/format";
import { Button, ErrorText, Input, Label, Textarea, cx } from "./ui";

interface KsbLine {
  key: number;
  codes: string; // "K1, S3" - a group shares one explanation
  explanation: string;
}

let nextKey = 1;
const blankLine = (): KsbLine => ({ key: nextKey++, codes: "", explanation: "" });

/** Rebuild the form's KSB groups from an entry: rows with the same explanation collapse back into one line. */
function linesFromEntry(entry: EntryDetail): KsbLine[] {
  const groups = new Map<string, string[]>();
  for (const k of entry.ksbs) groups.set(k.explanation, [...(groups.get(k.explanation) ?? []), k.code]);
  const lines = [...groups].map(([explanation, codes]) => ({ key: nextKey++, codes: codes.join(", "), explanation }));
  return lines.length ? lines : [blankLine()];
}

const splitCodes = (s: string) =>
  s
    .split(/[\s,/&]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

const minutesBetween = (a: string, b: string) => {
  const [ah = 0, am = 0] = a.split(":").map(Number);
  const [bh = 0, bm = 0] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
};

export function EntryForm({
  ksbs,
  initial,
  submitLabel,
  onSubmit,
}: {
  ksbs: Ksb[];
  initial?: EntryDetail;
  submitLabel: string;
  onSubmit: (input: EntryInput) => Promise<string | void>; // returns an error message on failure
}) {
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [start, setStart] = useState(initial?.start_time ?? "09:00");
  const [end, setEnd] = useState(initial?.end_time ?? "17:00");
  const [text, setText] = useState(initial?.text ?? "");
  const [lines, setLines] = useState<KsbLine[]>(() => (initial ? linesFromEntry(initial) : [blankLine()]));
  const [star, setStar] = useState<StarFlags>(initial?.star ?? { situation: false, task: false, action: false, result: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const known = useMemo(() => new Map(ksbs.map((k) => [k.code.toUpperCase(), k])), [ksbs]);
  const minutes = minutesBetween(start, end);
  const unknown = lines.flatMap((l) => splitCodes(l.codes)).filter((c) => !known.has(c));

  const update = (key: number, patch: Partial<KsbLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function suggest() {
    const s = suggestStar([text, ...lines.map((l) => l.explanation)].join("\n"));
    // Only adds ticks; never clears one the user set.
    setStar((cur) => Object.fromEntries(STAR_KEYS.map((k) => [k, cur[k] || s[k]])) as StarFlags);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (minutes <= 0) return setError("End time must be after start time.");
    if (unknown.length) return setError(`Unknown KSB code(s): ${[...new Set(unknown)].join(", ")}`);
    const seen = new Set<string>();
    const ksbRows: NonNullable<EntryInput["ksbs"]> = [];
    for (const l of lines) {
      for (const code of splitCodes(l.codes)) {
        if (seen.has(code)) return setError(`${code} appears on more than one line.`);
        seen.add(code);
        ksbRows.push({ code, explanation: l.explanation.trim() });
      }
    }
    setBusy(true);
    setError("");
    const err = await onSubmit({ date, start_time: start, end_time: end, text: text.trim(), ksbs: ksbRows, star });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Label text="Date">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Label>
        <Label text="Start">
          <Input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        </Label>
        <Label text="End">
          <Input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
        </Label>
        <div className="flex flex-col justify-end pb-1 text-sm">
          <span className="text-xs text-muted">Duration</span>
          <span className={cx("tabular-nums", minutes <= 0 && "text-bad")}>{minutes > 0 ? formatDuration(minutes) : "—"}</span>
        </div>
      </div>

      <Label text="What did you do?">
        <Textarea required rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Description of the activity" />
      </Label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-muted">KSBs hit (comma-separate codes that share one explanation)</legend>
        <datalist id="ksb-codes">
          {ksbs.map((k) => (
            <option key={k.id} value={k.code}>
              {k.title}
            </option>
          ))}
        </datalist>
        {lines.map((l) => {
          const bad = splitCodes(l.codes).filter((c) => !known.has(c));
          return (
            <div key={l.key} className="grid items-start gap-2 sm:grid-cols-[10rem_1fr_auto]">
              <Input
                list="ksb-codes"
                aria-label="KSB codes"
                placeholder="K1, S3"
                value={l.codes}
                onChange={(e) => update(l.key, { codes: e.target.value })}
                className={cx("font-mono", bad.length > 0 && "border-bad/60")}
                title={bad.length ? `Unknown: ${bad.join(", ")}` : undefined}
              />
              <Textarea
                aria-label="Explanation"
                rows={2}
                className="min-h-0"
                placeholder="How this activity evidences these KSBs"
                value={l.explanation}
                onChange={(e) => update(l.key, { explanation: e.target.value })}
              />
              <Button
                variant="ghost"
                aria-label="Remove line"
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              >
                ✕
              </Button>
            </div>
          );
        })}
        <div>
          <Button onClick={() => setLines((ls) => [...ls, blankLine()])}>+ KSB line</Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-xs text-muted">STAR</legend>
        {STAR_KEYS.map((k) => (
          <label
            key={k}
            className={cx(
              "cursor-pointer rounded-ui border px-2 py-0.5 text-sm capitalize select-none",
              star[k] ? "border-accent bg-accent/15" : "border-border text-muted hover:border-accent-muted",
            )}
          >
            <input type="checkbox" className="sr-only" checked={star[k]} onChange={(e) => setStar({ ...star, [k]: e.target.checked })} />
            {k}
          </label>
        ))}
        <Button variant="ghost" onClick={suggest} title="Pre-tick from keywords in your text">
          Suggest
        </Button>
      </fieldset>

      <ErrorText>{error}</ErrorText>
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
