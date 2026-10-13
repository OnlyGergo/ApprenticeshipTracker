import { Elysia, t } from "elysia";
import { createBackup, restoreBackup } from "../services/backup";
import { londonToday } from "../services/stats";

export const exportRoutes = new Elysia({ prefix: "/export" })
  .get(
    "/backup",
    () =>
      new Response(new Blob([createBackup() as Uint8Array<ArrayBuffer>]), {
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="ksb-tracker-backup-${londonToday()}.zip"`,
          "cache-control": "no-store",
        },
      }),
  )
  .post("/restore", async ({ body }) => restoreBackup(new Uint8Array(await body.file.arrayBuffer())), {
    body: t.Object({ file: t.File({ maxSize: "1024m" }) }),
    response: t.Object({ entries: t.Number(), files: t.Number(), missing_files: t.Number() }),
  });
