import { Link } from "react-router";
import { EntryRow } from "~/components/EntryRow";
import { EvidenceList, EvidenceUpload } from "~/components/EvidenceUpload";
import { QualityBar } from "~/components/KsbCard";
import { Card, LightDot, Stat, lightLabel } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import { formatDate } from "~/lib/format";
import type { Route } from "./+types/ksbs.$code";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const { data, error } = await api.api.ksbs({ code: params.code }).get();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export default function KsbDetailPage({ loaderData }: Route.ComponentProps) {
  const { stats, entries, evidence } = loaderData;
  const best = entries.filter((e) => e.best_evidence);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-muted hover:text-text">
          ← Dashboard
        </Link>
        <LightDot light={stats.light} />
        <h1 className="font-mono text-base font-semibold text-accent">{stats.code}</h1>
        <span className="text-xs text-muted capitalize">{stats.category}</span>
      </div>
      <p>{stats.title}</p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Status" value={lightLabel[stats.light]} />
        <Stat label="Entries" value={stats.entry_count} hint="chains counted once" />
        <Stat
          label="Evidence files"
          value={stats.evidence_count}
          hint={
            <span className="flex items-center gap-2">
              Q1–5: {stats.evidence_by_quality.join(" / ")}
              <QualityBar counts={stats.evidence_by_quality} />
            </span>
          }
        />
        <Stat label="Last touched" value={stats.last_touched ? formatDate(stats.last_touched) : "Never"} />
      </div>

      {best.length > 0 && (
        <Card title="★ Best entries" className="[&>div]:p-0">
          <ul className="divide-y divide-border">
            {best.map((e) => (
              <li key={e.id} className="px-3 py-1.5 text-sm">
                <Link to={`/entries/${e.id}`} className="hover:text-accent">
                  <span className="mr-2 text-muted tabular-nums">{formatDate(e.date)}</span>
                  {e.explanation || e.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Entries (${entries.length})`} className="[&>div]:p-0">
        {entries.length ? (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <EntryRow key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <p className="p-3 text-sm text-muted">No entries tagged with {stats.code} yet.</p>
        )}
      </Card>

      <Card title={`Evidence (${evidence.length})`}>
        <div className="flex flex-col gap-3">
          <EvidenceList files={evidence} showKsb={false} />
          <EvidenceUpload ksbCode={stats.code} />
        </div>
      </Card>
    </div>
  );
}
