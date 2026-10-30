import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRepositoryFailure } from "../src/lib/actions/repository.ts";
import { createSupabaseActionRepository } from "../src/lib/actions/supabase-repository.ts";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const memory = "11111111-1111-4111-8111-111111111111";
const requestId = "30000000-0000-4000-8000-000000000001";
const input = [{ title: "Review launch", description: "Use verified evidence.", supportingMemoryIds: [memory] }];

function client(rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>) {
  return { rpc, from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return Promise.resolve({ data: [], error: null }); } }; } } as never;
}

test("ordinary user repository cannot create trusted proposals", async () => {
  let calls = 0; const repository = createSupabaseActionRepository(client(async () => { calls++; return { data: [], error: null }; }), owner);
  await assert.rejects(repository.createProposals(input, "meta:muse-spark-1.3"),
    (error: unknown) => error instanceof ActionRepositoryFailure && error.code === "STORAGE_UNAVAILABLE");
  assert.equal(calls, 0);
});

test("trusted writer invokes only the dedicated RPC with server identity and request ID", async () => {
  let userCalls = 0; const trustedCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const user = client(async () => { userCalls++; return { data: [], error: null }; });
  const trusted = client(async (name, args) => { trustedCalls.push({ name, args }); return { data: [], error: null }; });
  const repository = createSupabaseActionRepository(user, owner, { client: () => trusted, requestId: () => requestId });
  await repository.createProposals(input, "meta:muse-spark-1.3");
  const trustedCall = trustedCalls[0]!;
  assert.equal(userCalls, 0); assert.equal(trustedCall.name, "create_trusted_action_proposals");
  assert.equal(trustedCall.args.p_user_id, owner); assert.equal(trustedCall.args.p_request_id, requestId);
  assert.equal("user_id" in (trustedCall.args.p_items as Record<string, unknown>[])[0], false);
});

test("hardening migration removes the old RPC and grants creation only to service_role", async () => {
  const sql = await readFile("supabase/migrations/20261030030000_trusted_action_proposals.sql", "utf8");
  for (const pattern of [/drop function public\.create_action_proposals/, /create function public\.create_trusted_action_proposals/,
    /revoke all on function public\.create_trusted_action_proposals[\s\S]+?public, anon, authenticated/,
    /grant execute on function public\.create_trusted_action_proposals[\s\S]+?to service_role/,
    /pg_advisory_xact_lock/, /trust_source <> 'server-validated-meta'/, /p_user_id uuid/, /auth\.users/]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /grant execute[^;]+create_trusted_action_proposals[^;]+authenticated/i);
});

test("elevated client is isolated to a server-only proposal module", async () => {
  const trusted = await readFile("src/lib/supabase/trusted-server.ts", "utf8");
  assert.match(trusted, /^import "server-only";/); assert.match(trusted, /SUPABASE_SECRET_KEY/);
  assert.match(trusted, /sb_secret_/); assert.doesNotMatch(trusted, /NEXT_PUBLIC|service_role|console\.|\.from\(/);
  const users = await Promise.all(["src/lib/ai/server.ts", "src/lib/home/server.ts"].map(file => readFile(file, "utf8")));
  for (const source of users) assert.match(source, /createTrustedProposalClient/);
});
