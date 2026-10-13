import { Elysia, t } from "elysia";
import { getDb } from "../db/client";

const Ksb = t.Object({
  id: t.Number(),
  code: t.String(),
  title: t.String(),
  category: t.Union([t.Literal("knowledge"), t.Literal("skill"), t.Literal("behaviour")]),
});

// Stage 1 skeleton: list only. Stats/detail come in stage 3.
export const ksbRoutes = new Elysia({ prefix: "/ksbs" }).get(
  "/",
  () => getDb().query<typeof Ksb.static, []>("SELECT id, code, title, category FROM ksbs ORDER BY sort_order, code").all(),
  { response: t.Array(Ksb) },
);
