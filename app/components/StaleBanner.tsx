import { Link } from "react-router";
import { formatDate } from "~/lib/format";

export const STALE_AFTER_DAYS = 7;

export function StaleBanner({ lastEntryDate, daysSince }: { lastEntryDate: string | null; daysSince: number | null }) {
  if (daysSince !== null && daysSince < STALE_AFTER_DAYS) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-warn/40 bg-warn/5 px-4 py-1.5 text-sm">
      <span>
        {lastEntryDate === null ? (
          "No entries logged yet."
        ) : (
          <>
            <strong className="tabular-nums">{daysSince}</strong> days since your last entry ({formatDate(lastEntryDate)}).
          </>
        )}
      </span>
      <Link to="/entries/new" className="rounded-ui border border-accent px-2 py-0.5 hover:bg-accent/15">
        Log OTJ
      </Link>
    </div>
  );
}
