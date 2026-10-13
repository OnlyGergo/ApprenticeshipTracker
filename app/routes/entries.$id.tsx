import { useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { EntryForm } from "~/components/EntryForm";
import { EvidenceList, EvidenceUpload } from "~/components/EvidenceUpload";
import { StarBadge } from "~/components/StarBadge";
import { Button, Card, ErrorText, Tag, cx } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import { formatDate, formatDuration } from "~/lib/format";
import type { Route } from "./+types/entries.$id";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const id = Number(params.id);
  const [entry, ksbs] = await Promise.all([api.api.entries({ id }).get(), api.api.ksbs.get()]);
  if (entry.error) throw new Error(errorMessage(entry.error));
  return { entry: entry.data, ksbs: ksbs.data ?? [] };
}

export default function EntryView({ loaderData }: Route.ComponentProps) {
  const { entry, ksbs } = loaderData;
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  async function toggleBest(code: string, best: boolean) {
    const { error } = await api.api.entries({ id: entry.id }).ksbs({ code }).best.put({ best_evidence: best });
    setError(errorMessage(error));
    revalidate();
  }

  async function remove() {
    if (!confirm("Delete this entry? Its evidence files are deleted too.")) return;
    const { error } = await api.api.entries({ id: entry.id }).delete();
    if (error) return setError(errorMessage(error));
    navigate("/entries");
  }

  if (editing) {
    return (
      <Card title={`Edit entry #${entry.id}`} actions={<Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>} className="mx-auto max-w-3xl">
        <EntryForm
          key={entry.id}
          ksbs={ksbs}
          initial={entry}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            const { error } = await api.api.entries({ id: entry.id }).patch(input);
            if (error) return errorMessage(error);
            setEditing(false);
            revalidate();
          }}
        />
      </Card>
    );
  }

  const chained = entry.chain.length > 1;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/entries" className="text-sm text-muted hover:text-text">
          ← Entries
        </Link>
        <h1 className="text-base font-semibold">{formatDate(entry.date)}</h1>
        <span className="text-muted tabular-nums">
          {entry.start_time}–{entry.end_time} · {formatDuration(entry.minutes)}
        </span>
        <StarBadge star={entry.star} />
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      <Card>
        <p className="whitespace-pre-wrap">{entry.text}</p>
      </Card>

      {chained && (
        <Card title="Same-day chain" actions={<span className="text-xs text-muted">OTJ counts {formatDuration(entry.chain_minutes)} once, text from the root</span>}>
          <ul className="flex flex-wrap gap-1.5 text-sm">
            {entry.chain.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/entries/${m.id}`}
                  className={cx(
                    "inline-flex gap-1.5 rounded-ui border px-2 py-0.5 tabular-nums",
                    m.id === entry.id ? "border-accent bg-accent/15" : "border-border text-muted hover:border-accent-muted",
                  )}
                >
                  <span>{m.chain_index === 0 ? "root" : `#${m.chain_index}`}</span>
                  <span>
                    {m.start_time}–{m.end_time}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`KSBs (${entry.ksbs.length})`}>
        {entry.ksbs.length ? (
          <ul className="divide-y divide-border">
            {entry.ksbs.map((k) => (
              <li key={k.ksb_id} className="flex gap-2 py-1.5 text-sm">
                <button
                  type="button"
                  title={k.best_evidence ? "Unmark as best entry for this KSB" : "Mark as best entry for this KSB"}
                  onClick={() => toggleBest(k.code, !k.best_evidence)}
                  className={cx("w-4 shrink-0", k.best_evidence ? "text-accent" : "text-muted/50 hover:text-accent")}
                >
                  {k.best_evidence ? "★" : "☆"}
                </button>
                <Link to={`/ksbs/${k.code}`} className="shrink-0">
                  <Tag className="text-accent">{k.code}</Tag>
                </Link>
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap">{k.explanation || <span className="text-muted">No explanation</span>}</p>
                  <p className="truncate text-xs text-muted">{k.title}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No KSBs tagged.</p>
        )}
      </Card>

      <Card title={`Evidence (${entry.evidence.length})`}>
        <div className="flex flex-col gap-3">
          <EvidenceList files={entry.evidence} />
          <EvidenceUpload entryId={entry.id} ksbChoices={entry.ksbs.map((k) => k.code)} />
        </div>
      </Card>
    </div>
  );
}
