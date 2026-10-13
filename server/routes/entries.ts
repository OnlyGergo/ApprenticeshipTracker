import { Elysia, t } from "elysia";
import { getDb } from "../db/client";
import { EntryDetail, EntryFilters, EntryInput, EntryPatch, EntrySummary, IsoDate, OtjSummary, Stale } from "../models";
import { createEntry, deleteEntry, getEntry, otjSummary, setEntryKsbBest, updateEntry } from "../services/entries";
import { searchEntries } from "../services/search";
import { getSettings } from "../services/settings";
import { staleness } from "../services/stats";

const Id = t.Object({ id: t.Numeric({ minimum: 1 }) });

export const entryRoutes = new Elysia({ prefix: "/entries" })
  .get("/", ({ query }) => searchEntries(getDb(), { limit: 200, ...query }), {
    query: EntryFilters,
    response: t.Array(EntrySummary),
  })
  .get("/otj", ({ query }) => otjSummary(getDb(), query.from, query.to), {
    query: t.Object({ from: t.Optional(IsoDate), to: t.Optional(IsoDate) }),
    response: OtjSummary,
  })
  .get("/stale", () => ({ ...staleness(getDb()), stale_after_days: getSettings(getDb()).stale_after_days }), { response: Stale })
  .post("/", ({ body, set }) => ((set.status = 201), createEntry(getDb(), body)), { body: EntryInput, response: { 201: EntryDetail } })
  .get("/:id", ({ params }) => getEntry(getDb(), params.id), { params: Id, response: EntryDetail })
  .patch("/:id", ({ params, body }) => updateEntry(getDb(), params.id, body), { params: Id, body: EntryPatch, response: EntryDetail })
  .delete("/:id", ({ params, set }) => ((set.status = 204), deleteEntry(getDb(), params.id)), { params: Id })
  .put("/:id/ksbs/:code/best", ({ params, body }) => setEntryKsbBest(getDb(), params.id, params.code, body.best_evidence), {
    params: t.Object({ id: t.Numeric({ minimum: 1 }), code: t.String() }),
    body: t.Object({ best_evidence: t.Boolean() }),
    response: EntryDetail,
  });
