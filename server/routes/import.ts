import { Elysia, t } from "elysia";
import { getDb } from "../db/client";
import { EntryInput, ImportColumns, ImportPreview } from "../models";
import { commitImport, previewCsv, previewText } from "../services/importer";

export const importRoutes = new Elysia({ prefix: "/import" })
  .post(
    "/preview",
    ({ body }) => (body.kind === "csv" ? previewCsv(getDb(), body.content, body.columns) : previewText(getDb(), body.content)),
    {
      body: t.Object({
        kind: t.Union([t.Literal("csv"), t.Literal("text")]),
        content: t.String({ maxLength: 20_000_000 }),
        columns: t.Optional(t.Partial(ImportColumns)),
      }),
      response: ImportPreview,
    },
  )
  .post("/commit", ({ body, set }) => ((set.status = 201), commitImport(getDb(), body.entries)), {
    body: t.Object({ entries: t.Array(EntryInput, { minItems: 1 }) }),
    response: { 201: t.Object({ created: t.Number(), ids: t.Array(t.Number()) }) },
  });
