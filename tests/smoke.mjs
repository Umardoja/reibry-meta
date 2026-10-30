import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

test("production app serves the restored REIBRY shell and its stylesheet", async () => {
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
    assert.match(html, /Checking your session/);
    assert.match(html, /HomeConversation/);
    assert.match(html, /aria-label="Main navigation"/);
    assert.match(html, /href="\/plans"/);
    assert.match(html, /href="\/settings"/);
    assert.match(html, /href="\/memories"/);
    assert.match(html, /href="\/capture"/);
    assert.match(html, /href="\/ask"/);
    assert.match(html, /href="\/actions"/);
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
    const memories = await fetch(origin + "/api/memories");
    assert.equal(memories.status, 401);
    assert.equal((await memories.json()).error.code, "AUTH_REQUIRED");
    const memoryCreate = await fetch(origin + "/api/memories", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "must not persist without a session" }) });
    assert.equal(memoryCreate.status, 401);
    const captureCreate = await fetch(origin + "/api/capture", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "text", content: "must not persist without a session" }) });
    assert.equal(captureCreate.status, 401);
    const search = await fetch(origin + "/api/memories/search?q=private&limit=10");
    assert.equal(search.status, 401);
    assert.equal((await search.json()).error.code, "AUTH_REQUIRED");
    const ask = await fetch(origin + "/api/ai/ask", { method: "POST", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ question: "private" }) });
    assert.equal(ask.status, 401);
    assert.equal((await ask.json()).error.code, "AUTH_REQUIRED");
    const actions = await fetch(origin + "/api/actions");
    assert.equal(actions.status, 401);
    assert.equal((await actions.json()).error.code, "AUTH_REQUIRED");
    const proposals = await fetch(origin + "/api/actions/proposals");
    assert.equal(proposals.status, 401);
    const life = await fetch(origin + "/api/life");
    assert.equal(life.status, 401);
    assert.equal((await life.json()).error.code, "AUTH_REQUIRED");
    const today = await fetch(origin + "/api/today");
    assert.equal(today.status, 401);
    assert.equal((await today.json()).error.code, "AUTH_REQUIRED");
    const home = await fetch(origin + "/api/home", { method: "POST", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Find my saved notes", timezone: "UTC" }) });
    assert.equal(home.status, 401);
    assert.equal((await home.json()).error.code, "AUTH_REQUIRED");
    const lifeCreate = await fetch(origin + "/api/life/create", {
      method: "POST", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "must not persist without a session", timezone: "UTC" }),
    });
    assert.equal(lifeCreate.status, 401);
    const lifeUpdate = await fetch(origin + "/api/life/10000000-0000-4000-8000-000000000001", {
      method: "PATCH", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "must not update" }),
    });
    assert.equal(lifeUpdate.status, 401);
    const lifeDelete = await fetch(origin + "/api/life/10000000-0000-4000-8000-000000000001", {
      method: "DELETE", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
    });
    assert.equal(lifeDelete.status, 401);
    const confirm = await fetch(origin + "/api/actions/proposals/10000000-0000-4000-8000-000000000001/confirm", {
      method: "POST", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
    });
    assert.equal(confirm.status, 401);
    const account = await fetch(origin + "/account", { redirect: "manual" });
    assert.equal(account.status, 307);
    assert.match(account.headers.get("location"), /\/auth\?next=/);
    const memoryPage = await fetch(origin + "/memories", { redirect: "manual" });
    assert.equal(memoryPage.status, 307);
    assert.match(memoryPage.headers.get("location"), /\/auth\?next=/);
    const capturePage = await fetch(origin + "/capture", { redirect: "manual" });
    assert.equal(capturePage.status, 307);
    assert.match(capturePage.headers.get("location"), /\/auth\?next=/);
    const askPage = await fetch(origin + "/ask", { redirect: "manual" });
    assert.equal(askPage.status, 307);
    assert.match(askPage.headers.get("location"), /\/auth\?next=/);
    const actionsPage = await fetch(origin + "/actions", { redirect: "manual" });
    assert.equal(actionsPage.status, 307);
    assert.match(actionsPage.headers.get("location"), /\/auth\?next=/);
    const lifePage = await fetch(origin + "/life", { redirect: "manual" });
    assert.equal(lifePage.status, 307);
    assert.match(lifePage.headers.get("location"), /\/auth\?next=/);
    const lifeManagePage = await fetch(origin + "/life/manage", { redirect: "manual" });
    assert.equal(lifeManagePage.status, 307);
    assert.match(lifeManagePage.headers.get("location"), /\/auth\?next=/);
    const todayPage = await fetch(origin + "/today", { redirect: "manual" });
    assert.equal(todayPage.status, 307);
    assert.match(todayPage.headers.get("location"), /\/auth\?next=/);
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
