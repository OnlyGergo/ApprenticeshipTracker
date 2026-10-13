import { Link } from "react-router";
import { CoverageChart } from "~/components/CoverageChart";
import { Card, Stat } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import { formatDate } from "~/lib/format";
import type { Route } from "./+types/coverage";

export async function clientLoader() {
  const { data, error } = await api.api.reports.coverage.get();
  if (error) throw new Error(`Failed to load coverage: ${errorMessage(error)}`);
  return { report: data };
}

const h = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;

export default function Coverage({ loaderData }: Route.ComponentProps) {
  const r = loaderData.report;
  const touched = [...r.points].reverse().find((p) => p.ksbs !== null)?.ksbs ?? 0;
  const diff = r.target_to_date === null ? null : r.total_hours - r.target_to_date;
  const hasTarget = r.target_hours !== null && r.gateway_date !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="OTJ logged" value={h(r.total_hours)} hint={r.target_hours ? `of ${h(r.target_hours)} target` : "no target set"} />
        <Stat
          label="Against plan"
          value={diff === null ? "–" : <span className={diff >= 0 ? "text-ok" : "text-warn"}>{`${diff >= 0 ? "+" : "−"}${h(Math.abs(diff))}`}</span>}
          hint={r.target_to_date === null ? "set start, gateway, target" : `${h(r.target_to_date)} expected by today`}
        />
        <Stat label="KSBs touched" value={`${touched} / ${r.ksb_total}`} hint="entry or evidence" />
        <Stat label="EPA gateway" value={r.gateway_date ? formatDate(r.gateway_date) : "–"} hint={r.start_date ? `started ${formatDate(r.start_date)}` : undefined} />
      </div>

      {!hasTarget && (
        <p className="rounded-ui border border-accent-muted px-3 py-1.5 text-sm">
          Add your start date, gateway date and OTJ target in <Link to="/settings" className="text-accent underline">Settings</Link> to draw the
          target line.
        </p>
      )}

      <Card title="OTJ hours over time">
        <CoverageChart
          points={r.points.map((p) => ({ date: p.date, value: p.hours, ref: p.target_hours }))}
          valueLabel="Hours logged"
          refLabel="Target"
          unit="h"
        />
      </Card>
      <Card title="KSBs evidenced over time">
        <CoverageChart
          points={r.points.map((p) => ({ date: p.date, value: p.ksbs, ref: r.ksb_total }))}
          valueLabel="KSBs touched"
          refLabel="All KSBs"
          integer
        />
      </Card>
    </div>
  );
}
