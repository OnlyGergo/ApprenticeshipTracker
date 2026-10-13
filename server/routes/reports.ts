import { Elysia } from "elysia";
import { getDb } from "../db/client";
import { CoverageReport, GapReport } from "../models";
import { coverage, gapReport } from "../services/reports";

export const reportRoutes = new Elysia({ prefix: "/reports" })
  .get("/coverage", () => coverage(getDb()), { response: CoverageReport })
  .get("/gaps", () => gapReport(getDb()), { response: GapReport });
