# Stage 4 authentication dependency map

Source: original REIBRY commit 76d3494465bab43a5051498e90b9a486a65312b9.
Original contributors retain attribution and applicable rights. This is an auth migration with security adaptations, not new Meta AI functionality.

| Source | Reuse/adaptation | Excluded coupling |
| --- | --- | --- |
| lib/supabase/server.ts, client.ts, proxy.ts, env.ts | SSR getAll/setAll cookies; validated explicit configuration; server-only adapter | No direct browser SDK, browser token store, blanket refresh proxy, old production values or service-role keys |
| lib/auth/password-handler.ts, account-policy.ts | Input validation and safe error codes | No raw provider data/token response, integration-handler dependency or account enumeration message |
| lib/auth/service.ts | getUser verification; sign-in/up/out | No profile query, admin role or database access |
| lib/auth/next-destination.ts | Same-origin return URL validation | Restrict returns to existing / and /account routes; reject encoded separators/control characters |
| components/auth/auth-session-provider.tsx, require-auth.tsx, sign-out-button.tsx | Session context, gated content and explicit retry/sign-out | No native bridge, query cache or optimistic authenticated setter |
| app/auth/page.tsx, auth/callback/route.ts | Form conventions, password visibility, confirmation flow, PKCE callback | No onboarding or account/profile table lookup |
| tests/account-reliability.test.ts, auth-next-destination.test.ts | Error classification and redirect regression cases | Replace source-pattern-only confidence with mocked behavior tests |

Findings: the inspected source session fetch and form requests are unbounded, and some handlers expose Supabase's full auth result. Local source tests do not prove that the original production bug is fixed. This port adds bounded requests, minimal responses and fail-closed states rather than assuming that all current source behavior is hardened.

Architecture: browser UI -> same-origin Next route handlers -> pure injectable auth orchestration -> server-only Supabase SSR adapter. Production handlers always bind the real adapter; mocks exist only in tests. HttpOnly, SameSite=Lax cookies are isolated under reibry-meta-auth. No tokens are returned to browser JavaScript. No browser Supabase client is needed because all auth operations use this server boundary.

Protected /account rendering and /api/auth/me each verify the user on the server. The client guard is supplementary and denies content during checks/errors. Cookie refresh happens in route handlers and a narrow /account proxy. That proxy forwards refreshed cookies to the request and response, but the page still verifies independently. Server components only read cookies and fail closed if another refresh would need to be persisted. No middleware grants access from unverified cookie contents.

Configuration is disabled by default. AUTH_ENABLED, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and AUTH_SITE_URL are server-only variables. Only a modern publishable key is accepted; privileged and legacy JWT keys are rejected. No values are copied or provisioned. A separately approved disposable project is required for live verification.

Official references consulted:
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- Installed Next.js route-handler, cookies and redirect guides.

No Supabase project, real users, migrations, profiles, AI services or hosted data are part of this stage.

## Bounds and security adaptations

Server operations have an eight-second deadline, including request-body parsing and SDK work, with an AbortSignal propagated to transport. Late cookie writes are discarded. The protected navigation may perform two sequential bounded checks (proxy and page); this is not an eight-second total navigation guarantee. Browser requests are bounded to twelve seconds. Session checks allow two manual retries after the initial attempt, without an automatic retry loop; focus and explicit auth changes start a fresh check. Stale results cannot restore access after state changes.

Mutations require POST and an exact same-origin Origin header and reject cross-site Fetch Metadata. Request bodies are limited to 8 KiB. Redirect destinations are an exact allowlist, not arbitrary same-origin paths. Provider messages and session tokens are never reflected in JSON. Auth responses use private/no-store caching. Cookies are host scoped, HttpOnly, SameSite=Lax and Secure on HTTPS; HTTP is accepted only for loopback development. No custom token storage or direct browser Supabase client is present. The publishable key is read only on the server; no service-role capability exists.

Sign-out immediately hides client protected content and clears all known cookies in this app's namespace when the endpoint responds, including on provider timeout. Remote revocation failure is explicitly reported. A transport failure before the response cannot prove browser cookies were cleared; the UI asks the user to retry. Existing access tokens may remain valid until provider expiry even after refresh-token revocation. Other projects' cookie names are never cleared.

## Verification limits

Mocked tests prove the local orchestration and SDK/SSR cookie integration under controlled responses. They do not establish successful hosted sign-in, email delivery/PKCE confirmation, refresh-token rotation, concurrent-tab refresh races, provider settings or revocation in a real project. Real Supabase authentication is NOT VERIFIED. No test contacts a hosted Supabase project or creates a user.

Before deployment, authorize a disposable project and verify HTTPS/canonical origin, allowed callback URL, confirmation email template/PKCE behavior, session refresh, sign-out and provider anti-abuse limits. The application has no distributed rate limiter, CAPTCHA, password recovery, MFA, OAuth, roles, onboarding, profiles or database access. Runtime configuration cannot prove a project is disposable; the owner must supply an explicitly approved project and must never use the original production configuration. Failed checks deny access; this does not certify the original application's production bug fixed.