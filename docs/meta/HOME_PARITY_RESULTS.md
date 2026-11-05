# Stage 11C Home parity results

## Result

The original REIBRY conversational Home is again the root product experience. Its layout and interaction hierarchy are inherited from REIBRY Original, while all data and reasoning operations use the hardened Meta Edition boundaries. No hosted database, live model, remote Git service or external tool was contacted.

## Original dependency and compatibility map

| Original source | Meta Edition target | Treatment |
| --- | --- | --- |
| `src/app/page.tsx` | `src/app/page.tsx`, `src/components/home/home-conversation.tsx` | Restored original heading, welcome, suggested prompts, user/assistant turns, cards, new-chat control, loading/error feedback and sticky composer. |
| `src/components/home/home-conversation-provider.tsx` | local bounded component state | Preserved ephemeral 24-turn conversation behavior without browser token/data persistence. Plans/Ready Pack draft state was deliberately excluded. |
| `src/app/api/home/route.ts` | `src/app/api/home/route.ts`, `src/lib/home/{server,handler}.ts` | Replaced the broad legacy orchestrator with one verified-session, same-origin, bounded allowlist. |
| `src/lib/agent/home-agent.ts` | `src/lib/home/intent.ts` | Adapted deterministic intent concepts only. No model-selected tools or arbitrary function names are accepted. |
| Original retrieval/orchestrator search | Stage 7 `searchOwnedMemories` | Returns actual owner Memory evidence and exact existing links; unrelated results are not padded. |
| Original provider reasoning | Stage 8 `executeGroundedAsk` | Shared implementation retains six-Memory limit, structured output, citation verification, budgets, prompt-injection rules and proposal persistence. No second provider adapter exists. |
| Original Life intention handling | Stage 11A Life service/repository | Produces a bounded deterministic draft, requires a real date and explicit confirmation, then uses owner-bound idempotent creation. |
| Original action suggestions | Stage 9 proposal/card endpoints and shared review component | Lists trusted persisted proposals and confirms/rejects only through existing owner-bound endpoints. Saved cards remain “not executed.” |

## Supported intents

1. Find saved Memories through deterministic lexical retrieval.
2. Answer a question from stored evidence through Muse Spark when configured; no match skips the provider.
3. Show upcoming Life contexts, with optional title/description filtering such as birthday plans.
4. Show active Life contexts that still need dates.
5. Prepare a Life draft and save it only after explicit confirmation.
6. Review current Action proposals and use the existing trusted-ID confirmation/rejection workflow.
7. Ask a clarification question for ambiguous input and reject external-tool requests honestly.

The operation allowlist contains no endpoint/model/tool selection. Email, messaging, booking, payment, browsing, shell, calendar execution and scheduling are unavailable. Plans and Ready Packs are not substituted with Action Cards.

## Evidence, ownership and confirmation boundaries

- `/api/home` accepts only a 500-character message, an IANA timezone and one of `message` or `confirm-life`. Unknown fields and cross-site mutations are rejected.
- One verified session creates the non-elevated Memory, Life and Action repositories. Their owner IDs must all equal the verified user.
- Memory search uses stored title/note/metadata/hostname evidence only. Metadata-only links remain labeled as such.
- Grounded reasoning calls the same Stage 8 executor used by `/api/ai/ask`; citations and suggested-step Memory IDs must be in the authorized evidence set.
- A Life draft is inert and says so. Missing dates cause a follow-up question. Confirmation recomputes the same bounded draft server-side and persists through the existing idempotent owner repository.
- The Home client cannot submit proposal text, owner IDs, Memory evidence, models, provider URLs or arbitrary tool names. Action confirmation accepts only an existing trusted proposal ID through Stage 9.
- Responses are private/no-store and bounded to 25 seconds. Stored content and provider errors are not logged or reflected.

## Intentional differences

- Original Home included Plans and Ready Pack building, selection and persistence. Those domains are not securely migrated and remain deferred rather than represented by fake cards or Action Cards.
- Original Home could use a model to choose tools. Stage 11C uses deterministic allowlisted routing; Muse is called only for grounded Memory questions.
- Conversation turns are not persisted across refresh. This matches the current privacy boundary and avoids adding an unreviewed conversation store.
- Original automatic Memory/Life matching remains read-only; Home does not persist inferred associations.

## Verification boundary

- Deterministic tests cover routing, Memory search, grounded reasoning/no-match, metadata-only evidence, Life upcoming/undated queries, draft confirmation/idempotency, missing dates, Action review, ownership/auth failures, provider/storage failures, forged fields, cross-site requests and absence of Plans/tools/mocks.
- Existing auth, Capture, Memory, retrieval, Muse, Action, Life, Today and production smoke tests remain in the full suite.
- Automated tests use synthetic repositories and mocked provider transport. They never contact Supabase or Meta.
- Hosted Supabase/RLS persistence and live Muse inference remain **NOT VERIFIED**.
- An isolated production build was opened in desktop Chrome without credentials. The root rendered the original shell/navigation and safe signed-out state without visible horizontal overflow; the Home auth return target was verified as `/`. Authenticated Home cards and exact viewport screenshots remain unverified.
- Authenticated screenshot comparison at 390×844, 430×932 and 1440×1000 remains **UNVERIFIED** without an approved disposable session. Pixel-perfect parity is not claimed.

## Remaining original-product work

The next parity milestone should restore the original Plans domain with its own contracts, owner storage/RLS, CRUD, Memory selection and plan detail. Ready Packs must follow Plans rather than being folded into Home or Action Cards. Onboarding/profile settings, remaining original capture types and approved disposable end-to-end verification also remain outstanding.
