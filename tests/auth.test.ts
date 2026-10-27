import assert from "node:assert/strict";
import test from "node:test";
import { handleAuth, type AuthAdapter } from "../src/lib/auth/handler.ts";
import { AuthFailure, bounded, credentials, missingSession, providerFailure, safeNext } from "../src/lib/auth/policy.ts";
import { canShowProtected, checkSession, initialSession, sessionReducer, type SessionState } from "../src/lib/auth/session.ts";
import { authConfig } from "../src/lib/supabase/config.ts";
import { cookieJar, cookieKey } from "../src/lib/supabase/cookies.ts";
import { createAuthAdapter } from "../src/lib/supabase/server.ts";

const origin = "http://localhost:3000";
const input = { email: "person@example.test", password: "test-only-password" };
function request(operation: string, body: unknown = input, source = origin) {
  return new Request(origin + "/api/auth/" + operation, { method: "POST", headers: { Origin: source, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function adapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return { signIn: async () => {}, signUp: async () => ({ requiresConfirmation: true }),
    verify: async () => ({ id: "test-user" }), signOut: async () => {}, exchange: async () => {}, ...overrides };
}
const get = (operation: string) => new Request(origin + "/api/auth/" + operation);

test("successful sign-in validates input and returns no session tokens", async () => {
  let called = false;
  const result = await handleAuth("sign-in", request("sign-in"), () => adapter({ signIn: async (email, password) => {
    assert.equal(email, input.email); assert.equal(password, input.password); called = true;
  } }), false);
  assert.equal(called, true); assert.deepEqual(result.data, { signedIn: true }); assert.equal(result.status, 200);
});
test("sign-up preserves confirmation and safe return destination without fake profile", async () => {
  const result = await handleAuth("sign-up", request("sign-up", { ...input, next: "//outside.test" }), () => adapter({
    signUp: async (_, __, next) => { assert.equal(next, "/account"); return { requiresConfirmation: true }; },
  }), false);
  assert.deepEqual(result.data, { requiresConfirmation: true });
});
test("immediately confirmed sign-up has explicit response", async () => {
  const result = await handleAuth("sign-up", request("sign-up"), () => adapter({ signUp: async () => ({ requiresConfirmation: false }) }), false);
  assert.deepEqual(result.data, { requiresConfirmation: false });
});
test("invalid password returns safe 401", async () => {
  const result = await handleAuth("sign-in", request("sign-in"), () => adapter({ signIn: async () => { throw new AuthFailure("INVALID_CREDENTIALS"); } }), false);
  assert.equal(result.status, 401); assert.equal(result.error?.code, "INVALID_CREDENTIALS");
});
test("invalid email and weak signup password reject before provider initialization", async () => {
  let calls = 0;
  const factory = () => { calls++; return adapter(); };
  assert.equal((await handleAuth("sign-in", request("sign-in", { ...input, email: "invalid" }), factory, false)).status, 400);
  assert.equal((await handleAuth("sign-up", request("sign-up", { ...input, password: "short" }), factory, false)).error?.code, "WEAK_PASSWORD");
  assert.equal(calls, 0);
  assert.throws(() => credentials(null, false), AuthFailure);
});
test("provider unavailable never exposes private error details", async () => {
  const result = await handleAuth("sign-in", request("sign-in"), () => adapter({ signIn: async () => { throw new Error("private provider response"); } }), false);
  assert.equal(result.status, 503); assert.equal(result.error?.code, "AUTH_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(result), /private provider/);
});
test("provider timeout aborts work and cannot leave a pending request", async () => {
  let signal: AbortSignal | undefined;
  const result = await handleAuth("session", get("session"), s => {
    signal = s; return adapter({ verify: () => new Promise(() => {}) });
  }, true, 10);
  assert.equal(result.status, 504); assert.equal(result.error?.code, "AUTH_TIMEOUT"); assert.equal(signal?.aborted, true);
});
test("missing configuration is a clear 503 and does not grant access", async () => {
  const result = await handleAuth("sign-in", request("sign-in"), () => { authConfig({}); return adapter(); }, false);
  assert.equal(result.status, 503); assert.equal(result.error?.code, "AUTH_NOT_CONFIGURED");
});
test("expired session is cleared and protected endpoint refuses it", async () => {
  const result = await handleAuth("me", get("me"), () => adapter({ verify: async () => null }), true);
  assert.equal(result.status, 401); assert.equal(result.clearSession, true); assert.equal(result.data, null);
  assert.equal(missingSession({ code: "refresh_token_not_found" }), true);
  assert.equal(missingSession({ status: 503 }), false);
});
test("no cookies means no provider call and no protected data", async () => {
  const factory = () => { throw new Error("must not call"); };
  assert.deepEqual((await handleAuth("session", get("session"), factory, false)).data, { user: null });
  assert.equal((await handleAuth("me", get("me"), factory, false)).status, 401);
});
test("verified protected response is minimal", async () => {
  const result = await handleAuth("me", get("me"), () => adapter(), true);
  assert.deepEqual(result.data, { user: { id: "test-user" } });
});
test("sign-out clears local cookies on success, missing config, or timeout", async () => {
  const success = await handleAuth("sign-out", request("sign-out"), () => adapter(), true);
  assert.deepEqual(success.data, { signedOut: true, remoteRevoked: true }); assert.equal(success.clearSession, true);
  const failure = await handleAuth("sign-out", request("sign-out"), () => { throw new AuthFailure("AUTH_NOT_CONFIGURED"); }, true);
  assert.deepEqual(failure.data, { signedOut: true, remoteRevoked: false }); assert.equal(failure.clearSession, true);
  const timeout = await handleAuth("sign-out", request("sign-out"), () => adapter({ signOut: () => new Promise(() => {}) }), true, 10);
  assert.equal(timeout.clearSession, true); assert.equal(timeout.data?.remoteRevoked, false);
});
test("cross-site and absent Origin mutations fail before provider or cookie clearing", async () => {
  for (const source of ["https://outside.test", "null", ""]) {
    const result = await handleAuth("sign-out", request("sign-out", {}, source), () => adapter(), true);
    assert.equal(result.status, 403); assert.notEqual(result.clearSession, true);
  }
});
test("malformed JSON, oversized payload and wrong method fail safely", async () => {
  const malformed = new Request(origin, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{" });
  assert.equal((await handleAuth("sign-in", malformed, () => adapter(), false)).status, 400);
  assert.equal((await handleAuth("sign-in", request("sign-in", { text: "x".repeat(9000) }), () => adapter(), false)).status, 400);
  assert.equal((await handleAuth("session", request("session"), () => adapter(), true)).status, 405);
});
test("return destination only accepts implemented local routes", () => {
  for (const value of ["https://outside.test", "//outside.test", "/\\outside.test", "/\n/outside.test", "/%2foutside.test", "/%5coutside.test", "javascript:alert(1)", "/auth", "/api/auth/me", "/account?next=https://outside.test", undefined, null])
    assert.equal(safeNext(value), null);
  assert.equal(safeNext("/"), "/"); assert.equal(safeNext("/account"), "/account");
});
test("PKCE callback requires cookie, exchanges once, verifies user and bounds destination", async () => {
  const req = new Request(origin + "/auth/callback?code=test-code&next=//outside.test");
  assert.equal((await handleAuth("callback", req, () => adapter(), false)).error?.code, "INVALID_CALLBACK");
  let exchanges = 0;
  const result = await handleAuth("callback", req, () => adapter({ exchange: async code => { assert.equal(code, "test-code"); exchanges++; } }), true);
  assert.equal(exchanges, 1); assert.equal(result.destination, "/account");
  const invalid = await handleAuth("callback", req, () => adapter({ verify: async () => null }), true);
  assert.equal(invalid.destination, undefined);
});
test("all checking/error/anonymous states hide protected content, including stale results", () => {
  let state = sessionReducer(initialSession, { type: "result", version: 0, user: { id: "test-user" } });
  assert.equal(canShowProtected(state), true);
  state = sessionReducer(state, { type: "refresh" });
  assert.equal(canShowProtected(state), false); assert.equal(state.user, null);
  state = sessionReducer(state, { type: "result", version: 1, user: null, error: "AUTH_TIMEOUT" });
  assert.equal(canShowProtected(state), false);
  state = sessionReducer(state, { type: "result", version: 0, user: { id: "stale-user" } });
  assert.equal(state.user, null);
  const locked = sessionReducer({ ...state, status: "authenticated", user: { id: "test-user" } }, { type: "lock" });
  assert.equal(canShowProtected(locked), false);
  assert.equal(canShowProtected(sessionReducer(locked, { type: "signed-out" })), false);
});
test("manual retry budget is three total checks; no infinite loading or automatic retries", async () => {
  let calls = 0;
  const never: typeof fetch = async () => { calls++; return new Promise(() => {}); };
  const result = await checkSession(never, 10);
  assert.equal(result.error, "AUTH_TIMEOUT"); assert.equal(result.user, null); assert.equal(calls, 1);
  let state: SessionState = { ...initialSession };
  for (let attempt = 1; attempt <= 3; attempt++) {
    state = sessionReducer(state, { type: "result", version: state.version, user: null, error: "AUTH_TIMEOUT" });
    assert.equal(state.status, "error");
    state = sessionReducer(state, { type: "retry" });
  }
  assert.equal(state.attempts, 3); assert.equal(state.status, "error"); assert.equal(canShowProtected(state), false);
});
test("client rejects malformed successful session payload and masks provider errors", async () => {
  const malformed: typeof fetch = async () => Response.json({ data: { user: { id: "" } } });
  assert.equal((await checkSession(malformed)).error, "AUTH_UNAVAILABLE");
  const unavailable: typeof fetch = async () => Response.json({ error: { code: "private-detail", message: "private detail" } }, { status: 503 });
  assert.equal((await checkSession(unavailable)).error, "AUTH_UNAVAILABLE");
});
test("cookie isolation and late writes cannot overwrite original sessions", () => {
  const jar = cookieJar([{ name: "other-project-auth", value: "do-not-touch" }, { name: cookieKey + ".0", value: "test-only" }]);
  const controller = new AbortController(); controller.abort();
  jar.setAll([{ name: cookieKey, value: "late", options: {} }], controller.signal);
  assert.equal(jar.writes().length, 0);
  assert.equal(jar.getAll().length, 1);
  assert.ok(jar.clear().every(c => c.name.startsWith(cookieKey) && c.options.maxAge === 0));
});
const fakeConfig = { AUTH_ENABLED: "true", SUPABASE_URL: "https://unit-test.supabase.co", SUPABASE_PUBLISHABLE_KEY: ["sb", "publishable", "offline_test_only"].join("_"), AUTH_SITE_URL: origin };
test("configuration rejects disabled auth, privileged keys and unsafe URLs", () => {
  assert.equal(authConfig(fakeConfig).site, origin);
  for (const env of [{ ...fakeConfig, AUTH_ENABLED: "false" }, { ...fakeConfig, SUPABASE_PUBLISHABLE_KEY: "sb_secret_rejected" },
    { ...fakeConfig, SUPABASE_URL: "http://remote.test" }, { ...fakeConfig, AUTH_SITE_URL: "https://user:password@example.test" }])
    assert.throws(() => authConfig(env), AuthFailure);
});
test("real Supabase SDK sign-in uses mocked transport and SSR cookie hooks", async () => {
  const jar = cookieJar([]);
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.ok(String(url).startsWith(fakeConfig.SUPABASE_URL + "/auth/v1/token"));
    assert.equal(init?.method, "POST"); assert.ok(init?.signal);
    return Response.json({ access_token: "offline-test-access", refresh_token: "offline-test-refresh", token_type: "bearer",
      expires_in: 3600, user: { id: "test-user", aud: "authenticated", email: input.email } });
  };
  await bounded(signal => createAuthAdapter(jar, signal, origin, { env: fakeConfig, fetch: transport }).signIn(input.email, input.password));
  assert.equal(calls, 1); assert.ok(jar.writes().length > 0);
  assert.ok(jar.writes().every(c => c.options.httpOnly === true && c.options.sameSite === "lax" && c.name.startsWith(cookieKey)));
});
test("real SDK error response is mapped, not reflected", async () => {
  const transport: typeof fetch = async () => Response.json({ code: "invalid_credentials", msg: "private auth details" }, { status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" } });
  await assert.rejects(bounded(signal => createAuthAdapter(cookieJar([]), signal, origin, { env: fakeConfig, fetch: transport }).signIn(input.email, input.password)),
    error => error instanceof AuthFailure && error.code === "INVALID_CREDENTIALS" && !error.message.includes("private"));
  assert.equal(providerFailure({ status: 429 }).code, "RATE_LIMIT");
});
test("real SDK no-session check does not make an external call", async () => {
  const transport: typeof fetch = async () => { throw new Error("network forbidden"); };
  const result = await bounded(signal => createAuthAdapter(cookieJar([]), signal, origin, { env: fakeConfig, fetch: transport }).verify());
  assert.equal(result, null);
});

test("canonical origin respects explicit deployment origin and preserves exact loopback host", async () => {
  const { canonicalOrigin } = await import("../src/lib/auth/origin.ts");
  const request = new Request("http://localhost:3000/api/auth/sign-in", { headers: { Host: "127.0.0.1:3000" } });
  assert.equal(canonicalOrigin(request), "http://127.0.0.1:3000");
  assert.equal(canonicalOrigin(request, "https://app.example.test"), "https://app.example.test");
  assert.equal(canonicalOrigin(new Request(request.url, { headers: { Host: "outside.test" } })), "http://localhost:3000");
  assert.throws(() => canonicalOrigin(request, "http://outside.test"), AuthFailure);
  const response = await handleAuth("sign-out", new Request(request.url, { method: "POST", headers: { Origin: "https://outside.test" } }), () => adapter(), false, 20, "https://app.example.test");
  assert.equal(response.status, 403);
});
