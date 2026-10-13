import { Link } from "react-router";
import { formatDate } from "~/lib/format";

/** `after` = days without an entry before the banner shows (Settings, default 7). */
export function StaleBanner({ lastEntryDate, daysSince, after }: { lastEntryDate: string | null; daysSince: number | null; after: number }) {
  if (daysSince !== null && daysSince < after) return null;
  return (
    <div className="border-b border-warn/40 bg-warn/5 text-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-1.5">
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
    </div>
  );
}
