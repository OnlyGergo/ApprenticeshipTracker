import { useState } from "react";
import { Link } from "react-router";
import { Button, Card, LightDot, Stat, lightLabel } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import { formatDate } from "~/lib/format";
import type { Route } from "./+types/gaps";

export async function clientLoader() {
  const { data, error } = await api.api.reports.gaps.get();
  if (error) throw new Error(`Failed to load gap report: ${errorMessage(error)}`);
  return { report: data };
}

export default function Gaps({ loaderData }: Route.ComponentProps) {
  const { report } = loaderData;
  const [copied, setCopied] = useState(false);
  const red = report.items.filter((i) => i.light === "red");
  const yellow = report.items.filter((i) => i.light === "yellow");

  function copy() {
    const line = (i: (typeof report.items)[number]) => `- ${i.code} ${i.title}: ${i.reasons.join("; ")}`;
    const text = [
      `KSB gap report, ${formatDate(report.today)}`,
      `${report.green}/${report.total} solid, ${report.yellow} weak, ${report.red} untouched`,
      red.length ? `\nUntouched:\n${red.map(line).join("\n")}` : "",
      yellow.length ? `\nWeak:\n${yellow.map(line).join("\n")}` : "",
    ].join("\n");
    navigator.clipboard.writeText(text.trim()).then(() => setCopied(true));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Ready (solid)" value={<span className="text-ok">{report.green}</span>} hint={`of ${report.total} KSBs`} />
        <Stat label="Weak" value={<span className="text-warn">{report.yellow}</span>} hint="need strong evidence" />
        <Stat label="Untouched" value={report.red} hint="nothing logged" />
        <Stat
          label="EPA gateway"
          value={report.days_to_gateway === null ? "–" : `${report.days_to_gateway} days`}
          hint={report.gateway_date ? formatDate(report.gateway_date) : <Link to="/settings" className="underline">set a date</Link>}
        />
      </div>

      <Card
        title="Portfolio gaps"
        actions={
          report.items.length > 0 && (
            <Button variant="ghost" onClick={copy}>
              {copied ? "Copied" : "Copy as text"}
            </Button>
          )
        }
      >
        {report.items.length === 0 ? (
          <p className="text-sm text-ok">Every KSB is solid. Ready for gateway on evidence coverage.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <GapList title="Untouched" items={red} />
            <GapList title="Weak" items={yellow} />
          </div>
        )}
      </Card>
    </div>
  );
}

type Item = Route.ComponentProps["loaderData"]["report"]["items"][number];

function GapList({ title, items }: { title: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title} · {items.length}
      </h3>
      <ul className="divide-y divide-border rounded-ui border border-border">
        {items.map((i) => (
          <li key={i.ksb_id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
            <span className="mt-1.5">
              <LightDot light={i.light} />
            </span>
            <div className="min-w-0 flex-1">
              <Link to={`/ksbs/${i.code}`} className="font-mono text-sm hover:text-accent">
                {i.code}
              </Link>{" "}
              <span className="text-sm">{i.title}</span>
              <ul className="mt-0.5 text-xs text-muted">
                {i.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div className="text-right text-xs tabular-nums text-muted">
              <div>
                {i.entry_count} entr{i.entry_count === 1 ? "y" : "ies"} · {i.evidence_count} file{i.evidence_count === 1 ? "" : "s"}
              </div>
              {i.evidence_count > 0 && <div>Q1–5: {i.evidence_by_quality.join(" / ")}</div>}
              <div>{i.last_touched ? `Last ${formatDate(i.last_touched)}` : lightLabel[i.light]}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
