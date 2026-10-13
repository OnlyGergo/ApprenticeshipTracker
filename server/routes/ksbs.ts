import { Elysia, t } from "elysia";
import { getDb } from "../db/client";
import { Ksb, KsbDetail, KsbStats } from "../models";
import { ksbDetail } from "../services/ksbs";
import { ksbStats } from "../services/stats";

export const ksbRoutes = new Elysia({ prefix: "/ksbs" })
  .get(
    "/",
    () => getDb().query<typeof Ksb.static, []>("SELECT id, code, title, category FROM ksbs ORDER BY sort_order, code").all(),
    { response: t.Array(Ksb) },
  )
  .get("/stats", () => ksbStats(getDb()), { response: t.Array(KsbStats) })
  .get("/:code", ({ params }) => ksbDetail(getDb(), params.code), { response: KsbDetail });
