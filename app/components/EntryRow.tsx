import { Link } from "react-router";
import type { EntrySummary } from "~/lib/api";
import { formatDate, formatDuration } from "~/lib/format";
import { StarBadge } from "./StarBadge";
import { Tag } from "./ui";

/** One line in an entry list. Chained duplicates are indented under their root. */
export function EntryRow({ e, showDate = true }: { e: EntrySummary; showDate?: boolean }) {
  const chained = e.chain_index > 0;
  return (
    <li>
      <Link to={`/entries/${e.id}`} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-2">
        {showDate && <span className="w-24 shrink-0 text-muted tabular-nums">{formatDate(e.date)}</span>}
        <span className="w-24 shrink-0 text-muted tabular-nums">
          {e.start_time}–{e.end_time}
        </span>
        <span className="w-14 shrink-0 tabular-nums">{formatDuration(e.minutes)}</span>
        <span className={`min-w-0 flex-1 truncate ${chained ? "pl-3 text-muted" : ""}`}>
          {chained && <span title={`Chained to entry #${e.chain_root_id}`}>↳ </span>}
          {e.text}
        </span>
        <span className="hidden shrink-0 gap-1 md:flex">
          {e.ksbs.slice(0, 4).map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
          {e.ksbs.length > 4 && <Tag>+{e.ksbs.length - 4}</Tag>}
        </span>
        {e.evidence_count > 0 && <span className="shrink-0 text-xs text-muted" title="Evidence files">📎{e.evidence_count}</span>}
        <StarBadge star={e.star} />
      </Link>
    </li>
  );
}
