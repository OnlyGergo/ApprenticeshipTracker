import { useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { api, errorMessage, type EvidenceFile } from "~/lib/api";
import { formatDateTime } from "~/lib/format";
import { QualitySlider } from "./QualitySlider";
import { Button, ErrorText, Select, Tag, cx } from "./ui";

const formatSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

/** Upload form. Attach to an entry, a KSB, or both (an entry upload can optionally be filed under one of its KSBs). */
export function EvidenceUpload({ entryId, ksbCode, ksbChoices }: { entryId?: number; ksbCode?: string; ksbChoices?: string[] }) {
  const { revalidate } = useRevalidator();
  const fileRef = useRef<HTMLInputElement>(null);
  const [quality, setQuality] = useState(3);
  const [ksb, setKsb] = useState(ksbCode ?? "");
  const [best, setBest] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const files = [...(fileRef.current?.files ?? [])];
    if (!files.length) return setError("Choose a file first.");
    setBusy(true);
    setError("");
    for (const file of files) {
      const { error } = await api.api.evidence.post({
        file,
        quality,
        ...(entryId ? { entry_id: entryId } : {}),
        ...(ksb ? { ksb } : {}),
        ...(best ? { best_evidence: true } : {}),
      });
      if (error) {
        setError(`${file.name}: ${errorMessage(error)}`);
        break;
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    setBest(false);
    revalidate();
  }

  return (
    <form onSubmit={upload} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="text-sm text-muted file:mr-2 file:rounded-ui file:border file:border-border file:bg-surface-2 file:px-2 file:py-0.5 file:text-text"
        />
        {ksbChoices && (
          <Select aria-label="File under KSB" value={ksb} onChange={(e) => setKsb(e.target.value)} className="w-auto">
            <option value="">No KSB</option>
            {ksbChoices.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-xs text-muted">Quality</span>
        <QualitySlider value={quality} onChange={setQuality} />
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" checked={best} onChange={(e) => setBest(e.target.checked)} className="accent-[var(--color-accent)]" />
          Best evidence
        </label>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

/** Evidence table with inline quality / best / delete. */
export function EvidenceList({ files, showKsb = true }: { files: EvidenceFile[]; showKsb?: boolean }) {
  const { revalidate } = useRevalidator();
  const [error, setError] = useState("");

  async function patch(id: number, body: { quality?: number; best_evidence?: boolean }) {
    const { error } = await api.api.evidence({ id }).patch(body);
    setError(errorMessage(error));
    revalidate();
  }
  async function remove(f: EvidenceFile) {
    if (!confirm(`Delete ${f.original_name}?`)) return;
    const { error } = await api.api.evidence({ id: f.id }).delete();
    setError(errorMessage(error));
    revalidate();
  }

  if (!files.length) return <p className="text-sm text-muted">No evidence yet.</p>;
  return (
    <div className="flex flex-col gap-1">
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-border">
        {files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
            <button
              type="button"
              title={f.best_evidence ? "Unmark best evidence" : "Mark as best evidence"}
              onClick={() => patch(f.id, { best_evidence: !f.best_evidence })}
              className={cx("w-4", f.best_evidence ? "text-accent" : "text-muted/50 hover:text-accent")}
            >
              {f.best_evidence ? "★" : "☆"}
            </button>
            <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-accent">
              {f.original_name}
            </a>
            {showKsb && f.ksb_code && <Tag className="text-accent">{f.ksb_code}</Tag>}
            <span className="text-xs text-muted tabular-nums">{formatSize(f.size)}</span>
            <span className="hidden text-xs text-muted sm:inline">{formatDateTime(f.uploaded_at)}</span>
            <QualitySlider size="sm" value={f.quality} onChange={(q) => patch(f.id, { quality: q })} />
            <Button variant="ghost" aria-label="Delete file" onClick={() => remove(f)} className="px-1.5 hover:text-bad">
              ✕
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
