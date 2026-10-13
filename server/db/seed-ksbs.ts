import type { Database } from "bun:sqlite";
import { getDb } from "./client";
import { migrate } from "./migrate";

export type KsbSeed = { code: string; title: string; category: "knowledge" | "skill" | "behaviour" };

const CATEGORY_PREFIX = { K: "knowledge", S: "skill", B: "behaviour" } as const;

/** K2 -> 1002, S10 -> 2010, B1 -> 3001: keeps the natural K/S/B and numeric order. */
export function sortOrder(code: string): number {
  const match = /^([KSB])(\d+)$/i.exec(code.trim());
  if (!match) return 9999;
  return ("KSB".indexOf(match[1]!.toUpperCase()) + 1) * 1000 + Number(match[2]);
}

export function validateSeed(rows: unknown): KsbSeed[] {
  if (!Array.isArray(rows)) throw new Error("ksbs.json must be an array");
  return rows.map((row, i) => {
    const { code, title, category } = (row ?? {}) as Record<string, unknown>;
    if (typeof code !== "string" || typeof title !== "string") throw new Error(`ksbs.json[${i}]: code and title are required`);
    const prefix = code.trim()[0]?.toUpperCase() as keyof typeof CATEGORY_PREFIX | undefined;
    const cat = category ?? (prefix ? CATEGORY_PREFIX[prefix] : undefined);
    if (cat !== "knowledge" && cat !== "skill" && cat !== "behaviour") throw new Error(`ksbs.json[${i}]: bad category`);
    return { code: code.trim().toUpperCase(), title: title.trim(), category: cat };
  });
}

/** Upsert by code, so editing ksbs.json and re-running updates titles without touching links. */
export function seedKsbs(db: Database, rows: KsbSeed[]): number {
  const upsert = db.prepare(
    `INSERT INTO ksbs (code, title, category, sort_order) VALUES ($code, $title, $category, $sort)
     ON CONFLICT(code) DO UPDATE SET title = excluded.title, category = excluded.category, sort_order = excluded.sort_order`,
  );
  db.transaction(() => {
    for (const r of rows) upsert.run({ code: r.code, title: r.title, category: r.category, sort: sortOrder(r.code) });
  })();
  return rows.length;
}

if (import.meta.main) {
  const file = Bun.argv[2] ?? new URL("./ksbs.json", import.meta.url).pathname;
  const db = getDb();
  await migrate(db);
  const count = seedKsbs(db, validateSeed(await Bun.file(file).json()));
  console.log(`Seeded ${count} KSBs from ${file}`);
}
