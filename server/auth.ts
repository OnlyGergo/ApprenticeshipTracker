import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const SESSION_COOKIE = "ksb_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Sessions live in memory: single user, local tool, so a restart just means signing in again.
const sessions = new Map<string, number>();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checks the single user's credentials. The hash check is deliberately slow (argon2). */
export async function verifyCredentials(user: string, pass: string): Promise<boolean> {
  const userOk = safeEqual(user, env.authUser);
  // Verify even on a wrong username so timing doesn't reveal which half was wrong.
  const passOk = await Bun.password.verify(pass, env.authPassHash).catch(() => false);
  return userOk && passOk;
}

export function createSession(): { token: string; expires: Date } {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, expiresAt);
  return { token, expires: new Date(expiresAt) };
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export function isAuthenticated(cookieHeader: string | null): boolean {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (expiresAt === undefined) return false;
  if (expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** Set-Cookie value. HttpOnly + SameSite=Strict; Secure only when served over https. */
export function sessionCookie(value: string, expires: Date | null, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (expires) parts.push(`Expires=${expires.toUTCString()}`);
  else parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
