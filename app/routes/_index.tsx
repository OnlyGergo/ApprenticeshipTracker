import { api } from "~/lib/api";
import type { Route } from "./+types/_index";

export async function clientLoader() {
  const { data, error } = await api.api.ksbs.get();
  if (error) throw new Error(`Failed to load KSBs (${error.status})`);
  return { ksbs: data };
}

// Stage 1 placeholder; the traffic-light dashboard lands in stage 4.
export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { ksbs } = loaderData;
  return (
    <section>
      <h1 className="mb-3 text-base font-semibold">KSBs ({ksbs.length})</h1>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ksbs.map((k) => (
          <li key={k.id} className="rounded-ui border border-border bg-surface px-3 py-2">
            <span className="mr-2 font-mono text-accent">{k.code}</span>
            <span className="text-muted">{k.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
