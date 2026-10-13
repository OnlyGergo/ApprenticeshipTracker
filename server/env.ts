import { resolve } from "node:path";

function required(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return value;
}

export const env = {
  get authUser() {
    return required("BASIC_AUTH_USER");
  },
  get authPassHash() {
    const hash = required("BASIC_AUTH_PASS_HASH");
    // An unescaped `$` in .env gets expanded by Bun and silently mangles the hash.
    if (!hash.startsWith("$argon2") && !hash.startsWith("$2")) {
      throw new Error("BASIC_AUTH_PASS_HASH looks mangled: write each `$` as `\\$` (use `bun run hash-password`)");
    }
    return hash;
  },
  // Getter so tests can point DATA_DIR at a temp dir after import.
  get dataDir() {
    return resolve(Bun.env.DATA_DIR ?? "./data");
  },
  port: Number(Bun.env.PORT ?? 3000),
  isProd: Bun.env.NODE_ENV === "production",
};
