import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

const REALM = 'Basic realm="KSB Tracker", charset="UTF-8"';

// Argon2 verify is deliberately slow; remember headers that already passed so every
// asset request doesn't pay for it. Single user, so this stays tiny.
const verified = new Set<string>();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function isAuthorised(header: string | null): Promise<boolean> {
  if (!header?.startsWith("Basic ")) return false;
  if (verified.has(header)) return true;

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  const ok = safeEqual(user, env.authUser) && (await Bun.password.verify(pass, env.authPassHash).catch(() => false));
  if (ok) verified.add(header);
  return ok;
}

export function unauthorised(): Response {
  return new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": REALM } });
}
