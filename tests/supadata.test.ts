import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { toModelEvidence } from "../src/lib/ai/meta/contracts.ts";
import { createSupadataDiagnosticFetcher, createSupadataMetadataFetcher, diagnoseSupadataSourceMatch, instagramShortcodeToMediaId, parseSupadataMetadata, pilotSupadataSourceDiagnostic, supadataGate, supadataPilotAllows } from "../src/lib/capture/supadata.ts";
import { capture, enrichmentDetails, enrichSavedLink, type LinkEnricher } from "../src/lib/capture/service.ts";
import { parsePublicLink } from "../src/lib/capture/url-policy.ts";
import { presentMemory } from "../src/lib/memory/presentation.ts";
import { rankMemories } from "../src/lib/retrieval/service.ts";
import { createInMemoryEnrichmentWriter, trackedRepository } from "./support/capture-flow.ts";
import { createMemoryTestState } from "./support/in-memory-memory-repository.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tiktokUrl = "https://www.tiktok.com/@elsie.lizzy0/video/7696611605374602518";
const instagramUrl = "https://www.instagram.com/reel/DOGnqc1DlIy/";
const approvedIds = "tiktok:7696611605374602518,tiktok:7702502616080829717,instagram:DOGnqc1DlIy,instagram:Dd6nk3hNS7l";
const env = { SUPADATA_DEV_ENABLED: "true", SUPADATA_API_KEY: "not-a-real-key-123456", SUPADATA_DEV_USER_ID: userA, SUPADATA_DEV_ALLOWED_CANONICAL_IDS: approvedIds };
const primaryMissing: LinkEnricher = async () => ({ status: "partial", provider: "tiktok-oembed", reason: "provider-returned-no-title", provenance: {} });

function vendorRecord(url: string, platform: "tiktok" | "instagram", id: string, description = "Butterfly birthday cake decoration with purple icing #cakeidea") {
  return { platform, type: "video", id, url, title: null, description, author: { username: "cake.maker", displayName: "Cake Maker" },
    media: { type: "video", thumbnailUrl: "https://cdn.example.net/cover.jpg" }, tags: ["cakeidea", "birthday"], createdAt: "2026-10-28T10:00:00Z" };
}

test("Supadata is default-off and restricted to the one configured disposable development owner", () => {
  assert.equal(supadataGate(userA, env), true);
  assert.equal(supadataGate(userB, env), false);
  assert.equal(supadataGate(userA, { ...env, SUPADATA_DEV_ENABLED: "false" }), false);
  assert.equal(supadataGate(userA, { ...env, SUPADATA_API_KEY: undefined }), false);
});

test("the private pilot accepts exactly four canonical identities and fails closed for malformed, widened or short-link configuration", () => {
  const approved = [tiktokUrl, "https://www.tiktok.com/@temizy_001/video/7702502616080829717", instagramUrl, "https://www.instagram.com/reel/Dd6nk3hNS7l/"];
  for (const url of approved) assert.equal(supadataPilotAllows(userA, parsePublicLink(url), env), true, url);
  assert.equal(supadataPilotAllows(userA, parsePublicLink("https://www.tiktok.com/@elsie.lizzy0/video/7696611605374602519"), env), false);
  assert.equal(supadataPilotAllows(userB, parsePublicLink(tiktokUrl), env), false);
  assert.equal(supadataPilotAllows(userA, parsePublicLink("https://vm.tiktok.com/ZMabc123/"), env), false);
  assert.equal(supadataPilotAllows(userA, parsePublicLink(tiktokUrl), { ...env, SUPADATA_DEV_ALLOWED_CANONICAL_IDS: "tiktok:7696611605374602518" }), false);
  assert.equal(supadataPilotAllows(userA, parsePublicLink(tiktokUrl), { ...env, SUPADATA_DEV_ALLOWED_CANONICAL_IDS: approvedIds + ",tiktok:7696611605374602519" }), false);
  assert.equal(supadataPilotAllows(userA, parsePublicLink(tiktokUrl), { ...env, SUPADATA_DEV_ALLOWED_CANONICAL_IDS: undefined }), false);
});

test("the network fetcher cannot spend a pilot credit for an unapproved identity or malformed allowlist", async () => {
  let calls = 0;
  const fetcher = createSupadataMetadataFetcher({ env, fetch: async () => { calls++; throw new Error("must not fetch"); } });
  assert.equal(await fetcher(parsePublicLink("https://www.tiktok.com/@elsie.lizzy0/video/7696611605374602519"), userA), null);
  assert.equal(await fetcher(parsePublicLink("https://www.instagram.com/reel/CnotApproved1/"), userA), null);
  assert.equal(await fetcher(parsePublicLink("https://vm.tiktok.com/ZMabc123/"), userA), null);
  const malformed = createSupadataMetadataFetcher({ env: { ...env, SUPADATA_DEV_ALLOWED_CANONICAL_IDS: "tiktok:7696611605374602518" }, fetch: async () => { calls++; throw new Error("must not fetch"); } });
  assert.equal(await malformed(parsePublicLink(tiktokUrl), userA), null);
  assert.equal(calls, 0);
});

test("TikTok and Instagram metadata becomes bounded unverified external detail, never a claimed caption", () => {
  const tikTok = parseSupadataMetadata(parsePublicLink(tiktokUrl), vendorRecord(tiktokUrl, "tiktok", "7696611605374602518"));
  assert.equal(tikTok.provider, "supadata-unverified"); assert.equal(tikTok.status, "complete"); assert.match(tikTok.title ?? "", /^Saved TikTok details:/);
  assert.equal(tikTok.provenance.caption, "supadata-unverified"); assert.deepEqual(tikTok.hashtags, ["cakeidea", "birthday"]);
  const instagram = parseSupadataMetadata(parsePublicLink(instagramUrl), vendorRecord(instagramUrl, "instagram", "DOGnqc1DlIy", "Weekend market flowers"));
  assert.equal(instagram.caption, "Weekend market flowers"); assert.equal(instagram.thumbnailUrl, "https://cdn.example.net/cover.jpg");
});

test("documented equivalent mobile TikTok and Instagram post URLs retain strict post identity", () => {
  const tiktok = parsePublicLink(tiktokUrl); const mobileTikTok = "https://m.tiktok.com/v/7696611605374602518.html?share=1";
  const mobile = parsePublicLink(mobileTikTok); assert.equal(mobile.identity, tiktok.identity); assert.equal(parsePublicLink(mobile.normalized).identity, tiktok.identity);
  assert.equal(parseSupadataMetadata(tiktok, vendorRecord(mobileTikTok, "tiktok", "7696611605374602518")).status, "complete");
  const instagram = parsePublicLink(instagramUrl); const postUrl = "https://www.instagram.com/p/DOGnqc1DlIy/?igsh=ignored";
  assert.equal(parsePublicLink(postUrl).identity, instagram.identity);
  assert.equal(parseSupadataMetadata(instagram, vendorRecord(postUrl, "instagram", "DOGnqc1DlIy")).status, "complete");
});

test("Instagram requires one exact shortcode when a public post URL is supplied", () => {
  const instagram = parsePublicLink(instagramUrl);
  const equivalentTvUrl = "https://www.instagram.com/tv/DOGnqc1DlIy/?utm_source=ignored";
  assert.equal(parseSupadataMetadata(instagram, vendorRecord(equivalentTvUrl, "instagram", "DOGnqc1DlIy")).status, "complete");

  const wrongShortcode = "DifferentPost9";
  assert.equal(diagnoseSupadataSourceMatch(instagram, vendorRecord(instagramUrl, "instagram", wrongShortcode)), "id");
  assert.equal(diagnoseSupadataSourceMatch(instagram, vendorRecord(`https://www.instagram.com/reel/${wrongShortcode}/`, "instagram", "DOGnqc1DlIy")), "url-identity");
  assert.equal(diagnoseSupadataSourceMatch(instagram, { platform: "instagram", id: "DOGnqc1DlIy" }), null);
  assert.equal(diagnoseSupadataSourceMatch(instagram, vendorRecord(instagramUrl, "tiktok", "DOGnqc1DlIy")), "platform");
  assert.equal(parseSupadataMetadata(instagram, vendorRecord(`https://www.instagram.com/reel/${wrongShortcode}/`, "instagram", "DOGnqc1DlIy")).reason, "supadata-mismatched-source");
});

test("Instagram accepts a mathematically equivalent legacy media ID only alongside the exact public shortcode URL", () => {
  const instagram = parsePublicLink(instagramUrl); const legacyMediaId = instagramShortcodeToMediaId("DOGnqc1DlIy");
  assert.match(legacyMediaId ?? "", /^\d+$/);
  assert.equal(parseSupadataMetadata(instagram, vendorRecord(instagramUrl, "instagram", legacyMediaId!)).status, "complete");
  assert.equal(parseSupadataMetadata(instagram, vendorRecord("https://www.instagram.com/reel/DifferentPost9/", "instagram", legacyMediaId!)).reason, "supadata-mismatched-source");
  assert.equal(parseSupadataMetadata(instagram, vendorRecord(instagramUrl, "instagram", "12345678901234567890")).reason, "supadata-mismatched-source");
  assert.equal(parseSupadataMetadata(instagram, vendorRecord(instagramUrl, "instagram", "17841400000000000_1234567890")).reason, "supadata-mismatched-source");
});

test("a TikTok response with the exact numeric post ID may omit only its URL", () => {
  const link = parsePublicLink(tiktokUrl); const withoutUrl = { ...vendorRecord(tiktokUrl, "tiktok", "7696611605374602518"), url: undefined };
  const accepted = parseSupadataMetadata(link, withoutUrl);
  assert.equal(accepted.status, "complete"); assert.equal(accepted.canonicalUrl, link.normalized);
  assert.equal(diagnoseSupadataSourceMatch(link, withoutUrl), null);
  assert.equal(parseSupadataMetadata(link, { ...withoutUrl, id: "7696611605374602519" }).reason, "supadata-mismatched-source");
  assert.equal(diagnoseSupadataSourceMatch(link, { ...withoutUrl, id: "7696611605374602519" }), "id");
  const instagram = parsePublicLink(instagramUrl); const instagramWithoutUrl = { ...vendorRecord(instagramUrl, "instagram", "DOGnqc1DlIy"), url: undefined };
  assert.equal(parseSupadataMetadata(instagram, instagramWithoutUrl).status, "complete");
  assert.equal(parseSupadataMetadata(instagram, { ...instagramWithoutUrl, url: null }).status, "complete");
  assert.equal(diagnoseSupadataSourceMatch(instagram, instagramWithoutUrl), null);
  assert.equal(parseSupadataMetadata(instagram, { ...instagramWithoutUrl, id: "DifferentPost9" }).reason, "supadata-mismatched-source");
  assert.equal(parseSupadataMetadata(instagram, { ...instagramWithoutUrl, id: "12345678901234567890" }).reason, "supadata-mismatched-source");
  assert.equal(parseSupadataMetadata(instagram, { ...instagramWithoutUrl, url: "" }).reason, "supadata-mismatched-source");
  assert.equal(parseSupadataMetadata(link, { ...withoutUrl, url: null }).reason, "supadata-mismatched-source");
});

test("source-match diagnostics classify only the failed identity check and retain all negative rejections", () => {
  const link = parsePublicLink(tiktokUrl);
  assert.equal(diagnoseSupadataSourceMatch(link, vendorRecord(tiktokUrl, "tiktok", "7696611605374602518")), null);
  assert.equal(diagnoseSupadataSourceMatch(link, vendorRecord(tiktokUrl, "instagram", "7696611605374602518")), "platform");
  const instagram = parsePublicLink(instagramUrl);
  assert.equal(diagnoseSupadataSourceMatch(instagram, { platform: "instagram", id: "DOGnqc1DlIy" }), null);
  assert.equal(diagnoseSupadataSourceMatch(link, { platform: "tiktok", url: tiktokUrl }), "missing-id");
  assert.equal(diagnoseSupadataSourceMatch(link, vendorRecord("https://not a URL", "tiktok", "7696611605374602518")), "malformed-url");
  assert.equal(diagnoseSupadataSourceMatch(link, vendorRecord("https://www.instagram.com/reel/DOGnqc1DlIy/", "tiktok", "7696611605374602518")), "url-platform");
  assert.equal(diagnoseSupadataSourceMatch(link, vendorRecord("https://www.tiktok.com/@elsie.lizzy0/video/7696611605374602519", "tiktok", "7696611605374602519")), "url-identity");
  assert.equal(diagnoseSupadataSourceMatch(link, vendorRecord("https://www.tiktok.com/@elsie.lizzy0/video/7696611605374602518", "tiktok", "7696611605374602519")), "id");
  assert.equal(diagnoseSupadataSourceMatch(link, vendorRecord("https://vm.tiktok.com/ZMabc123/", "tiktok", "7696611605374602518")), "url-identity");
  for (const value of [
    vendorRecord("https://www.tiktok.com/@elsie.lizzy0/video/7696611605374602519", "tiktok", "7696611605374602519"),
    vendorRecord("https://www.tiktok.com/@elsie.lizzy0/video/7696611605374602518", "tiktok", "7696611605374602519"),
  ]) assert.equal(parseSupadataMetadata(link, value).reason, "supadata-mismatched-source");
});

test("server-only pilot diagnostics are default-off, require the exact gate, and omit provider text", () => {
  const link = parsePublicLink(tiktokUrl); const record = vendorRecord("https://m.tiktok.com/v/7696611605374602518.html", "tiktok", "7696611605374602518", "never return this text");
  assert.equal(pilotSupadataSourceDiagnostic(userA, link, record, env), null);
  assert.equal(pilotSupadataSourceDiagnostic(userB, link, record, { ...env, SUPADATA_DEV_DIAGNOSTICS: "true" }), null);
  const diagnostic = pilotSupadataSourceDiagnostic(userA, link, record, { ...env, SUPADATA_DEV_DIAGNOSTICS: "true" });
  assert.deepEqual(diagnostic, { approvedIdentity: "tiktok:7696611605374602518", returnedPlatform: "tiktok", returnedIdFormat: "numeric",
    returnedUrlHostPath: "m.tiktok.com/v/7696611605374602518.html", condition: null, returnedIdRepresentation: "numeric-other", returnedUrlIdentity: "exact",
    identityFields: "verified", descriptionPresent: true, creatorPresent: true, tagsPresent: true, thumbnailPresent: true });
  assert.doesNotMatch(JSON.stringify(diagnostic), /never return this text/);
});

test("the diagnostic fetcher reports sanitized Instagram identity shape before production parsing and can persist one verified response", async () => {
  const link = parsePublicLink(instagramUrl); const state = createMemoryTestState(); const repo = trackedRepository(userA, state);
  const saved = await capture({ sourceType: "link", content: instagramUrl, title: "My Instagram title", note: "My own note" }, repo);
  const exactLiveShape = { ...vendorRecord(instagramUrl, "instagram", "DOGnqc1DlIy", "Weekend market flowers"), url: undefined };
  const fetcher = createSupadataDiagnosticFetcher({ env: { ...env, SUPADATA_DEV_DIAGNOSTICS: "true" }, fetch: async () =>
    new Response(JSON.stringify(exactLiveShape), { headers: { "content-type": "application/json" } }) });
  const result = await fetcher(link, userA); assert.ok(result); assert.equal(result.diagnostic?.condition, null);
  assert.equal(result.diagnostic?.returnedIdRepresentation, "shortcode"); assert.equal(result.diagnostic?.returnedUrlIdentity, "missing");
  assert.equal(result.diagnostic?.identityFields, "verified"); assert.equal(result.diagnostic?.descriptionPresent, true);
  assert.equal(result.diagnostic?.creatorPresent, true); assert.equal(result.diagnostic?.tagsPresent, true); assert.equal(result.diagnostic?.thumbnailPresent, true);
  assert.equal(result.metadata?.status, "complete");
  const written = await createInMemoryEnrichmentWriter(userA, state)(saved.memory.id, enrichmentDetails(result.metadata!), null);
  assert.equal(written.id, saved.memory.id); assert.equal(written.title, "My Instagram title"); assert.equal(written.rawText, "My own note");
  assert.equal(written.metadata.caption, "Weekend market flowers"); assert.equal(state.size, 1);
});

test("sanitized Instagram diagnostics distinguish every rejected identity shape without leaking provider content", () => {
  const link = parsePublicLink(instagramUrl); const diagnosticEnv = { ...env, SUPADATA_DEV_DIAGNOSTICS: "true" };
  const diagnose = (record: unknown) => pilotSupadataSourceDiagnostic(userA, link, record, diagnosticEnv)!;
  const exactMissingUrl = diagnose({ platform: "instagram", id: "DOGnqc1DlIy" });
  assert.equal(exactMissingUrl.condition, null); assert.equal(exactMissingUrl.returnedUrlIdentity, "missing"); assert.equal(exactMissingUrl.identityFields, "verified");
  assert.equal(diagnose({ platform: "instagram", id: "DifferentPost9" }).condition, "id");
  assert.equal(diagnose({ platform: "instagram", url: instagramUrl }).condition, "missing-id");
  assert.equal(diagnose(vendorRecord(instagramUrl, "tiktok", "DOGnqc1DlIy")).condition, "platform");
  assert.equal(diagnose(vendorRecord("https://not a URL", "instagram", "DOGnqc1DlIy")).condition, "malformed-url");
  const urlMismatch = diagnose(vendorRecord("https://www.instagram.com/reel/DifferentPost9/", "instagram", "DOGnqc1DlIy"));
  assert.equal(urlMismatch.condition, "url-identity"); assert.equal(urlMismatch.returnedUrlIdentity, "shortcode-mismatch"); assert.equal(urlMismatch.identityFields, "contradictory");
  const idMismatch = diagnose(vendorRecord(instagramUrl, "instagram", "DifferentPost9"));
  assert.equal(idMismatch.condition, "id"); assert.equal(idMismatch.returnedIdRepresentation, "unrecognized"); assert.equal(idMismatch.identityFields, "contradictory");
  const numericOther = diagnose(vendorRecord(instagramUrl, "instagram", "12345678901234567890"));
  assert.equal(numericOther.returnedIdRepresentation, "numeric-other"); assert.equal(numericOther.identityFields, "contradictory");
  const sameCreatorDifferentReel = diagnose({ ...vendorRecord(instagramUrl, "instagram", "DifferentPost9"), url: undefined });
  assert.equal(sameCreatorDifferentReel.condition, "id"); assert.equal(sameCreatorDifferentReel.identityFields, "incomplete");
  assert.equal(diagnose({ ...vendorRecord(instagramUrl, "instagram", "DOGnqc1DlIy"), url: "" }).condition, "malformed-url");
  assert.equal(diagnose({ ...vendorRecord(instagramUrl, "instagram", "DOGnqc1DlIy"), url: "https://example.com/reel/DOGnqc1DlIy/" }).condition, "url-platform");
});

test("mismatched, malformed, null-field and unsafe-thumbnail vendor responses fail honestly", () => {
  const link = parsePublicLink(tiktokUrl);
  assert.equal(parseSupadataMetadata(link, vendorRecord(tiktokUrl, "instagram", "7696611605374602518")).reason, "supadata-mismatched-source");
  assert.equal(parseSupadataMetadata(link, { platform: "tiktok", id: "7696611605374602518", url: tiktokUrl, title: null, description: null, author: null, media: { thumbnailUrl: "javascript:alert(1)" }, tags: null }).status, "unavailable");
  assert.equal(parseSupadataMetadata(link, null).reason, "supadata-invalid-response");
});

test("the fixed server-side client sends only the canonical URL, has no retry, and maps provider failures safely", async () => {
  let calls = 0; let seen: URL | null = null;
  const fetcher = createSupadataMetadataFetcher({ env, fetch: async (input, init) => { calls++; seen = new URL(String(input));
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "manual"); assert.equal(init?.credentials, "omit"); assert.ok(!String(input).includes("rawText"));
    return new Response(JSON.stringify(vendorRecord(tiktokUrl, "tiktok", "7696611605374602518")), { headers: { "content-type": "application/json" } }); } });
  const result = await fetcher(parsePublicLink(tiktokUrl), userA);
  assert.equal(calls, 1); const requested = seen as URL | null; assert.ok(requested); assert.equal(requested.origin, "https://api.supadata.ai"); assert.equal(requested.pathname, "/v1/metadata"); assert.equal(result?.caption?.includes("Butterfly"), true);
  const denied = await fetcher(parsePublicLink(tiktokUrl), userB); assert.equal(denied, null); assert.equal(calls, 1);
  for (const [status, reason] of [[403, "supadata-forbidden"], [404, "supadata-not-found"], [429, "supadata-rate-limited"]] as const) {
    const failed = createSupadataMetadataFetcher({ env, fetch: async () => { calls++; return new Response("", { status, headers: { "content-type": "application/json" } }); } });
    assert.equal((await failed(parsePublicLink(tiktokUrl), userA))?.reason, reason);
  }
  assert.equal(calls, 4, "each failure makes one call; there is no automatic retry");
  const timedOut = createSupadataMetadataFetcher({ env, timeoutMs: 5, fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) });
  assert.equal((await timedOut(parsePublicLink(tiktokUrl), userA))?.reason, "supadata-timeout");
});

test("one owned saved Memory receives external details, remains searchable and never spends again on an ordinary re-share", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state); const saved = await capture({ sourceType: "link", content: tiktokUrl, title: "My chosen label", note: "My own note" }, repo);
  let calls = 0;
  const fallback = async () => { calls++; return parseSupadataMetadata(parsePublicLink(tiktokUrl), vendorRecord(tiktokUrl, "tiktok", "7696611605374602518")); };
  const first = await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  assert.equal(first.memory.id, saved.memory.id); assert.equal(first.memory.title, "My chosen label"); assert.equal(first.memory.rawText, "My own note"); assert.equal(first.memory.metadata.metadataProvider, "supadata-unverified"); assert.equal(first.memory.metadata.caption, "Butterfly birthday cake decoration with purple icing #cakeidea");
  assert.equal(rankMemories(await repo.searchCandidates(20), "butterfly purple cake decoration", 5).items[0]?.memoryId, saved.memory.id);
  const view = presentMemory(first.memory); assert.equal(view.summary?.from, "Retrieved description via Supadata (origin not verified)"); assert.match(view.knows[0]?.heading ?? "", /origin not verified/i);
  const evidence = toModelEvidence(rankMemories(await repo.searchCandidates(20), "butterfly cake", 1).items)[0];
  assert.equal(evidence.link_details?.provider_caption_origin, "supadata-unverified"); assert.equal(evidence.stored_note_excerpt, null);
  const again = await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  assert.equal(calls, 1); assert.equal(again.memory.id, saved.memory.id); assert.equal(state.size, 1);
});

test("a safely resolved TikTok short link sends its canonical post to Supadata and still deduplicates with the full URL", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state); const full = await capture({ sourceType: "link", content: tiktokUrl }, repo);
  const short = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMabc123/" }, repo);
  const resolved = parsePublicLink(tiktokUrl); let received = "";
  const primary: LinkEnricher = async () => ({ status: "partial", provider: "tiktok-oembed", reason: "provider-returned-no-title", resolved, provenance: {} });
  const merged = await enrichSavedLink(short.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primary, 1_000, async link => {
    received = link.normalized; return parseSupadataMetadata(link, vendorRecord(tiktokUrl, "tiktok", "7696611605374602518"));
  });
  assert.equal(received, tiktokUrl); assert.equal(merged.memory.id, full.memory.id); assert.equal(state.size, 1);
});

test("concurrent detail refreshes share one optional provider request for the same owned Memory", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state); const saved = await capture({ sourceType: "link", content: tiktokUrl }, repo);
  let calls = 0; let resolve!: (value: ReturnType<typeof parseSupadataMetadata>) => void;
  const pending = new Promise<ReturnType<typeof parseSupadataMetadata>>(done => { resolve = done; });
  const fallback = async () => { calls++; return pending; };
  const first = enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  const second = enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  resolve(parseSupadataMetadata(parsePublicLink(tiktokUrl), vendorRecord(tiktokUrl, "tiktok", "7696611605374602518")));
  await Promise.all([first, second]); assert.equal(calls, 1);
});

test("optional metadata shares the details budget, aborts safely, and records one attempt", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state); const saved = await capture({ sourceType: "link", content: tiktokUrl }, repo);
  let calls = 0; let aborted = false;
  const primary: LinkEnricher = async () => { await new Promise(resolve => setTimeout(resolve, 20)); return { status: "partial", provider: "tiktok-oembed", reason: "provider-returned-no-title", provenance: {} }; };
  const fallback = async (_link: ReturnType<typeof parsePublicLink>, _owner: string, signal?: AbortSignal) => {
    calls++;
    return await new Promise<ReturnType<typeof parseSupadataMetadata>>(resolve => signal?.addEventListener("abort", () => { aborted = true; resolve({ status: "timed-out", provider: "supadata-unverified", reason: "supadata-timeout", provenance: {} }); }, { once: true }));
  };
  const result = await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primary, 100, fallback);
  assert.equal(calls, 1); assert.equal(aborted, true); assert.equal(result.enrichment.reason, "supadata-timeout"); assert.equal(result.memory.metadata.metadataProvider, "supadata-unverified");
  await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primary, 100, fallback);
  assert.equal(calls, 1, "the persisted timeout prevents a second charged fallback");
});

test("existing useful YouTube metadata is never sent to the optional provider", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state);
  const saved = await capture({ sourceType: "link", content: "https://www.youtube.com/watch?v=rfscVS0vtbw" }, repo);
  let fallbackCalls = 0;
  const primary: LinkEnricher = async () => ({ status: "complete", provider: "youtube-oembed", title: "Existing YouTube title", thumbnailUrl: "https://i.ytimg.com/vi/x/hq.jpg", provenance: { title: "youtube-oembed", thumbnailUrl: "youtube-oembed" } });
  const enriched = await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primary, 1_000, async () => { fallbackCalls++; return null; });
  assert.equal(fallbackCalls, 0); assert.equal(enriched.memory.title, "Existing YouTube title"); assert.equal(enriched.memory.metadata.metadataProvider, "youtube-oembed");
});

test("consumer UI names Supadata as unverified external details and never calls it a caption from the creator", async () => {
  const source = await readFile("src/components/capture/source-details.tsx", "utf8"); const presentation = await readFile("src/lib/memory/presentation.ts", "utf8");
  assert.match(source, /origin has not been verified/); assert.match(presentation, /Retrieved description via Supadata \(origin not verified\)/);
  assert.doesNotMatch(source, /official caption/i);
});

test("prepared migration keeps trusted enrichment service-role-only while extending only the provenance allowlist", async () => {
  const migration = await readFile("supabase/migrations/20261102000000_supadata_unverified_metadata.sql", "utf8");
  assert.match(migration, /'supadata-unverified'/); assert.match(migration, /security definer set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.apply_trusted_link_enrichment[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_trusted_link_enrichment[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/i);
});
