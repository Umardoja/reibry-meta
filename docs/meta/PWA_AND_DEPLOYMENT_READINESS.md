# PWA and deployment readiness

Date: 2026-11-04. This document prepares the existing REIBRY application for
deployment; it does not authorize a deployment, a hosted database mutation, or
public provider access.

## Local PWA surface

- `src/app/manifest.ts` supplies the install manifest: `REIBRY`, `From saved to
  done`, cream background, deep-green theme, standalone display, generated
  application icon, and Android/Chromium Web Share Target parameters.
- `src/app/icon.tsx` and `src/app/apple-icon.tsx` generate first-party PNG
  icons at build time. No licensed bitmap is copied.
- There is intentionally **no service worker**. Installation does not require
  offline caching, and a cache must not contain authenticated API responses,
  user Memories, cookies, or tokens.
- The share target opens `/capture?title=…&text=…&url=…`. Existing parsing
  accepts a bounded HTTPS URL from either `url` or shared `text`, retains
  surrounding words separately, and relies on the same authenticated,
  owner-scoped capture POST and server-side deduplication.

### Android automatic-save boundary

A manifest share target cannot cryptographically prove that a navigation came
from Android’s share sheet; any web page can navigate to an equivalent URL.
Therefore this release preserves an explicit save from a query-based Android
share handoff. Making query arrival automatically issue a same-origin capture
POST would create a CSRF-like write primitive. A one-action Android flow needs
an approved, revocable platform-bound capability or a native receiver with a
secure session handoff. Neither is introduced here.

The physical iPhone Shortcut remains the verified automatic-save route. iOS
PWA installation does not create a share extension.

## Vercel boundary

The current Supabase project is disposable development infrastructure with
private test users and Memories. It must not be used for judge-facing public
deployment.

Before a preview or production deployment, the owner must provide a separate
production/staging Supabase project and separately approve its schema rollout.
Configure the app’s exact environment-variable names in Vercel, as applicable:

| Name | Purpose | Scope |
| --- | --- | --- |
| `AUTH_ENABLED` | Enables the authenticated Supabase adapter (`true` only). | Server |
| `AUTH_SITE_URL` | Single canonical HTTPS application origin used by cookies and same-origin checks. | Server |
| `SUPABASE_URL` | Supabase project URL. | Server |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe project publishable key used by server-created user clients. | Server/config |
| `SUPABASE_SECRET_KEY` | Trusted enrichment/proposal path only; never expose to browser code. | Sensitive server-only |
| `MODEL_API_KEY` | Server-only Meta Muse credential. | Sensitive server-only |
| `META_RATE_LIMIT_MODE` | Current accepted value is `in-memory`; production needs a separately approved shared limiter. | Server |
| `SHORTCUT_CAPTURE_ENABLED` | Existing optional capture-device API flag; leave disabled unless intentionally activated. | Server |
| `SUPADATA_*` | Private pilot controls; leave disabled/unset for public release. | Sensitive server-only |

`AUTH_SITE_URL` must match the deployed HTTPS origin exactly. Since mutation
routes compare `Origin` to that value, a Vercel preview hostname cannot safely
exercise authenticated writes while the value points to production. Use a
separate staging origin and Supabase Auth redirect allowlist for preview tests.

`.vercelignore` excludes local auth manifests, test evidence, CLI state,
private reports, credentials, and build output. Deploy from a clean Git commit
or clean Vercel build rather than a local prebuilt artifact.

## Required approvals before public availability

1. Provision and approve an isolated production/staging Supabase project.
2. Review and apply the existing schema there; then verify two-user RLS.
3. Configure Supabase Auth Site URL and redirect allowlist for the real HTTPS
   origin, plus a workable judge sign-in or email-delivery path.
4. Configure Vercel sensitive variables privately.
5. Decide on a shared Meta rate limiter and public Supadata rights, budget,
   abuse controls, and observability. The private Supadata pilot must not be
   widened by deployment.
6. Approve a Vercel preview deployment. Only after authenticated preview QA,
   approve production publication.

## Android APK

No Android project, signing key, APK, or Digital Asset Links file is generated
until a real public HTTPS origin exists. PWABuilder/Bubblewrap needs that origin
and a verified manifest. A web wrapper alone is not evidence of native Android
share integration.
