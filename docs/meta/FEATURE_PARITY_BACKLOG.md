# Feature parity backlog

## Stage 11 order

1. **Life foundation — restored in Stage 11A:** typed original contexts, owner repository, local migration/RLS definition, CRUD and the `/life` and `/life/manage` workflows are implemented. Disposable-database RLS and authenticated browser verification remain required; automatic Memory matching is deferred.
2. **Today resurfacing (Stage 11B):** port owner-scoped “why now” ranking over actual Memories and Life items, including source explanations and deterministic empty/error states.
3. **Original conversational Home orchestration:** reconnect search, Life intent, planning intent and conversation state while retaining Stage 8 evidence/citation validation.
4. **Plans:** port Plan contracts, owner storage/RLS, CRUD, intention state and Memory selection. Keep Action Cards distinct, with an explicit user-controlled conversion boundary later.
5. **Ready Packs:** port guides/checklists only after Plans and retrieval are verified; never infer completion or source evidence.
6. **Onboarding/profile/settings:** add minimum owner profile and notification preferences with no admin-role shortcuts.
7. **Remaining capture/source fidelity:** add only original supported types whose safety boundaries and permissions can be reproduced.
8. **End-to-end verification:** disposable Supabase two-user/RLS tests, synthetic authorized Meta verification, authenticated browser journeys and screenshot comparisons.

Still out of scope: autonomous external tools, calendar/email/payment execution, production database use, service-role request paths, semantic/vector search, native Android sharing, deployment and remote publication.
