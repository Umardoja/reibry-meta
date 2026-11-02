# Stage 12M — Social Memory Enrichment

**Status: PARTIAL — local private-development implementation and mocked verification are complete; no live Supadata request, hosted write, or migration was performed.**

## Scope and release boundary

This change adds a narrowly gated optional metadata adapter for public TikTok and Instagram posts. It builds on the controlled five-post TikTok trial in `STAGE12K3_SUPADATA_TRIAL.md` and retains the conditional-clearance decision in `STAGE12K4_PROVIDER_CLEARANCE.md`.

The integration is deliberately **disabled by default** and is not cleared for public release. It is not a scraper, transcript service, or video-understanding claim. It sends only a canonical public post URL to Supadata; it never sends a REIBRY user note, Memory ID, conversation, Plan, Ready Pack, cookie, or authentication credential.

## A. Outcome

PARTIAL. The save-first adapter, owner gate, provenance labels, retrieval integration, and deterministic tests are in place. Live success criteria cannot honestly be claimed because the required private configuration is absent and the prepared trusted-writer migration has not been reviewed or applied to the disposable development database.

## B. Baseline

- Baseline branch: `feat/original-product-parity`.
- Baseline commit: `a999a686bec8f3b67057dddd021e417af8c72a50`.
- Original REIBRY was used only as a read-only reference and remained unchanged.
- Pre-existing modified `.env.example`, ignored `.env.local`, untracked recovery report, `AGENTS.md`, `CLAUDE.md`, and `next.config.ts` were preserved and excluded from this work.

## C. Implementation

- `src/lib/capture/supadata.ts` is server-only, calls only `GET https://api.supadata.ai/v1/metadata`, uses the `x-api-key` header, a five-second timeout, a 64 KiB streaming response limit, `no-store`, no credentials, manual redirect refusal, and no automatic retry.
- Calls are permitted only when `SUPADATA_DEV_ENABLED` is exactly `true`, the key is present, and the authenticated owner exactly matches `SUPADATA_DEV_USER_ID`. This is a private-pilot User-A gate, not a general-account fallback.
- Only canonical TikTok video/photo and Instagram reel/post/TV links already accepted by REIBRY are eligible. Unresolved short links, private/login-only formats, mismatched platform/post identities, malformed JSON, unsafe thumbnails, redirects, and provider errors fail closed.
- Capture remains save-first. The existing trusted details refresh invokes Supadata only after the native enrichment result lacks useful title, description, and thumbnail data. Existing useful YouTube metadata prevents a Supadata request.
- A successful result enriches the same Memory through the existing service-role-only trusted writer. Re-shares reuse the same owned Memory; a normal re-share does not call the provider again after a Supadata result has been persisted. Concurrent refreshes are coalesced in one application process. Multi-instance charge coalescing needs a future durable database claim if this ever moves beyond the private pilot.
- No new Memory columns are needed. The existing title, caption/description, author, thumbnail, tags, post date, and field-provenance storage cover the response. `20261102000000_supadata_unverified_metadata.sql` is **prepared only**: it extends the trusted writer allowlist with `supadata-unverified` while retaining `service_role`-only execution, fixed `search_path`, owner re-checks, and no user-writable metadata path.

## D–F. TikTok, Instagram, and Memory results

No new live requests were made in this stage. Therefore there are no Stage-12M TikTok or Instagram before/after records, thumbnail checks, reload proofs, or hosted persistence claims.

The prior research trial found non-empty TikTok descriptions and thumbnail URLs for five public videos, but those results are not being represented as current application results. Instagram remains unverified; documentation support is not evidence of a successful response.

## G. Search, Home, and citation behavior

Mocked tests prove that a validated retrieved description and tags participate in the existing owner-scoped lexical search, return the same saved Memory, and flow into the Muse evidence contract. The contract marks `provider_caption_origin: "supadata-unverified"`. Muse instructions require a response to label the text as an unverified external description and prohibit calling it a creator caption or saying the video/page was watched or read.

No live Muse call was made. No model, transcript, or visual-analysis result was fabricated.

## H–I. Existing-Memory refresh and thumbnails

The existing owner-authorized details route refreshes an existing Memory in place; it does not create a duplicate. The UI displays an external provider’s supplied HTTPS thumbnail with `referrerPolicy="no-referrer"` and hides it if it fails to load. It does not download, copy, cache, or guarantee the lifetime of a provider thumbnail URL.

## J. Experimental video understanding

`/v1/extract` is not implemented or called. The manual experimental action remains disabled. No video was submitted, downloaded, transcribed, or analyzed. Metadata is not presented as video understanding.

## K. Budget

- Stage 12M Supadata credits consumed: **0**.
- Remaining balance: **not checked in this stage**.
- Earlier Stage 12K-3 research consumption remains separately recorded as seven free credits; it is not counted as a Stage-12M call.

## L. Security, privacy, and provenance

- `SUPADATA_API_KEY` is server-only and no `NEXT_PUBLIC_` equivalent exists.
- The local environment currently lacks the three required private-pilot variables: `SUPADATA_API_KEY`, `SUPADATA_DEV_ENABLED`, and `SUPADATA_DEV_USER_ID`. `.env.local` was not edited.
- The description is stored and shown as a **retrieved external description with origin not verified**, never as a verified creator-authored caption. A generated display label is explicitly framed as REIBRY’s saved-details label, not a platform title.
- The public-release gate remains closed pending the unresolved vendor data-origin, rights, retention, deletion, and thumbnail-use questions documented in Stage 12K-4.

## M. Mobile QA

The implementation reuses the existing compact Capture, Memory detail, retrieval, and Home components. No navigation, mobile shell, iPhone Shortcut, authentication, Tailscale, or provider configuration was changed. Automated browser comparison was not available in this environment, so 390 px and 1440 px visual interaction QA remains unverified for this change.

## N. Automated validation

- Focused capture/Supadata tests: **27/27 passed**.
- Full npm suite: **315/315 passed**. Lint and typecheck passed. The current command enumerates all 23 discovered TypeScript/MJS test modules; the observed count is therefore authoritative for this checkout. Earlier 270/304 counts came from earlier milestone suites, not a removal of current test files.
- `git diff --check` passed. A production build compiled successfully through Turbopack, then a repeat final-status check was blocked by an already-running local Next dev/build process holding `.next` state. That is an environment/process contention, not a diagnosed application defect; a clean `npm run build` after that local dev process exits remains required for release sign-off.

## O. Remaining restrictions and approvals

Before any private-pilot live request, the owner must privately configure the three variables above and review/explicitly approve applying the prepared migration to the confirmed disposable project. Then authorize up to the remaining 12-free-credit cap, named public test URLs, and a read-only/controlled test plan. The first live check must verify TikTok and Instagram independently, persistent same-Memory updates, search, Home citations, re-share idempotency, and thumbnail failure behavior.

No public rollout, bulk backfill, automatic enrichment for other users, Supadata transcript mode, `/v1/extract`, paid plan, cache, or broad provider enablement is authorized by this change.

## P. Local commit

The local commit SHA is recorded in the Stage 12M release handoff rather than made self-referential here. This commit contains no credentials, provider responses, user records, build output, or Git LFS objects.
