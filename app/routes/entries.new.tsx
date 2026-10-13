import { useNavigate } from "react-router";
import { EntryForm } from "~/components/EntryForm";
import { Card } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import type { Route } from "./+types/entries.new";

export async function clientLoader() {
  const { data, error } = await api.api.ksbs.get();
  if (error) throw new Error(`Failed to load KSBs: ${errorMessage(error)}`);
  return { ksbs: data };
}

export default function NewEntry({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  return (
    <Card title="New OTJ entry" className="mx-auto max-w-3xl">
      <EntryForm
        ksbs={loaderData.ksbs}
        submitLabel="Save entry"
        onSubmit={async (input) => {
          const { data, error } = await api.api.entries.post(input);
          if (error) return errorMessage(error);
          navigate(`/entries/${data.id}`);
        }}
      />
    </Card>
  );
}
