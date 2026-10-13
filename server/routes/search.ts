import { Elysia, t } from "elysia";
import { getDb } from "../db/client";
import { EntryFilters, EntrySummary, EvidenceFile } from "../models";
import { searchEntries, searchEvidence } from "../services/search";

export const searchRoutes = new Elysia({ prefix: "/search" }).get(
  "/",
  ({ query }) => {
    const f = { limit: 200, ...query };
    return { entries: searchEntries(getDb(), f), evidence: searchEvidence(getDb(), f) };
  },
  { query: EntryFilters, response: t.Object({ entries: t.Array(EntrySummary), evidence: t.Array(EvidenceFile) }) },
);
