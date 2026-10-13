import { useState } from "react";
import { Link } from "react-router";
import { EntryRow } from "~/components/EntryRow";
import { KsbCard } from "~/components/KsbCard";
import { Card, Stat, cx, type Light } from "~/components/ui";
import { api, errorMessage, type KsbStats } from "~/lib/api";
import { formatDuration } from "~/lib/format";
import type { Route } from "./+types/_index";

export async function clientLoader() {
  const [stats, otj, recent] = await Promise.all([
    api.api.ksbs.stats.get(),
    api.api.entries.otj.get({ query: {} }),
    api.api.entries.get({ query: { limit: 8 } }),
  ]);
  if (stats.error) throw new Error(`Failed to load KSB stats: ${errorMessage(stats.error)}`);
  return { stats: stats.data, otjMinutes: otj.data?.total_minutes ?? 0, recent: recent.data ?? [] };
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "knowledge", label: "Knowledge" },
  { key: "skill", label: "Skills" },
  { key: "behaviour", label: "Behaviours" },
] as const;
type Cat = (typeof CATEGORIES)[number]["key"];

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { stats, otjMinutes, recent } = loaderData;
  const [cat, setCat] = useState<Cat>("all");
  const [light, setLight] = useState<Light | "all">("all");

  const count = (l: Light) => stats.filter((s) => s.light === l).length;
  const shown = stats.filter((s: KsbStats) => (cat === "all" || s.category === cat) && (light === "all" || s.light === light));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="OTJ logged" value={formatDuration(otjMinutes)} hint="chains counted once" />
        <Stat label="Solid" value={<span className="text-ok">{count("green")}</span>} hint={`of ${stats.length} KSBs`} />
        <Stat label="Weak" value={<span className="text-warn">{count("yellow")}</span>} hint="no strong evidence yet" />
        <Stat label="Untouched" value={count("red")} hint="no entries or files" />
      </div>

      <Card
        title="KSB coverage"
        actions={
          <div className="flex flex-wrap gap-1 text-xs">
            {CATEGORIES.map((c) => (
              <Pill key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
                {c.label}
              </Pill>
            ))}
            <span className="mx-1 border-l border-border" />
            {(["all", "green", "yellow", "red"] as const).map((l) => (
              <Pill key={l} active={light === l} onClick={() => setLight(l)}>
                {l === "all" ? "Any" : l === "green" ? "Solid" : l === "yellow" ? "Weak" : "Untouched"}
              </Pill>
            ))}
          </div>
        }
      >
        {shown.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((s) => (
              <KsbCard key={s.ksb_id} s={s} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No KSBs match.</p>
        )}
      </Card>

      <Card
        title="Recent entries"
        actions={
          <Link to="/entries" className="text-xs text-muted hover:text-accent">
            All entries →
          </Link>
        }
        className="[&>div]:p-0"
      >
        {recent.length ? (
          <ul className="divide-y divide-border">
            {recent.map((e) => (
              <EntryRow key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <p className="p-3 text-sm text-muted">
            Nothing logged yet.{" "}
            <Link to="/entries/new" className="text-accent">
              Log your first entry
            </Link>
            .
          </p>
        )}
      </Card>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("rounded-ui border px-1.5 py-0.5", active ? "border-accent bg-accent/15" : "border-border text-muted hover:text-text")}
    >
      {children}
    </button>
  );
}
