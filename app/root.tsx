import { Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { StaleBanner } from "~/components/StaleBanner";
import { api } from "~/lib/api";
import "../style.css";

export async function clientLoader() {
  const { data } = await api.api.entries.stale.get();
  return { stale: data ?? null };
}

// Cheap call; re-run on every navigation so the banner clears right after logging an entry.
export const shouldRevalidate = () => true;

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/entries", label: "Entries", end: true },
  { to: "/entries/new", label: "New entry", end: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>KSB Tracker</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { stale } = loaderData;
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2">
        <span className="font-semibold tracking-tight">KSB Tracker</span>
        <nav className="flex gap-1 text-muted">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-ui border px-2 py-1 ${isActive ? "border-accent bg-accent/15 text-text" : "border-transparent hover:border-accent-muted hover:text-text"}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      {stale && <StaleBanner lastEntryDate={stale.last_entry_date} daysSince={stale.days_since} />}
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  );
}

export function HydrateFallback() {
  return <p className="p-4 text-muted">Loading…</p>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <pre className="mt-2 rounded-ui border border-bad/50 bg-surface p-3 text-muted">{message}</pre>
    </main>
  );
}
