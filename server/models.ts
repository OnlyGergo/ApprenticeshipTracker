// Shared request/response schemas. Types flow to the frontend via Eden.
import { t } from "elysia";

export const IsoDate = t.String({ pattern: String.raw`^\d{4}-\d{2}-\d{2}$`, examples: ["2026-10-13"] });
export const HhMm = t.String({ pattern: String.raw`^([01]\d|2[0-3]):[0-5]\d$`, examples: ["09:00"] });
export const KsbCode = t.String({ pattern: String.raw`^[KSBksb]\d{1,3}$` });
export const Quality = t.Integer({ minimum: 1, maximum: 5 });

export const Category = t.Union([t.Literal("knowledge"), t.Literal("skill"), t.Literal("behaviour")]);
export const Ksb = t.Object({ id: t.Number(), code: t.String(), title: t.String(), category: Category });

export const Star = t.Object({ situation: t.Boolean(), task: t.Boolean(), action: t.Boolean(), result: t.Boolean() });

export const KsbStats = t.Object({
  ksb_id: t.Number(),
  code: t.String(),
  title: t.String(),
  category: t.String(),
  entry_count: t.Number(),
  evidence_count: t.Number(),
  evidence_by_quality: t.Array(t.Number()),
  has_best_evidence: t.Boolean(),
  last_touched: t.Nullable(t.String()),
  light: t.Union([t.Literal("red"), t.Literal("yellow"), t.Literal("green")]),
});

export const EvidenceFile = t.Object({
  id: t.Number(),
  entry_id: t.Nullable(t.Number()),
  ksb_id: t.Nullable(t.Number()),
  ksb_code: t.Nullable(t.String()),
  original_name: t.String(),
  mime: t.String(),
  size: t.Number(),
  quality: t.Number(),
  best_evidence: t.Boolean(),
  uploaded_at: t.String(),
  url: t.String(),
});

export const EntrySummary = t.Object({
  id: t.Number(),
  date: t.String(),
  start_time: t.String(),
  end_time: t.String(),
  minutes: t.Number(),
  text: t.String(),
  chain_root_id: t.Nullable(t.Number()),
  chain_index: t.Number(),
  star: Star,
  ksbs: t.Array(t.String()),
  evidence_count: t.Number(),
});

export const EntryKsb = t.Object({
  ksb_id: t.Number(),
  code: t.String(),
  title: t.String(),
  explanation: t.String(),
  best_evidence: t.Boolean(),
});

export const ChainMember = t.Object({
  id: t.Number(),
  start_time: t.String(),
  end_time: t.String(),
  chain_index: t.Number(),
  minutes: t.Number(),
});

export const EntryDetail = t.Object({
  ...t.Omit(EntrySummary, ["ksbs"]).properties,
  ksbs: t.Array(EntryKsb),
  evidence: t.Array(EvidenceFile),
  chain: t.Array(ChainMember), // every entry in this entry's chain, root first
  chain_minutes: t.Number(),
});

export const EntryKsbInput = t.Object({
  code: KsbCode,
  explanation: t.Optional(t.String()),
  best_evidence: t.Optional(t.Boolean()),
});

export const EntryInput = t.Object({
  date: IsoDate,
  start_time: HhMm,
  end_time: HhMm,
  text: t.String({ minLength: 1 }),
  ksbs: t.Optional(t.Array(EntryKsbInput)),
  star: t.Optional(t.Partial(Star)),
});
export const EntryPatch = t.Partial(EntryInput);

export const KsbEntry = t.Object({ ...EntrySummary.properties, explanation: t.String(), best_evidence: t.Boolean() });
export const KsbDetail = t.Object({ stats: KsbStats, entries: t.Array(KsbEntry), evidence: t.Array(EvidenceFile) });

export const OtjSummary = t.Object({
  chains: t.Array(
    t.Object({ root_id: t.Number(), date: t.String(), text: t.String(), minutes: t.Number(), entry_ids: t.Array(t.Number()) }),
  ),
  total_minutes: t.Number(),
});

export const Stale = t.Object({
  last_entry_date: t.Nullable(t.String()),
  days_since: t.Nullable(t.Number()),
  stale_after_days: t.Number(),
});

export const Settings = t.Object({
  start_date: t.Nullable(IsoDate), // apprenticeship start, anchors the target line
  gateway_date: t.Nullable(IsoDate), // EPA gateway, where the target line ends
  target_hours: t.Nullable(t.Number({ minimum: 0 })), // OTJ hours needed by the gateway
  stale_after_days: t.Integer({ minimum: 1, maximum: 365 }),
});
export const SettingsPatch = t.Partial(Settings);

export const CoverageReport = t.Object({
  points: t.Array(
    t.Object({
      date: t.String(),
      hours: t.Nullable(t.Number()),
      ksbs: t.Nullable(t.Number()),
      target_hours: t.Nullable(t.Number()),
    }),
  ),
  ksb_total: t.Number(),
  total_hours: t.Number(),
  target_hours: t.Nullable(t.Number()),
  target_to_date: t.Nullable(t.Number()),
  start_date: t.Nullable(t.String()),
  gateway_date: t.Nullable(t.String()),
});

export const GapReport = t.Object({
  today: t.String(),
  gateway_date: t.Nullable(t.String()),
  days_to_gateway: t.Nullable(t.Number()),
  total: t.Number(),
  red: t.Number(),
  yellow: t.Number(),
  green: t.Number(),
  items: t.Array(t.Object({ ...KsbStats.properties, reasons: t.Array(t.String()) })),
});

const ColumnIndex = t.Nullable(t.Integer({ minimum: 0 }));
export const ImportColumns = t.Object({
  date: ColumnIndex,
  start: ColumnIndex,
  end: ColumnIndex,
  duration: ColumnIndex,
  text: ColumnIndex,
});
export const ImportRow = t.Object({
  row: t.Number(), // CSV line number (header = 1), or block number for a paste
  date: t.Nullable(t.String()),
  start_time: t.Nullable(t.String()),
  end_time: t.Nullable(t.String()),
  text: t.String(),
  ksbs: t.Array(t.Object({ code: t.String(), explanation: t.String() })),
  warnings: t.Array(t.String()),
  errors: t.Array(t.String()), // row can't be imported until these are fixed
  duplicate: t.Boolean(), // same date/times/text already exists (or appears earlier in this file)
});
export const ImportPreview = t.Object({
  headers: t.Array(t.String()),
  columns: ImportColumns,
  rows: t.Array(ImportRow),
});

/** Shared by GET /entries and GET /search. */
export const EntryFilters = t.Object({
  q: t.Optional(t.String()),
  ksb: t.Optional(KsbCode),
  from: t.Optional(IsoDate),
  to: t.Optional(IsoDate),
  quality_min: t.Optional(t.Numeric({ minimum: 1, maximum: 5 })),
  quality_max: t.Optional(t.Numeric({ minimum: 1, maximum: 5 })),
  best: t.Optional(t.BooleanString()),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 1000 })),
  offset: t.Optional(t.Numeric({ minimum: 0 })),
});

export type EntryInputT = typeof EntryInput.static;
export type EntryPatchT = typeof EntryPatch.static;
export type EntrySummaryT = typeof EntrySummary.static;
export type EntryDetailT = typeof EntryDetail.static;
export type EvidenceFileT = typeof EvidenceFile.static;
export type SettingsT = typeof Settings.static;
export type ImportColumnsT = typeof ImportColumns.static;
export type ImportRowT = typeof ImportRow.static;
export type EntryFiltersT = typeof EntryFilters.static;
