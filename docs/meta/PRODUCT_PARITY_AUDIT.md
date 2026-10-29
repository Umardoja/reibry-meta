# Product parity audit

Audited 2026-10-29 against read-only REIBRY Original commit `76d3494465bab43a5051498e90b9a486a65312b9`. Stage 10 restores presentation and routing, not missing data services. “Restored” below never implies live cloud verification.

| Experience | Original source | Meta route | Stage 10 result | Stage 11 dependency |
|---|---|---|---|---|
| Conversational Home | `src/app/page.tsx`, `components/home/*` | `/` | Original heading, assistant welcome, prompt language and sticky composer restored; current grounded Ask boundary retained | conversation history, Today/Life orchestration |
| Today | `src/app/today/page.tsx`, Today cards | `/today` | Route, hierarchy and truthful empty state restored | Today ranking and Life API |
| Authentication | `src/app/auth/page.tsx`, `components/auth/*` | `/auth` | Original brand/card composition retained with hardened Stage 4 handlers | disposable-cloud verification |
| Onboarding | `src/app/onboarding/page.tsx` | `/onboarding` | Protected route and original journey description restored; no fake completion | profile/Life setup persistence |
| Capture | `src/app/capture/page.tsx` | `/capture` | Original heading/composer composition adapted to hardened note/link API | recent-capture feed and later source types |
| Memories list | `src/app/memories/page.tsx`, `components/design/memory.tsx` | `/memories` | Original library hierarchy, actual list, lexical search and detail links | richer filters and enrichment |
| Memory detail | `src/app/memories/[id]/page.tsx` | `/memories/[id]` | Actual owned record, source/status and supported edit fields | structured analysis/tags/relationships |
| Ask | `src/app/ask/page.tsx` | `/ask` | Original search framing with Stage 8 grounded results and Stage 9 review | authenticated browser/live Meta verification |
| Life | `src/app/life/page.tsx` | `/life` | Original route/heading with explicit unavailable state | Life contracts, repository, RLS and parsing |
| Life management | `src/app/life/manage/page.tsx` | `/life/manage` | Original route and tabs described, no fake controls | Life CRUD/RLS |
| Plans | `src/app/plans/page.tsx` | `/plans` | Original route and identity restored; Action Cards remain separate | Plan repository/RLS/API |
| Plan detail / Ready Pack | `src/app/plans/[id]/page.tsx` | `/plans/[id]` | Protected original composition boundary, no fabricated pack | planning/selection/checklist persistence |
| Ready Packs | plan-detail components/APIs | `/plans/[id]` | Deferred within Plan detail | Ready Pack generator and owner-bound storage |
| Settings | `src/app/settings/page.tsx` | `/settings` | Account, Meta tools and notification sections restored | profile/notification preferences |
| Navigation/mobile shell | `components/layout/{app-shell,navigation}.tsx` | global | Original header, labels, five-item bottom navigation and safe areas restored | none for presentation |
| Loading/empty/error | globals, route loading, UI primitives | global | skeleton and honest states restored/adapted | authenticated scenario QA |
| Dialogs/bottom sheets | original modal/filter/detail dialogs | shared modal | Existing hardened dialog retained and visually aligned | route-specific dialog wiring |

## Compatibility map

- Grounded Muse reasoning stays behind `POST /api/ai/ask`; Home and Ask are presentation clients only.
- Exact Memory citations continue to resolve to `/memories/[id]` and remain owner-verified server-side.
- Proposal creation still occurs only after validated grounded reasoning. Confirmation/rejection endpoints and `/actions` are unchanged.
- Action Cards are linked from account/Plans as Meta planning artifacts; they are never presented as original Plans or executed work.
- Capture SSRF protections, auth fail-closed behavior, owner filters, RLS migrations and all prior regression tests remain authoritative.

No original `.git`, environment, user record, database, Word document, generated output, LFS object, font file or bitmap asset was copied.
