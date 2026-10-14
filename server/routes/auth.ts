import { Elysia, t } from "elysia";
import { createSession, destroySession, isAuthenticated, readCookie, SESSION_COOKIE, sessionCookie, verifyCredentials } from "../auth";
import { HttpError } from "../lib/errors";

const isSecure = (url: string) => new URL(url).protocol === "https:";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .get("/me", ({ request, set }) => {
    if (!isAuthenticated(request.headers.get("cookie"))) {
      set.status = 401;
      return { authenticated: false as const };
    }
    return { authenticated: true as const };
  })
  .post(
    "/login",
    async ({ body, request, set }) => {
      if (!(await verifyCredentials(body.username, body.password))) {
        throw new HttpError(401, "Wrong username or password");
      }
      const { token, expires } = createSession();
      set.headers["set-cookie"] = sessionCookie(token, expires, isSecure(request.url));
      return { ok: true as const };
    },
    { body: t.Object({ username: t.String({ maxLength: 200 }), password: t.String({ maxLength: 1000 }) }) },
  )
  .post("/logout", ({ request, set }) => {
    destroySession(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
    set.headers["set-cookie"] = sessionCookie("", null, isSecure(request.url));
    return { ok: true as const };
  });
