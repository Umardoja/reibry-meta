import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createShortcutCredential, hashShortcutCredential, parseDeviceIssue } from "../src/lib/shortcut-capture/contracts.ts";
import { handleShortcutCapture } from "../src/lib/shortcut-capture/handler.ts";
import { ShortcutCaptureFailure } from "../src/lib/shortcut-capture/repository.ts";
import type { Memory, NewMemory } from "../src/lib/memory/contracts.ts";

const key = `rsc1_${"A".repeat(43)}`;
const requestId = "40000000-0000-4000-8000-000000000001";
const url = "https://www.tiktok.com/@baker.jo/video/7311223344556677889";
const request = (body: unknown, credential: string | null = key) => new Request("https://reibry.test/api/shortcut/capture", { method: "POST", headers: { "Content-Type": "application/json", ...(credential ? { "X-REIBRY-CAPTURE-KEY": credential } : {}) }, body: JSON.stringify(body) });
const memory = (input: NewMemory, id = "50000000-0000-4000-8000-000000000001"): Memory => ({ id, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: input.title, sourceType: input.sourceType, sourceUrl: input.sourceUrl, rawText: input.rawText, analysisStatus: input.analysisStatus, metadata: input.metadata, createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" });
function writerState() {
  const byKey = new Map<string, Memory>(); const byRequest = new Map<string, { memory: Memory; duplicate: boolean }>(); let calls = 0;
  return { get calls() { return calls; }, write: (_hash: string, id: string) => ({ async createUnique(input: NewMemory, dedupe: string) {
    calls++; const replay = byRequest.get(id); if (replay) return replay;
    const existing = byKey.get(dedupe); const result = existing ? { memory: existing, duplicate: true } : { memory: memory(input, `50000000-0000-4000-8000-00000000000${byKey.size + 1}`), duplicate: false };
    byKey.set(dedupe, result.memory); byRequest.set(id, result); return result;
  } }) };
}
const options = (state: ReturnType<typeof writerState>, extra: Partial<Parameters<typeof handleShortcutCapture>[1]> = {}) => ({ enabled: true, credential: key, hash: hashShortcutCredential, write: state.write, ...extra });

test("capture credentials are high entropy, hashed locally, and issuance input is bounded", () => {
  const first = createShortcutCredential(); const second = createShortcutCredential(); assert.match(first, /^rsc1_[A-Za-z0-9_-]{43}$/); assert.notEqual(first, second);
  assert.match(hashShortcutCredential(first), /^[0-9a-f]{64}$/); assert.deepEqual(parseDeviceIssue({ name: "My iPhone", expiresDays: 30 }), { name: "My iPhone", expiresDays: 30 });
  for (const value of [{ name: "" }, { name: "x".repeat(81) }, { name: "Phone", expiresDays: 181 }, { name: "Phone", userId: "forged" }]) assert.throws(() => parseDeviceIssue(value));
});

test("a valid capture-only credential saves one public link, replays idempotently, and never contacts enrichment", async () => {
  const state = writerState(); const first = await handleShortcutCapture(request({ url, requestId }), options(state));
  assert.equal(first.status, 201); assert.equal(first.data?.status, "saved"); assert.equal(state.calls, 1);
  const replay = await handleShortcutCapture(request({ url, requestId }), options(state)); assert.equal(replay.status, 201); assert.equal(replay.data?.status, "saved"); assert.equal(replay.data?.memoryId, first.data?.memoryId);
  const freshShare = await handleShortcutCapture(request({ url, requestId: "40000000-0000-4000-8000-000000000003" }), options(state)); assert.equal(freshShare.status, 200); assert.equal(freshShare.data?.status, "already_saved");
  const source = await readFile("src/lib/shortcut-capture/handler.ts", "utf8"); assert.doesNotMatch(source, /supadata|enrichSavedLink|callMeta|fetch\(/i);
});

test("missing, revoked, expired, cross-owner, malformed and private-url requests fail closed before persistence", async () => {
  const state = writerState(); assert.equal((await handleShortcutCapture(request({ url, requestId }, null), { ...options(state), credential: null })).status, 401);
  const wrongMediaType = new Request("https://reibry.test/api/shortcut/capture", { method: "POST", headers: { "Content-Type": "text/plain", "X-REIBRY-CAPTURE-KEY": key }, body: JSON.stringify({ url, requestId }) });
  assert.equal((await handleShortcutCapture(wrongMediaType, options(state))).status, 400);
  for (const code of ["AUTH_REQUIRED", "RATE_LIMITED"] as const) {
    const denied = await handleShortcutCapture(request({ url, requestId }), { ...options(state), write: () => ({ async createUnique() { throw new ShortcutCaptureFailure(code); } }) });
    assert.equal(denied.status, code === "RATE_LIMITED" ? 429 : 401);
  }
  for (const value of ["http://example.com", "https://localhost/a", "https://192.168.1.4/a", "file:///secret", "not-a-url"]) {
    const denied = await handleShortcutCapture(request({ url: value, requestId }), options(state)); assert.equal(denied.status, 400, value);
  }
  assert.equal(state.calls, 0, "invalid targets never reach the trusted writer");
});

test("concurrent request IDs converge and forged fragment/query fields cannot authorize capture", async () => {
  const state = writerState(); const requestId2 = "40000000-0000-4000-8000-000000000002";
  const [left, right] = await Promise.all([handleShortcutCapture(request({ url, requestId: requestId2 }), options(state)), handleShortcutCapture(request({ url, requestId: requestId2 }), options(state))]);
  assert.deepEqual([left.data?.memoryId, right.data?.memoryId], [left.data?.memoryId, left.data?.memoryId]); assert.ok([200, 201].includes(left.status)); assert.ok([200, 201].includes(right.status));
  const forged = await handleShortcutCapture(request({ url, requestId, src: "shortcut", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }), options(state)); assert.equal(forged.status, 400);
});

test("a bounded storage timeout stays ambiguous and requires the caller to reuse its request ID", async () => {
  const state = writerState(); const result = await handleShortcutCapture(request({ url, requestId }), { ...options(state), write: () => ({ async createUnique() { return await new Promise<never>(() => {}); } }) }, 10);
  assert.equal(result.status, 503); assert.equal(result.error?.code, "STORAGE_UNAVAILABLE");
});

test("migration keeps hashes private, device setup owner-scoped, trusted capture server-only, and durable replay/rate controls atomic", async () => {
  const sql = await readFile("supabase/migrations/20261103000000_shortcut_capture_devices.sql", "utf8"); const lower = sql.toLowerCase();
  const verification = await readFile("supabase/tests/shortcut_capture.sql", "utf8");
  for (const fragment of ["token_hash text not null unique", "capture_device_requests", "primary key (device_id, request_id)", "for update", "pg_advisory_xact_lock", "interval '1 minute'", "force row level security", "grant execute on function public.capture_from_device", "to service_role", "revoke all on function public.create_capture_device", "to authenticated"])
    assert.ok(lower.includes(fragment), fragment);
  assert.doesNotMatch(sql, /grant execute on function public\.capture_from_device[^;]*authenticated/i);
  assert.match(lower, /revoke all on function[\s\S]*? from public/);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete) on table public\.capture_devices to authenticated/i);
  assert.match(sql, /from public\.capture_devices d where d\.user_id = v_user and d\.revoked_at is null and d\.expires_at > now\(\)/);
  assert.match(sql, /select to_jsonb\(m\), r\.duplicate into v_replay_memory, v_duplicate/);
  assert.doesNotMatch(sql, /select m, r\.duplicate into v_memory, v_duplicate/);
  assert.match(sql, /if found then return query select v_replay_memory, v_duplicate; return; end if;[\s\S]*?v_duplicate := false;/);
  assert.match(verification, /v_first\.duplicate is distinct from v_retry\.duplicate/);
  assert.doesNotMatch(verification, /not v_retry\.duplicate/);
  assert.match(verification, /v_first\.memory->>'user_id'/);
  assert.doesNotMatch(verification, /select user_id::text from public\.memories/);
});

test("manual Capture and the untrusted fragment handoff remain explicit user actions", async () => {
  const form = await readFile("src/components/capture/capture-form.tsx", "utf8"); const handoff = await readFile("src/components/capture/share-handoff.tsx", "utf8");
  const server = await readFile("src/lib/shortcut-capture/server.ts", "utf8");
  assert.match(form, /Save to REIBRY/); assert.match(form, /if \(inFlight\.current\) return/); assert.doesNotMatch(handoff, /shortcut\/capture|fetch\(/);
  assert.match(server, /SHORTCUT_CAPTURE_ENABLED === "true"/);
});
