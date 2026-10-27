# Stage 6 capture architecture

Stage 6 migrates and hardens REIBRY's text/link capture foundation. It does not add AI analysis, semantic retrieval, transcripts, file upload, Android sharing, or production connectivity. Original contributors retain attribution; the source reference is the read-only REIBRY commit `76d3494465bab43a5051498e90b9a486a65312b9`.

## Dependency map and provenance

The implementation reviewed `src/lib/capture/title.ts`, `submission.ts`, `source-preservation.ts`; `src/lib/sources/enrichment.ts`, `prepare-capture.ts`, `tiktok-url.ts`, `tiktok.ts`; `src/lib/integration/dedupe.ts`; `src/app/api/capture/route.ts`; `src/app/capture/page.tsx`; and the related capture/source tests. The Meta Edition adapts deterministic title cleanup, a single-submit UI state, original-source preservation, platform recognition, owner-scoped deduplication, and bounded metadata ideas.

The original generic page enricher was not copied: it requested arbitrary submitted URLs and bounded the resulting string only after `response.text()` completed. The original fallback summary/category/tag derivation was also excluded because it could appear to be AI analysis. Provider orchestration and every model adapter are outside this milestone.

~~~text
protected /capture page
  -> POST /api/capture
     -> verified Stage 4 server session
     -> bounded Capture contract
     -> text normalization OR public-HTTPS URL policy
     -> optional fixed YouTube/TikTok oEmbed metadata
     -> owner-bound Stage 5 MemoryRepository.createUnique
        -> authenticated Supabase client + RLS
~~~

Production modules cannot import the in-memory repository. It exists only under `tests/support`.

## Contracts and source preservation

Capture accepts an exact JSON object with `sourceType` (`text` or `link`), `content`, and optional `title`. Notes are limited to 50,000 characters, links to 2,048, titles to 200, and request bodies to 64 KiB. A deterministic note title uses its first normalized line when no title is supplied.

The stored Memory keeps the note text or submitted URL. Every Stage 6 record remains `processing`, explicitly meaning AI analysis has not run. Metadata describes only capture/enrichment facts. It contains no generated summary, tags, transcript, inferred intent, or invented source content.

Generic links are never fetched server-side. They are stored with a safely derived hostname when no title is supplied. YouTube and TikTok may use internally constructed, exact-host oEmbed endpoints. If DNS, HTTP, content type, parsing, timeout, thumbnail validation, or provider availability fails, the original source is still saved and enrichment is marked `unavailable`. Unsupported generic previews are marked `unsupported`.

## URL and network policy

Only HTTPS URLs without credentials or non-default ports are accepted. Localhost, single-label, `.local`, `.internal`, private, loopback, link-local, carrier-grade NAT, documentation, multicast, reserved IPv4, and non-global/documentation IPv6 literals are rejected.

The server makes no request to an arbitrary source URL and does not follow submitted redirects. Vetted metadata calls:

- use only `www.youtube.com/oembed` or `www.tiktok.com/oembed`, constructed by the server;
- resolve the fixed endpoint and reject any private/reserved result before fetch;
- use manual redirect mode and reject every redirect;
- omit credentials and referrers, disable caching, and request JSON only;
- bound DNS plus fetch to three seconds;
- require `application/json`;
- enforce 65,536 bytes while reading the response stream and cancel once exceeded.

The standard fetch client cannot pin a resolved IP to the TLS connection. Therefore this implementation uses it only for the two fixed, vetted platform hosts, never for user-selected destinations. Short-link redirects are not resolved server-side. This intentionally trades richer previews for a smaller SSRF boundary.

## Deduplication

SHA-256 keys are generated server-side from normalized note text or normalized URLs. URL fragments are removed and query parameters are stably ordered; values are retained rather than treating all query parameters as tracking data. Recognized `youtu.be` links are normalized to a YouTube watch URL while keeping other parameters. The submitted source URL remains stored separately.

Migration `20261027010000_capture_deduplication.sql` adds a checked `dedupe_key` and a partial unique index on `(user_id, dedupe_key)`. A unique conflict is re-read with both the verified owner and key, so another user's identifier cannot be returned. The database index is the concurrency guarantee once the migration is verified and applied. The test repository makes the same owner/key decision atomically in one event-loop turn. The migration was not executed; real PostgreSQL conflict/RLS behavior remains unverified.

## Verification boundary

Deterministic tests cover contracts, source preservation, URL variants, fixed endpoints, private DNS answers, redirects, response byte limits, timeouts, unsupported content, platform fallbacks, same-owner and cross-owner duplicates, concurrent duplicates, unauthenticated/expired sessions, storage failure, logging, and absence of mock/provider fallbacks. The production smoke test checks public assets plus fail-closed `/capture` and `/api/capture` behavior.

No disposable Supabase project is configured, so live authentication, persistence, RLS and the new unique index are **NOT VERIFIED**. Before release, apply both Stage 5 and Stage 6 migrations to an approved disposable project and exercise two real users, anonymous denial, cross-owner denial, equivalent concurrent captures, provider failure, and rollback. Do not use production for this check.
