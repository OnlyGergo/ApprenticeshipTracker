import { Link, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";
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
  { to: "/entries", label: "Entries", end: false },
  { to: "/coverage", label: "Coverage", end: true },
  { to: "/gaps", label: "Gaps", end: true },
  { to: "/import", label: "Import", end: true },
  { to: "/settings", label: "Settings", end: true },
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
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-11 max-w-6xl items-stretch gap-3 px-4 sm:gap-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span className="size-2.5 rounded-[2px] border border-accent" aria-hidden />
            KSB Tracker
          </Link>
          <nav className="-mb-px flex min-w-0 items-stretch gap-4 overflow-x-auto text-muted">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => {
                  // "Log entry" has its own button, so /entries/new doesn't light up Entries.
                  const active = isActive && pathname !== "/entries/new";
                  return `flex items-center whitespace-nowrap border-b-2 transition-colors ${active ? "border-accent text-text" : "border-transparent hover:text-text"}`;
                }}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <NavLink
            to="/entries/new"
            className={({ isActive }) =>
              `my-auto ml-auto shrink-0 rounded-ui border px-2.5 py-0.5 text-sm transition-colors ${isActive ? "border-accent bg-accent/15" : "border-accent-muted hover:border-accent"}`
            }
          >
            + Log entry
          </NavLink>
        </div>
      </header>
      {stale && <StaleBanner lastEntryDate={stale.last_entry_date} daysSince={stale.days_since} after={stale.stale_after_days} />}
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
