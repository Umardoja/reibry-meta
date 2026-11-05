# Stage 12N — Planning and automatic-share review

## Scope and status

This stage adds a small, deterministic bridge from the restored conversational Home to the existing owner-bound Plan and Ready Pack systems. It does not call Muse Spark, Supadata, or any other provider. It also does **not** enable automatic share saving: the current URL fragment handoff is intentionally prefill-only because `#url=...&src=shortcut` is forgeable by any site.

## Planning improvements

New code in `src/lib/plans/guidance.ts` classifies an explicit planning request as one of three bounded types: exam/study, celebration, or project deadline. It uses the existing date resolver and asks one concise question instead of guessing when a date or an exam subject is absent.

For a complete request, Home:

1. derives an unsaved, editable Plan draft and a practical four-step suggested outline;
2. queries only the authenticated owner's existing lexical Memory repository;
3. returns no more than six actual retrieval results, with their normal match reasons and provenance limits;
4. requires the user to check the Memories they want before calling the existing Plan API; and
5. sends the user to the pre-existing Ready Pack confirmation screen after Plan persistence succeeds.

The draft schedule is REIBRY advice, not evidence. Candidate cards are evidence-bound: metadata-only links remain limited to their saved details and Supadata descriptions keep the `origin not verified` disclosure. No candidate is silently selected or attached. A no-match result presents a general outline without pretending that the user has a supporting saved resource.

The existing Plan API remains the single persistence boundary, including server-derived ownership, owner-only Memory/Life references, idempotency, optimistic versioning, RLS-backed Supabase functions, and private/no-store responses. Existing Ready Pack confirmation remains a separate explicit action.

`HomeUpcomingPlan` adds a small Home rediscovery cue for a real active Plan with a confirmed future date. It does not estimate tasks remaining because the existing persisted model records Ready Pack section review, not individual scheduled-task completion.

## Verified deterministic scenarios

The Home test suite now covers:

- a biology exam in seven days, with owner-scoped biology evidence;
- a birthday/celebration with an actual candidate Memory;
- a project deadline with an honest no-evidence draft;
- missing date and missing subject clarification;
- no Muse invocation, Action Proposal creation, or Plan persistence while drafting.

The existing Plan and Ready Pack suites retain coverage for user-confirmed persistence, selected-Memory ownership, cross-user rejection, idempotency, refresh-safe Ready Pack confirmation, and checklist progress.

## Current Ready Pack boundary

Existing persisted Ready Pack types are `learning`, `event`, and `travel`. Exam/study and birthday requests map to the existing learning/event flow. A generic project deadline can safely create a Plan with selected Memories, but cannot truthfully create a Ready Pack yet: adding a `project` pack type changes the enforced hosted SQL type/section contract and requires a separate migration-approval checkpoint. This stage does not bypass that constraint or relabel a project as learning.

## Automatic iPhone share save — security decision

The present iPhone Shortcut hands an HTTPS URL into `/capture` through a URL fragment. The app safely strips that fragment, preserves it through sign-in in tab-scoped storage, validates the link server-side, and asks the user to tap **Save**. This is intentional.

Making a page auto-POST merely because `src=shortcut` is present would be unsafe: any third-party page can navigate an already signed-in browser to a URL with that fragment, after which same-origin JavaScript could issue an authenticated capture request. A browser-local opt-in does not prove that the navigation was an intentional share and does not close that attack.

### Required design before auto-save can be enabled

A future, separately approved implementation needs a narrowly scoped and revocable share-handoff capability:

- created only by an authenticated owner during one-time Shortcut setup;
- restricted to one owner, public HTTPS capture URLs, a short expiry, and one use;
- stored/consumed atomically server-side, with replay protection and revocation;
- carried only in the fragment or Shortcut-local input, never as a Supabase session, service key, or general account credential;
- validated before the existing `/api/capture` service is reached;
- consumed only after persistence succeeds or recorded as failed with a bounded retry policy;
- explicitly disableable by the owner; and
- usable later by an Android share receiver through the same capture service, not through a bypass endpoint.

That requires a dedicated persistence design and likely an additive migration, both outside this stage's authorization. No Shortcut changes were made. Manual Capture and the current share prefill remain intact.

## Verification limits

Local regression completed with 328 passing tests, `npm run lint` (no errors; four pre-existing unused-test-import warnings), `npm run typecheck`, `npm run build`, and `git diff --check`. A signed-in private-development Home session displayed the review-first birthday draft, actual owner-scoped candidate Memory cards, source links, editable fields, and unchecked selection controls. No Plan was created during that browser check, so no test-account record was changed.

No production Meta call, Supadata call, hosted migration, database mutation, or physical iPhone test occurred for this stage. Exact 390px/1440px browser viewport automation was unavailable in the attached browser, so those viewport results remain unverified; the existing centered mobile shell and five-tab navigation were preserved. A future owner acceptance pass must manually verify the physical Share Sheet after the capability design is approved. Desktop simulation cannot prove iPhone share-sheet behavior.
