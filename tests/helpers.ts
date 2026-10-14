/** Logs in through the real endpoint and returns the session cookie for later requests. */
export async function signIn(app: { handle(req: Request): Promise<Response> }, password: string): Promise<string> {
  const res = await app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "tester", password }),
    }),
  );
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}
