import { Link } from "react-router";
import type { KsbStats } from "~/lib/api";
import { formatDate } from "~/lib/format";
import { LightDot, cx } from "./ui";

const border = { red: "border-border", yellow: "border-warn/35", green: "border-ok/35" } as const;

export function KsbCard({ s }: { s: KsbStats }) {
  return (
    <Link
      to={`/ksbs/${s.code}`}
      className={cx("flex flex-col gap-1 rounded-ui border bg-surface px-3 py-2 hover:border-accent-muted", border[s.light])}
    >
      <div className="flex items-center gap-2">
        <LightDot light={s.light} />
        <span className="font-mono text-accent">{s.code}</span>
        {s.has_best_evidence && <span title="Has best evidence" className="text-xs text-accent">★</span>}
        <span className="ml-auto text-xs text-muted">{s.last_touched ? formatDate(s.last_touched) : "never"}</span>
      </div>
      <p className="line-clamp-2 text-muted">{s.title}</p>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>
          <span className="text-text tabular-nums">{s.entry_count}</span> entries
        </span>
        <span>
          <span className="text-text tabular-nums">{s.evidence_count}</span> files
        </span>
        <QualityBar counts={s.evidence_by_quality} />
      </div>
    </Link>
  );
}

const qColour = ["bg-ok", "bg-ok/60", "bg-muted/60", "bg-warn/70", "bg-bad/70"];

/** Evidence counts by quality 1-5 as a tiny stacked bar. */
export function QualityBar({ counts }: { counts: number[] }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const title = counts.map((n, i) => `Q${i + 1}: ${n}`).join(" · ");
  return (
    <span title={title} className="ml-auto flex h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
      {total > 0 && counts.map((n, i) => n > 0 && <span key={i} className={qColour[i]} style={{ width: `${(n / total) * 100}%` }} />)}
    </span>
  );
}
