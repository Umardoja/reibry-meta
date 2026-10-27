# Stage 5 Memory dependency map

Source: original REIBRY commit `76d3494465bab43a5051498e90b9a486a65312b9`. Original contributors retain attribution and applicable rights. This milestone ports an inherited persistence foundation; it is not new Meta AI functionality.

| Original source | Stage 5 use | Deferred dependency |
| --- | --- | --- |
| `src/types/reibry.ts` | Camel-case Memory DTO, ISO timestamps, source and processing-state names | AI analysis, evidence, actions, categories and search fields |
| `src/lib/api/contracts.ts` | Strict input validation, bounded text and rejection of caller ownership | Capture source types and AI contracts |
| `src/lib/data/store.ts` | Repository instances bound to one verified user | Generic multi-table store, Life, actions and Ready Packs |
| `src/lib/data/supabase-store.ts` | Explicit `user_id` filters, row decoding, stable `created_at`/`id` ordering and bounded pagination | Search, deduplication, vectors and broad diagnostics |
| `src/app/api/memories/**` | List/read/update/delete route shape and private no-store responses | Full library filtering and analysis edits |
| `supabase/migrations/20260919000000_initial_foundation.sql` | Owner foreign key, owner-scoped index, RLS and timestamp trigger | Profiles, pgvector, Life, matches, actions and feedback |
| `tests/contracts.test.ts`, `tests/database.sql`, Memory tests | Forged-owner rejection and cross-user denial scenarios | Hosted database execution and later feature tests |

## Meta Edition boundary

The Stage 5 contract stores basic text Memories only through the API. The schema reserves a validated `link` source shape for Stage 6, but this stage cannot create it. A Memory contains its identifier, verified owner, title, original text or link, original-compatible processing status, server-managed metadata, and timestamps. It does not contain invented summaries, embeddings, tags, search results or AI output.

Each `MemoryRepository` instance is bound to exactly one owner. Production constructs it only after Stage 4 verifies the Supabase user with `getUser()`. Every Supabase operation also filters `user_id`; RLS is a second independent enforcement layer. Request bodies cannot select ownership. The in-memory adapter lives under `tests/support` and has no production import path or runtime switch.

API routes use a pure, injected handler for deterministic tests. Production injection always creates the authenticated Supabase adapter. Mutation requests require an exact canonical Origin, JSON bodies are bounded to 64 KiB, text is bounded to 50,000 characters, titles to 200 characters, list limits to 50, and offsets to 5,000. Private responses are never cached. Missing or cross-owner records both return `404`.

The local migration creates only `public.memories`, enables and forces RLS, grants the minimum authenticated columns, prevents ownership updates, and indexes `(user_id, created_at desc, id desc)`. It deliberately omits pgvector and all production-project assumptions. The migration and disposable RLS test plan are version controlled but are not executed in this stage.

Mocked application tests establish handler and repository ownership behavior. Static migration checks establish that the intended RLS definitions exist. They do not prove PostgreSQL or hosted Supabase behavior. Cloud RLS remains unverified until the owner approves a new disposable project.
