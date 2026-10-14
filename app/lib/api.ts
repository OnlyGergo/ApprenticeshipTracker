import { treaty } from "@elysiajs/eden";
import type { App } from "../../server/index";

// Same-origin: the browser sends the session cookie automatically.
// parseDate off: Eden would otherwise turn ISO strings into Date objects, but the schemas
// (and format.ts) treat dates as strings.
export const api = treaty<App>(typeof window === "undefined" ? "http://localhost:3000" : window.location.origin, {
  parseDate: false,
});

// Response types, derived from the server schemas (no hand-written shapes).
export type {
  EntryDetailT as EntryDetail,
  EntrySummaryT as EntrySummary,
  EvidenceFileT as EvidenceFile,
  EntryInputT as EntryInput,
} from "../../server/models";
import type { KsbStats as KsbStatsSchema, Ksb as KsbSchema, KsbDetail as KsbDetailSchema } from "../../server/models";
export type KsbStats = typeof KsbStatsSchema.static;
export type Ksb = typeof KsbSchema.static;
export type KsbDetail = typeof KsbDetailSchema.static;
import type { ImportPreview as ImportPreviewSchema } from "../../server/models";
export type ImportPreview = typeof ImportPreviewSchema.static;
export type { ImportColumnsT as ImportColumns, ImportRowT as ImportRow } from "../../server/models";

/** Eden error -> readable message (service errors are `{ error }`, validation is Elysia's 422 body). */
export function errorMessage(error: { status: unknown; value: unknown } | null | undefined): string {
  if (!error) return "";
  const v = error.value as { error?: string; summary?: string; message?: string } | string | undefined;
  if (typeof v === "string") return v;
  return v?.error ?? v?.summary ?? v?.message ?? `Request failed (${String(error.status)})`;
}
