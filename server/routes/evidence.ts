import { Elysia, t } from "elysia";
import { getDb } from "../db/client";
import { EvidenceFile, KsbCode, Quality } from "../models";
import { deleteEvidence, evidenceRow, getEvidence, isInlineSafe, updateEvidence, uploadEvidence } from "../services/evidence";
import { absPath } from "../storage/uploads";

const Id = t.Object({ id: t.Numeric({ minimum: 1 }) });

export const evidenceRoutes = new Elysia({ prefix: "/evidence" })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return uploadEvidence(getDb(), body);
    },
    {
      // multipart/form-data
      body: t.Object({
        file: t.File({ maxSize: "50m" }),
        quality: t.Numeric({ minimum: 1, maximum: 5, multipleOf: 1 }),
        entry_id: t.Optional(t.Numeric({ minimum: 1 })),
        ksb: t.Optional(KsbCode),
        best_evidence: t.Optional(t.BooleanString()),
      }),
      response: { 201: EvidenceFile },
    },
  )
  .get("/:id", ({ params }) => getEvidence(getDb(), params.id), { params: Id, response: EvidenceFile })
  .get(
    "/:id/file",
    ({ params }) => {
      const row = evidenceRow(getDb(), params.id);
      const name = encodeURIComponent(row.original_name);
      return new Response(Bun.file(absPath(row.path)), {
        headers: {
          "content-type": row.mime,
          "content-disposition": `${isInlineSafe(row.mime) ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
          "x-content-type-options": "nosniff",
          "content-security-policy": "sandbox",
        },
      });
    },
    { params: Id },
  )
  .patch("/:id", ({ params, body }) => updateEvidence(getDb(), params.id, body), {
    params: Id,
    body: t.Object({ quality: t.Optional(Quality), best_evidence: t.Optional(t.Boolean()) }),
    response: EvidenceFile,
  })
  .delete("/:id", ({ params, set }) => ((set.status = 204), deleteEvidence(getDb(), params.id)), { params: Id });
