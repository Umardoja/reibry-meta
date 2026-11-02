# Stage 12N-1 — Secure one-action iPhone Shortcut capture

## Selected design

REIBRY will use a direct HTTPS `POST /api/shortcut/capture` from the owner's Apple Shortcut, rather than treating a browser fragment as proof of an intentional share. The request contains only the shared public link and a generated request UUID; the credential is sent in the `X-REIBRY-CAPTURE-KEY` header, never in a URL.

This is feasible on iPhone Shortcuts because **Get Contents of URL** supports a JSON `POST` with custom headers. It does not rely on Safari cookies. The existing `/capture` page, manual Save button, and fragment prefill flow remain unchanged as fallbacks.

## Scoped credential boundary

The proposed credential has format `rsc1_<32 random bytes base64url>`. REIBRY creates it after verifying the ordinary owner session, returns it once in the authenticated setup response, and stores only a SHA-256 hex hash. It is not an application session, Supabase publishable key, service-role key, or general API token.

`20261103000000_shortcut_capture_devices.sql` is local and **UNAPPLIED**. It adds:

- `capture_devices`: owner ID, hash, display name, expiry, revocation and last-use timestamp; maximum five active credentials per owner;
- `capture_device_requests`: an atomic `(device_id, request_id)` replay ledger pointing to the saved Memory; and
- owner-session RPCs to issue, list safe device descriptors and revoke a credential, plus one `service_role`-only `capture_from_device` RPC.

Both tables use forced RLS and grant no direct table access to `anon` or `authenticated`. The setup functions derive the owner from `auth.uid()`. The trusted capture function is executable only by the server-held secret role; it locks the credential row, checks expiry/revocation, enforces 12 new requests per minute, stores/reuses a durable request result, and writes only an owner-bound link Memory through the existing dedupe key. It cannot read Memories, Plans, Life data, Action Cards, or invoke enrichment. The server-only `createTrustedShortcutCaptureClient` is restricted to this RPC, not ordinary reads.

The database cannot cryptographically prove that the owner personally pressed Share: a stolen credential remains a bearer credential until expiry/revocation. That is why the credential is capture-only, revocable, short-lived (90-day default, 180-day maximum), rate-limited, never shown again, and should be rotated after suspected device loss.

## Request contract

```text
POST /api/shortcut/capture
Content-Type: application/json
X-REIBRY-CAPTURE-KEY: <private credential>

{"url":"https://public.example/post","requestId":"generated UUID"}
```

Only a public HTTPS link is accepted. The existing `parsePublicLink` policy rejects credentials in URLs, localhost/private/reserved IP addresses, unsupported schemes and malformed links before the trusted writer is reached. No link is fetched by this endpoint, so it cannot trigger Supadata, Muse, extraction, transcripts, uploads, redirect following or arbitrary server-side browsing. `src=shortcut`, fragments, query fields and caller-supplied owner IDs are ignored/rejected.

Success returns `saved` (201) or `already_saved` (200) with an opaque owner Memory ID. A timeout is deliberately ambiguous: the Shortcut must retry only with the **same** request UUID, which lets the ledger return the same saved result without a duplicate. A new intentional share creates a new UUID. Provider metadata remains the existing optional manual detail flow; `SUPADATA_DEV_ENABLED` stays false.

## iPhone Shortcut setup — after hosted migration approval

1. Sign in to REIBRY normally and open **Account → iPhone Shortcut saving**.
2. Create a credential named, for example, `Personal iPhone`. Copy the one-time value directly into the private Shortcut; do not put it in a note, URL, screenshot, exported Shortcut, or chat.
3. Preserve the existing Shortcut before editing it. Set its input type to **Receive Shortcut Input**.
4. Add **Get URLs from Input**, then **Get First Item from List**. If no URL exists, show `No public link received` and stop.
5. Add **Generate UUID** and retain it as `Request ID` for this one send/retry cycle.
6. Add **Get Contents of URL** with the private REIBRY HTTPS origin plus `/api/shortcut/capture`, method **POST**, request body **JSON**, fields `url` (the first URL) and `requestId` (the generated UUID). Add headers `Content-Type: application/json` and `X-REIBRY-CAPTURE-KEY: <private credential>`.
7. Parse the response Dictionary. Show `Saved to REIBRY` for `data.status = saved`, `Already saved` for `already_saved`, or the supplied safe error message. On a network timeout, do not claim success; retry using the same `Request ID` or check Memories.
8. Keep the current browser-handoff/manual-capture fallback until the physical iPhone flow has passed.

Do not put a Supabase session, service key, ordinary password, or this capture credential in any URL, public Shortcut share link, or automation visible to another person.

## Verification and release gate

Automated tests cover credential shape/hash input, bounded setup input, missing/revoked/expired/rate-limited failures, malformed/private URLs, forged fragment/owner fields, duplicate/replay/concurrent behavior, no enrichment/provider call, migration ACL/RLS structure, and unchanged manual Capture/fragment behavior. `supabase/tests/shortcut_capture.sql` is a rollback-only two-user local PostgreSQL verification plan for ACLs, revocation, ownership and replay. It has not been applied to a hosted database.

Before any activation the owner must separately approve: applying the migration to the confirmed disposable development project; configuring the server-only `SUPABASE_SECRET_KEY` and `SHORTCUT_CAPTURE_ENABLED=true`; issuing a credential from the authenticated settings page; and a physical iPhone test. The live test must cover successful Save, duplicate Save, expired/revoked credential, timeout replay with the same UUID, manual Capture fallback, sign-out behavior, and device revocation. No automatic-sharing PASS is claimed until that physical test succeeds.
