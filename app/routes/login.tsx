import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button, Card, ErrorText, Input, Label } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";

// Only same-site paths: stops ?next= being used to bounce the user to another site.
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await api.api.auth.login.post(form);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    navigate(safeNext(params.get("next")), { replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-center gap-2 font-semibold tracking-tight">
          <span className="size-2.5 rounded-[2px] border border-accent" aria-hidden />
          KSB Tracker
        </div>
        <Card title="Sign in">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Label text="Username">
              <Input
                name="username"
                autoComplete="username"
                autoFocus
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Label>
            <Label text="Password">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Label>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" variant="primary" disabled={busy} className="mt-1 py-1.5">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
