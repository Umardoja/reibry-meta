# Stage 8 Meta Muse Spark integration

Stage 8 is new Meta Hackathon development built on the migrated REIBRY auth, Memory and retrieval foundations. It adds genuine Meta Model API production code; tests replace the transport only and there is no production mock fallback. No billable call has been made, so live inference remains **NOT VERIFIED**.

## Official interface

Verified against Meta documentation on 2026-10-29:

- Standard model: `muse-spark-1.3` (never a Contributor model ID)
- endpoint: `POST https://api.meta.ai/v1/responses`
- authentication: server-only `MODEL_API_KEY`
- persistence: `store: false`
- structured output: Responses-native `text.format = { type: "json_schema", name, strict: true, schema }`
- output budget: 800 tokens maximum for the application path
- tools: empty; no web search, file/media input or external function tools

Official sources: [overview](https://dev.meta.ai/docs/overview), [Responses protocol](https://dev.meta.ai/docs/protocols/responses), [structured output](https://dev.meta.ai/docs/structured-output), [error handling](https://dev.meta.ai/docs/error-handling), and [pricing/rate limits](https://dev.meta.ai/docs/pricing-rate-limits).

The direct Web `fetch` adapter avoids another dependency. It requires a currently documented `LLM_{id}_{secret}`-shaped key, uses a twelve-second attempt deadline and makes one normal request with no more than one retry. Only `429`, `500` and `503` retry, with bounded exponential delay. `Retry-After` values up to two seconds are honored; a longer value suppresses the retry rather than creating a long request. Authentication, billing, access, validation and other failures are not retried. Provider error bodies, prompts and raw responses are never logged or returned.

## Data and evidence boundary

`POST /api/ai/ask` verifies the Stage 4 server session, creates the non-elevated owner-bound Memory repository and reuses Stage 7 lexical retrieval. The client can submit only `question`; it cannot submit a user ID, model, endpoint, evidence or Memory ID. No match returns a fixed insufficient-evidence answer without contacting Meta or consuming the provider throttle.

At most six Retrieval items become model evidence. Each contains only Memory ID, display title, source type, up to 280 characters of stored note evidence, up to three source-metadata values that actually matched the query, processing status, retrieval reason and redacted provenance. URL usernames, passwords, paths, queries and fragments are removed; only the HTTPS origin and hostname may remain. Serialized evidence is limited to 12,000 bytes and the complete provider request to 32,000 bytes. Full Memories, cookies, account fields and raw database records are not sent.

All question/evidence text is explicitly untrusted. Developer instructions prohibit following embedded instructions; inventing Memories, transcripts, webpage/video bodies, summaries, context, citations or completed actions; and treating suggestions as execution. Metadata-only links carry a `metadata-only-link` marker. Runtime validation rejects answers that cite one while claiming a transcript/page/video body or omitting the evidence limitation.

## Structured result and validation

The strict schema contains `answer`, `evidence_status`, `cited_memory_ids`, and `proposed_next_steps`, each with supporting Memory IDs. The provider schema uses only Meta's supported strict JSON Schema subset; the application then enforces uniqueness, lengths, item counts, enums and exact keys at runtime. The Responses extractor accepts the documented optional message status, ignores reasoning items, combines ordered `output_text` blocks, explicitly rejects refusals/incomplete output, and verifies every citation against the exact owner evidence sent. Valid JSON does not bypass evidence checks.

Sanitized server-side diagnostics distinguish envelope, incomplete, refusal,
missing/oversized output, invalid JSON, runtime schema, citation, grounding, and
usage failures. Raw provider output and those internal diagnostic details are
not returned through the public Ask API.

The browser receives only the validated answer, status, token counts, exact Memory anchors and inert suggestions. It never receives the API key, provider payload or raw provider response. No database mutation, Plan, Ready Pack, reminder, calendar event or tool execution exists in Stage 8.

## Plans entry point

`Plan with Muse` uses the same authenticated `POST /api/home` boundary rather than a second planning agent. After the deterministic planner has collected essential goal/date information, it searches only the signed-in owner's saved Memories and sends at most the existing six evidence items to `muse-spark-1.3` through the Responses endpoint above. A validated answer may improve the reviewable schedule and explain the selected Memories; it cannot create a Plan, Ready Pack, task, action, event or external operation. The user chooses the Memories and explicitly creates the Plan through the existing owner-bound Plan and Ready Pack flow. If Muse is unavailable, the visible outline remains a clearly labelled deterministic, reviewable fallback. Automated tests exercise both paths with injected transport; no live Muse inference was made for this UX pass.

## Availability and cost controls

The application requires `META_RATE_LIMIT_MODE=in-memory` as an explicit operational opt-in. It permits five provider calls per user per minute per server process. This is a real local gate, but not a distributed quota; a multi-instance deployment must replace it with shared atomic enforcement before release. Search/no-match requests do not consume the provider gate.

The API limits the response to 800 tokens and makes at most two provider requests including a transient retry. Standard pricing verified on 2026-10-29 is $1.25 per million input tokens and $4.25 per million output tokens. Token usage is accepted only as non-negative integers and is returned in a minimal usage object. The separate live verifier uses the same 800-token ceiling and synthetic evidence. Muse Spark reasoning tokens count within that ceiling, so the prior 384-token verifier budget risked leaving too little visible JSON. Its maximum two-request Standard estimate remains below $0.01.

## Verification boundary and Stage 9

Automated tests use injected fetch responses and test-only owner repositories. They verify request construction, official output-envelope variants, refusal/incomplete handling, output/citation enforcement, owner isolation, prompt injection handling, status/retry mapping, usage, throttle behavior and fail-closed errors without network calls. Stage 12B reached the provider but did not produce a locally validated result; because its raw response was intentionally discarded, the exact historical rejection remains unknowable. Hosted auth, RLS, successful grounded model output, quality and latency remain unverified.

Stage 9's smallest boundary is a persistent, owner-bound proposal/confirmation ledger with idempotency keys. It may save a user-approved proposal state, but must not execute external actions yet and must continue to treat Stage 8 next steps as suggestions.
