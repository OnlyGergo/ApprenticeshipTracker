import { useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { Button, Card, ErrorText, Input, Label } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import type { Route } from "./+types/settings";

export async function clientLoader() {
  const { data, error } = await api.api.settings.get();
  if (error) throw new Error(`Failed to load settings: ${errorMessage(error)}`);
  return { settings: data };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PlanForm key={JSON.stringify(loaderData.settings)} settings={loaderData.settings} />
      <Backup />
    </div>
  );
}

function PlanForm({ settings }: { settings: Route.ComponentProps["loaderData"]["settings"] }) {
  const { revalidate } = useRevalidator();
  const [form, setForm] = useState({
    start_date: settings.start_date ?? "",
    gateway_date: settings.gateway_date ?? "",
    target_hours: settings.target_hours?.toString() ?? "",
    stale_after_days: String(settings.stale_after_days),
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setSaved(false);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await api.api.settings.patch({
      start_date: form.start_date || null,
      gateway_date: form.gateway_date || null,
      target_hours: form.target_hours === "" ? null : Number(form.target_hours),
      stale_after_days: Number(form.stale_after_days) || 7,
    });
    if (error) return setError(errorMessage(error));
    setSaved(true);
    revalidate();
  }

  return (
    <Card title="Apprenticeship plan">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Start date">
            <Input type="date" value={form.start_date} onChange={set("start_date")} />
          </Label>
          <Label text="EPA gateway date">
            <Input type="date" value={form.gateway_date} onChange={set("gateway_date")} />
          </Label>
          <Label text="OTJ target (hours by gateway)">
            <Input type="number" min={0} step="0.5" value={form.target_hours} onChange={set("target_hours")} placeholder="from your training plan" />
          </Label>
          <Label text="Stale reminder after (days)">
            <Input type="number" min={1} max={365} value={form.stale_after_days} onChange={set("stale_after_days")} />
          </Label>
        </div>
        <p className="text-xs text-muted">Start, gateway and target draw the target line on the Coverage chart.</p>
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary">
            Save
          </Button>
          {saved && <span className="text-xs text-ok">Saved</span>}
        </div>
      </form>
    </Card>
  );
}

function Backup() {
  const { revalidate } = useRevalidator();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function restore(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a backup .zip first.");
    if (!confirm(`Replace ALL current entries, KSB data and uploads with "${file.name}"?`)) return;
    setBusy(true);
    setError("");
    setResult("");
    const { data, error } = await api.api.export.restore.post({ file });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    if (fileRef.current) fileRef.current.value = "";
    setResult(
      `Restored ${data.entries} entries and ${data.files} files.` +
        (data.missing_files ? ` ${data.missing_files} evidence file(s) referenced by the database weren't in the zip.` : ""),
    );
    revalidate();
  }

  return (
    <Card title="Backup & restore">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/export/backup" download className="rounded-ui border border-accent px-2.5 py-1 text-sm hover:bg-accent/15">
            Download backup
          </a>
          <span className="text-xs text-muted">One .zip with the database and every uploaded file.</span>
        </div>
        <form onSubmit={restore} className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted">
            Restoring replaces everything. The current state is kept once as <code>app.db.pre-restore</code> and{" "}
            <code>uploads.pre-restore</code> in the data folder.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".zip,application/zip" className="text-sm text-muted file:mr-2 file:rounded-ui file:border file:border-border file:bg-surface-2 file:px-2 file:py-0.5 file:text-text" />
            <Button type="submit" variant="danger" disabled={busy}>
              {busy ? "Restoring…" : "Restore"}
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
          {result && <p className="text-sm text-ok">{result}</p>}
        </form>
      </div>
    </Card>
  );
}
