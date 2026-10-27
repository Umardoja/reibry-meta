import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

test("production app serves the foundation page and its stylesheet", async () => {
  const portReservation = createServer();
  portReservation.listen(0, "127.0.0.1");
  await once(portReservation, "listening");
  const { port } = portReservation.address();
  await new Promise((resolve) => portReservation.close(resolve));

  const server = spawn(process.execPath, [
    "node_modules/next/dist/bin/next", "start",
    "--hostname", "127.0.0.1", "--port", String(port),
  ], {
    windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", AUTH_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (data) => { output += data; });
  server.stderr.on("data", (data) => { output += data; });
  const exited = once(server, "exit");
  const origin = "http://127.0.0.1:" + port;

  try {
    let response;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(output);
      try {
        response = await fetch(origin, { signal: AbortSignal.timeout(10_000) });
        break;
      } catch { await delay(200); }
    }
    assert.ok(response, "Server failed to start: " + output);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<html[^>]*lang="en"/);
    assert.match(html, /<title>REIBRY/);
    assert.match(html, /<main[^>]*id="main"/);
    assert.match(html, /<h1[^>]*>From Saved/);
    assert.match(html, /to Done/);
    assert.match(html, /A personal AI memory and action platform\./);
    assert.match(html, /Meta Edition — Application Foundation/);
    assert.match(html, /About this foundation/);
    assert.match(html, /<dialog[^>]*aria-labelledby=/);
    assert.match(html, /<label for="preview-label">Example text field/);
    assert.doesNotMatch(html, /href="\/(memories|capture|plans|settings)"/);
    const stylesheet = html.match(/<link[^>]*href="([^"]+\.css[^"]*)"/)?.[1];
    assert.ok(stylesheet, "Rendered page must include its CSS");
    const cssResponse = await fetch(new URL(stylesheet.replaceAll("&amp;", "&"), origin));
    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.headers.get("content-type"), /text\/css/);
    const auth = await fetch(origin + "/auth");
    assert.equal(auth.status, 200);
    const authHtml = await auth.text();
    assert.match(authHtml, /Sign in securely/);
    assert.match(authHtml, /Authentication is not configured/);
    const session = await fetch(origin + "/api/auth/session");
    assert.deepEqual((await session.json()).data, { user: null });
    assert.match(session.headers.get("cache-control"), /no-store/);
    const protectedResponse = await fetch(origin + "/api/auth/me");
    assert.equal(protectedResponse.status, 401);
    const account = await fetch(origin + "/account", { redirect: "manual" });
    assert.equal(account.status, 307);
    assert.match(account.headers.get("location"), /\/auth\?next=/);
    const rejected = await fetch(origin + "/api/auth/sign-in", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "person@example.test", password: "test-only-password" }) });
    assert.equal(rejected.status, 503);
    assert.equal((await rejected.json()).error.code, "AUTH_NOT_CONFIGURED");
    const logout = await fetch(origin + "/api/auth/sign-out", { method: "POST", headers: { Origin: origin } });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /HttpOnly/i);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/i);
    const csrf = await fetch(origin + "/api/auth/sign-out", { method: "POST", headers: { Origin: "https://outside.test" } });
    assert.equal(csrf.status, 403);
    const missing = await fetch(origin + "/not-a-real-route");
    assert.equal(missing.status, 404);
  } finally {
    server.kill();
    await exited;
  }
});
