import { Form, Link } from "react-router";
import { EntryRow } from "~/components/EntryRow";
import { Button, Card, Input } from "~/components/ui";
import { api, errorMessage, type EntrySummary } from "~/lib/api";
import { formatDate, formatDuration } from "~/lib/format";
import type { Route } from "./+types/entries._index";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const sp = new URL(request.url).searchParams;
  const filters = { q: sp.get("q") || undefined, from: sp.get("from") || undefined, to: sp.get("to") || undefined };
  const { data, error } = await api.api.entries.get({ query: { ...filters, limit: 500 } });
  if (error) throw new Error(`Failed to load entries: ${errorMessage(error)}`);
  return { entries: data, filters };
}

/** Group by day (newest first); within a day, chains in start order with members under their root. */
function byDay(entries: EntrySummary[]) {
  const days = new Map<string, EntrySummary[]>();
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  return [...days].map(([date, list]) => {
    const rootOf = (e: EntrySummary) => e.chain_root_id ?? e.id;
    const rootStart = new Map(list.filter((e) => e.chain_index === 0).map((e) => [e.id, e.start_time]));
    const sorted = [...list].sort(
      (a, b) =>
        (rootStart.get(rootOf(a)) ?? a.start_time).localeCompare(rootStart.get(rootOf(b)) ?? b.start_time) ||
        rootOf(a) - rootOf(b) ||
        a.chain_index - b.chain_index,
    );
    return { date, entries: sorted, minutes: list.reduce((n, e) => n + e.minutes, 0) };
  });
}

export default function Entries({ loaderData }: Route.ComponentProps) {
  const { entries, filters } = loaderData;
  const days = byDay(entries);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Form className="flex flex-wrap items-end gap-2">
          <Input name="q" placeholder="Search text" defaultValue={filters.q} className="w-48" />
          <Input name="from" type="date" defaultValue={filters.from} aria-label="From" className="w-auto" />
          <Input name="to" type="date" defaultValue={filters.to} aria-label="To" className="w-auto" />
          <Button type="submit">Filter</Button>
          {(filters.q || filters.from || filters.to) && (
            <Link to="/entries" className="px-1 text-sm text-muted hover:text-text">
              Clear
            </Link>
          )}
        </Form>
        <Link to="/entries/new" className="rounded-ui border border-accent px-2.5 py-1 text-sm hover:bg-accent/15">
          + New entry
        </Link>
      </div>

      {days.length === 0 && <p className="text-sm text-muted">No entries.</p>}
      {days.map((d) => (
        <Card
          key={d.date}
          title={formatDate(d.date)}
          actions={<span className="text-xs text-muted tabular-nums">{formatDuration(d.minutes)}</span>}
          className="[&>div]:p-0"
        >
          <ul className="divide-y divide-border">
            {d.entries.map((e) => (
              <EntryRow key={e.id} e={e} showDate={false} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
