import { Elysia } from "elysia";
import { getDb } from "../db/client";
import { Settings, SettingsPatch } from "../models";
import { getSettings, updateSettings } from "../services/settings";

export const settingsRoutes = new Elysia({ prefix: "/settings" })
  .get("/", () => getSettings(getDb()), { response: Settings })
  .patch("/", ({ body }) => updateSettings(getDb(), body), { body: SettingsPatch, response: Settings });
