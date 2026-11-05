# Stage 12M-2 — Supadata source-identity debug

**Status: PARTIAL — one documented TikTok URL-normalization defect is fixed offline; the exact field-level cause of the four already-consumed live calls remains unknown because their raw provider responses were deliberately not retained.**

## Scope and preserved controls

- No Supadata, Meta, or other provider request was made in this stage.
- `SUPADATA_DEV_ENABLED` remains `false`.
- The exact four-identity allowlist, exact disposable-owner gate, server-only API key path, service-role-only trusted writer, save-first capture path, and existing YouTube path remain unchanged.
- No database schema, RLS policy, iPhone Shortcut, Tailscale, authentication, or mobile UI change was made.

## Evidence reviewed

- `docs/meta/STAGE12K3_SUPADATA_TRIAL.md` records useful TikTok metadata from the earlier standalone trial, but intentionally retains no raw response bodies.
- `docs/meta/STAGE12M1_LIVE_ENRICHMENT_VERIFICATION.md` records four persisted `supadata-mismatched-source` outcomes and explicitly confirms that the provider bodies were not retained.
- The current [Supadata Metadata documentation](https://docs.supadata.ai/get-metadata) specifies a bare unified response with lower-case `platform`, string `id`, and string `url`. It documents TikTok full post, `vm.tiktok.com`, and `m.tiktok.com/v/<id>.html` forms; it documents Instagram `/reel/`, `/p/`, and `/tv/` forms. `title` and `description` may be null.

Therefore, the adapter's expectation of a bare `platform`/`id`/`url` object is consistent with the current documented contract. HTTP 200 alone remains insufficient proof that those three identity fields refer to the saved post.

## Confirmed repair

`src/lib/capture/url-policy.ts` previously treated the documented mobile TikTok form `https://m.tiktok.com/v/<numeric-id>.html` as a generic URL. A provider response using that form could not match a saved full TikTok post, despite conveying the same numeric post ID.

The parser now recognizes that form, preserves the numeric post ID, and assigns the same `tiktok:<id>` identity as the full post URL. It does not invent a creator handle. The normalized mobile form is self-parseable.

This is a real parser defect with a deterministic fixture, but it is **not proof** that it caused either prior TikTok rejection. It cannot explain all four rejections by itself. The Instagram parser already maps `/reel/`, `/reels/`, `/p/`, and `/tv/` URLs carrying the same shortcode to the same `instagram:<shortcode>` identity; no equivalent static Instagram normalization defect was found.

## Source-match behavior and test matrix

`src/lib/capture/supadata.ts` continues to require all of the following before writing any provider metadata:

1. Declared platform exactly matches the saved platform.
2. Returned URL is a public link REIBRY can parse.
3. Returned URL platform and canonical identity exactly match the saved Memory.
4. Returned provider `id` exactly matches the saved post ID when one exists.

The new server-only diagnostic classifier has no network capability and is not called by production requests. It records only a bounded failure category: `platform`, `missing-url`, `missing-id`, `malformed-url`, `url-platform`, `url-identity`, or `id`. It never returns or logs descriptions, thumbnails, raw response bodies, credentials, cookies, or query strings.

| Fixture | Result |
| --- | --- |
| Full TikTok response for the saved post | Accepted |
| Documented mobile TikTok response URL for the same numeric post | Accepted after repair |
| Instagram `/p/` response URL for the same Reel shortcode | Accepted |
| Wrong TikTok post ID / same creator, different post | Rejected as `url-identity` |
| Wrong Instagram shortcode | Rejected as `url-identity` |
| Wrong declared platform | Rejected as `platform` |
| Missing ID or URL | Rejected as `missing-id` / `missing-url` |
| Malformed URL | Rejected as `malformed-url` |
| TikTok short-link response without independently verified post identity | Rejected as `url-identity` |
| Contradictory correct URL and wrong provider ID | Rejected as `id` |

The parser still rejects every mismatch with the existing external result `supadata-mismatched-source`; the detail category is deliberately not exposed to ordinary clients.

## Disabled future diagnostic

For a separately authorized, one-credit diagnostic request only, `pilotSupadataSourceDiagnostic` is available from the server-only adapter. It returns a structured, sanitized record only when all normal pilot controls pass **and** `SUPADATA_DEV_DIAGNOSTICS=true`:

- approved canonical identity;
- returned declared platform;
- returned ID format (`numeric`, `shortcode`, `missing`, or `other`);
- returned URL host/path with query strings omitted;
- failed source-match condition, if any;
- description and thumbnail presence only.

It makes no request itself and emits no logs. It is disabled by default and remains unusable for another owner, another Memory, an unapproved identity, missing/malformed pilot configuration, or a disabled pilot.

## Why the exact live cause remains unknown

The four paid pilot requests had already completed before this stage. Their persisted statuses preserve only the generic rejection code; neither the raw response nor a sanitized field-level diagnostic was stored. As a result, the record cannot distinguish whether the live responses contained a mobile TikTok URL, a differing ID representation, a different platform value, a non-equivalent returned URL, or another documented-contract deviation. No inference has been made from the earlier standalone trial.

One new diagnostic request is necessary only if the owner wants to establish the actual provider response shape. It must name one of the four approved public URLs, have a one-credit maximum, preserve the existing per-identity ledger, run through the exact owner/allowlist gate, and retain only the sanitized diagnostic fields above. It must not reset the ledger or write enrichment unless separately authorized.

## Request-timeout finding

The earlier local client timeout is plausibly explained by the current request budgets:

- `handleCaptureDetailsRequest` is bounded at 10 seconds.
- `enrichSavedLink` can wait up to 6 seconds for the native provider.
- It can then separately wait up to 5 seconds for the optional Supadata provider.

That 11-second aggregate worst case exceeds the route limit. In addition, the route's abort signal is used while constructing authenticated dependencies but is not passed into `enrichSavedLink` or the optional provider fetch. A timed-out request can therefore race with completion of a safely owner-scoped trusted write, consistent with—but not conclusive proof of—the observed late persistence.

No timeout behavior was changed in this stage because the source-identity repair is independently scoped. The minimal future repair is a single shared enrichment deadline propagated as an abort signal to the optional provider; it must preserve save-first behavior and must never convert a metadata timeout into a failed Memory save.

## Local verification

- `npm run lint`: passed with zero errors; it reports four pre-existing unused-import warnings in capture test files outside this change.
- `npm run typecheck`: passed.
- Focused `tests/supadata.test.ts`: 15/15 passed.
- `npm test`: 320/320 passed.
- `npm run build`: passed; Turbopack compiled, TypeScript completed, all 19 static pages generated, and the route manifest finalized.
- `git diff --check`: passed.
- No live provider, hosted database, or browser test was run in this stage.
