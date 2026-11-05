# Stage 12M-1 — Live Social Enrichment Verification

**Status: PARTIAL.** The private-pilot guard, authenticated ownership path, and one-attempt persistence behavior worked; all four live provider responses were rejected by the intentionally strict identity validator, so no useful description or thumbnail was added.

## A. Scope and target

- Branch: `feat/original-product-parity`.
- Starting commit: `8a5bc88ebf78395929a5a69352f8d69a40cc09aa`.
- The configured and linked Supabase project was confirmed to be the disposable REIBRY Meta development project. Original REIBRY was not modified.
- The applied migration was `20261102000000_supadata_unverified_metadata.sql`. Before application, read-only checks confirmed the pre-existing trusted writer, forced Memories RLS, and no authenticated metadata-update privilege. Afterwards, the function remained `SECURITY DEFINER`, fixed-search-path, service-role-only, and included the explicit Supadata provenance allowlist. Remote history contains all 12 expected migrations.

## B. Pilot guard

The private configuration is ignored by Git and now contains an exact-user gate, disabled flag, and exact four-ID allowlist. The server-only adapter requires all of the following before its fixed metadata endpoint can be called:

1. `SUPADATA_DEV_ENABLED=true`;
2. the verified disposable User A;
3. a non-empty server-only key;
4. an exact configuration match to the four hard-pinned canonical identities; and
5. a non-short, canonical TikTok or Instagram identity.

Malformed, missing, duplicate, widened, or partial configuration fails closed. After the pilot, the persisted flag was reset to `false` and the local REIBRY server was restarted on the same loopback port, confirming the disabled configuration was reloaded.

Focused guard coverage: 12/12 tests pass, including no-network rejection for an unapproved TikTok, an unapproved Instagram Reel, a short URL, User B, and malformed allowlist configuration. Existing in-process coalescing and persisted provider state prevent normal refresh/re-share repeats for one saved Memory; a durable cross-instance charge ledger remains out of scope for this private single-instance pilot.

## C. Authenticated target verification

The four targets were read using REIBRY's normal User A sign-in, `/api/auth/me`, and owner-scoped `/api/memories` routes. Each canonical identity mapped to exactly one owned Memory before the pilot:

| Platform | Canonical identity | Owned Memory count |
|---|---|---:|
| TikTok | `tiktok:7696611605374602518` | 1 |
| TikTok | `tiktok:7702502616080829717` | 1 |
| Instagram | `instagram:DOGnqc1DlIy` | 1 |
| Instagram | `instagram:Dd6nk3hNS7l` | 1 |

No UUID, password, session token, provider key, or Memory content is recorded here.

## D. Live metadata attempts

Exactly one authenticated details request was made for each verified Memory while the strict pilot gate was enabled. The application persisted one `supadata-unverified` attempt per Memory, proving the requests reached the existing trusted enrichment write boundary. No retry was made.

| Platform | Attempts | Persisted result | Description | Creator | Thumbnail |
|---|---:|---|---|---|---|
| TikTok | 2 | `unavailable` / `supadata-mismatched-source` | none | existing creator field remained present | none |
| Instagram | 2 | `unavailable` / `supadata-mismatched-source` | none | none | none |

The local request client did not receive an HTTP response before its bounded wait, even though the application later showed the safely persisted unavailable result. No raw provider body was retained or printed, so the exact field-level mismatch cannot be reconstructed without a separately authorized diagnostic request. The strict validator was not weakened to make the pilot appear successful.

The current adapter rejects a response when its declared platform, provider URL canonical identity, or provider ID differs from the saved canonical identity. This protects against cross-post enrichment, but the four results show that current provider response normalization needs fixture-based diagnosis before another paid attempt.

## E. Product and security checks

- Duplicates: each selected identity still has exactly one owned Memory.
- User B: owner-scoped read and details endpoints both returned `404` for User A's Memory.
- YouTube: an existing User A Memory still reported `youtube-oembed`, a title, and a thumbnail.
- Supadata did not create a Memory, change a plan/Ready Pack, or invoke Meta, `/extract`, or transcript endpoints.
- The trusted writer permits only bounded metadata fields and never writes `raw_text`; placeholder-only title logic remains in place. Automated coverage proves user title/note preservation. Since the live client responses timed out, a separate before/after live snapshot was not retained; do not interpret this as live proof of note/title preservation.
- No meaningful live description existed, so descriptive Memory search and Home citation retrieval could not be demonstrated honestly. The product correctly has no basis to fabricate a caption, thumbnail, or video understanding.

## F. Credits and release status

Supadata documents metadata as one credit per URL. Four endpoint attempts were made, so expected trial consumption is four credits. The dashboard/API did not expose a supported programmatic balance endpoint during this stage, so remaining balance is **not independently verified**; based on the prior recorded 93-credit balance and no intervening application calls, the expected balance is 89. This is an estimate, not a dashboard-confirmed balance, and no paid plan, auto-recharge, or monetary charge was enabled.

Public release remains disabled because the provider rights/provenance review remains conditional and this live reliability result is not acceptable for product use.

## G. Required follow-up

Do not retry these public posts under this stage. A separately approved diagnostic stage should use a local synthetic fixture built from an authorized sanitized response shape, preserve strict cross-post checks, and repair only the confirmed parser-normalization defect. A new paid request requires separate owner approval and a renewed credit check.

## H. Local validation and UI status

- Lint: PASS.
- Typecheck: PASS.
- Full regression suite: **317/317 PASS** (the new guard tests add two checks to the previous suite).
- `git diff --check`: PASS.
- Production build: Turbopack reached optimized compilation with the pilot disabled, but this environment did not return a terminal build status before the local listener was restored. Treat final build sign-off as unverified, not failed or passed.
- The centered 430 px shell, five-tab navigation, iPhone Shortcut, Tailscale configuration, and consumer UI source were not changed. Physical-iPhone and browser thumbnail-display QA were not run. Because no thumbnail was persisted, there was no legitimate thumbnail image to display.
