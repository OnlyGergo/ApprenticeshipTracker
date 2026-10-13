import { Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "../style.css";

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

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2">
        <span className="font-semibold tracking-tight">KSB Tracker</span>
        <nav className="flex gap-1 text-muted">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `rounded-ui border px-2 py-1 ${isActive ? "border-accent bg-accent/15 text-text" : "border-transparent hover:border-accent-muted"}`
            }
          >
            Dashboard
          </NavLink>
        </nav>
      </header>
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
