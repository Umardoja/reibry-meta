# Stage 11B Today parity results

## Result

The original REIBRY Today composition is restored over the Stage 5 Memory, Stage 7 retrieval and Stage 11A Life foundations. It reads only owner-bound stored evidence, does not persist inferred relationships and makes no model or external-action request. Hosted Supabase behavior and authenticated visual parity remain unverified without an approved disposable environment.

## Original dependency map

| Original source | Meta Edition target | Treatment |
| --- | --- | --- |
| `src/app/today/page.tsx` | `src/app/today/page.tsx`, `src/components/today/today-workspace.tsx` | Restored “Why now,” greeting, resurfaced-card hierarchy, “Why this came back,” Upcoming Life, loading, empty and error states. |
| `src/app/api/today/route.ts` | `src/app/api/today/route.ts`, `src/lib/today/{server,handler}.ts` | Replaced the broad orchestrator with one protected, bounded, private/no-store read endpoint. |
| `src/lib/integration/orchestrator.ts` (`today`, lexical matching) | `src/lib/today/service.ts` | Adapted bounded owner reads, deterministic lexical overlap and stable ordering. Removed provider/action/persistence coupling. |
| `src/lib/integration/today-ranking.ts` | `src/lib/today/service.ts` | Preserved three-item maximum, Life-date proximity, unique Memory results and stable relevance ordering. |
| `src/lib/data/{store,supabase-store}.ts` | Stage 5 Memory repository and Stage 11A Life repository | Added a bounded `listUpcoming` Life query; Memory scan remains capped at 250 owner records. |
| Original Today CSS in `src/app/globals.css` | Meta `src/app/globals.css` | Ported original card, pill, chronology, typography, spacing and responsive selectors. |

## Contextual matching rules

- Today reads at most 50 active dated Life contexts and 250 newest owner Memories, considers at most 12 upcoming contexts and returns at most three Life rows and three unique Memories.
- Matching uses normalized literal terms from the Life title/description against only the saved Memory title, saved note text, whitelisted stored source metadata and saved hostname.
- Generic Life/date words are excluded. A candidate requires at least 25% Life-term coverage or two distinct literal term matches.
- Ranking combines literal coverage, strongest stored evidence field and the original near-date proximity boost. Ties use Life date, Memory creation time and Memory ID.
- Processing-state Memories remain eligible only through their already stored evidence. Failed records are excluded.
- A link has no stored body excerpt. Its card explicitly says the match is metadata-only and never implies webpage, article, video or transcript understanding.
- No match is returned when evidence is insufficient; unrelated Memories are never used as padding.

## Ownership and privacy boundary

- The verified server session creates both repositories from one non-elevated Supabase client. Caller identity and evidence cannot be supplied through query parameters or request bodies.
- Repository owner IDs must equal the verified user, and returned rows are checked again for that owner before ranking.
- `/api/today` accepts GET with no filters, has an eight-second server deadline, returns private/no-store responses and emits safe errors without stored content.
- Exact links use `/memories/{id}` and `/life/manage#life-{id}`. The Life manager exposes the matching owned anchor.
- No relationship row, proposal, action, reminder, plan or background job is created. `memory_context_matches` remains read-only for authenticated clients.

## Differences and deferred behavior

- Original Today could display previously persisted model-evaluated matches and offered action-generation buttons. Stage 11B calculates read-only literal associations and deliberately omits action creation. Stage 9 Action Cards remain available only through their explicit review/confirmation workflow.
- Original thumbnails and AI summaries are not used because this edition has only bounded note/link evidence and must not imply unsupported analysis.
- Past and undated Life contexts remain available in Life management but do not appear in Today, matching the original chronology rule.
- Plans/Ready Packs and conversational Home orchestration remain deferred to later parity stages.

## Verification boundary

- Synthetic deterministic tests cover chronology/date boundaries, matching/no-match, metadata-only and processing records, stable limits, ownership isolation, auth denial, storage failure, read-only behavior and original UI states.
- Production HTTP smoke verifies unauthenticated `/api/today` denial and `/today` redirection to authentication while preserving all existing protected routes.
- No test contacts Supabase, Meta or another provider. Live Supabase persistence/RLS is **NOT VERIFIED**.
- Fresh desktop Chrome QA verified `/today` redirects to `/auth?next=%2Ftoday` with the restored shell/auth styling and no visible horizontal overflow. Authenticated screenshots at 390×844, 430×932 and 1440×1000 remain **UNVERIFIED** without an approved disposable session. The available Windows controller did not expose exact viewport resizing, and pixel-perfect parity is not claimed.

## Stage 11C prerequisites

Restore the original conversational Home orchestration by routing grounded Memory search, Life-context creation/show-upcoming intent and existing Stage 8 Muse reasoning through the current secure endpoints. Preserve strict evidence/citation validation, keep Action Cards distinct from original Plans and do not implement Plans or Ready Packs inside Stage 11C. A persisted Memory/Life match operation still requires an explicit owner-verified server function plus disposable two-user PostgreSQL/RLS verification.
