# Meta Model API readiness

Verified against Meta's official documentation on 2026-10-29 (Africa/Lagos). This document records a future integration boundary only. Stage 7 installs no SDK, adds no API key, and makes no Meta Model API request.

## Current official interface

- Base URL: `https://api.meta.ai/v1`
- Recommended current Muse Spark Standard model: `muse-spark-1.3`
- Generation endpoint selected for Stage 8: `POST /v1/responses`
- Authentication: `Authorization: Bearer $MODEL_API_KEY`
- Server-only environment variable: `MODEL_API_KEY`
- Responses structured output: `text.format` with `type: "json_schema"` and optional strict validation; top-level `response_format` does not configure Responses structured output.
- Current context window: 1,048,576 tokens; documented maximum output for Muse Spark 1.3 is 131,072 tokens. REIBRY should use much smaller application limits.

Sources: [overview](https://dev.meta.ai/docs/overview), [quickstart](https://dev.meta.ai/docs/quickstart), and [API reference](https://dev.meta.ai/docs/api-reference). The API also offers Chat Completions and Anthropic-compatible Messages, but the Responses API is the documented direct-call quickstart and best fit for later structured evidence handling.

## Errors, retry and access

Errors use an OpenAI-style `{ error: { message, type, param, code } }` envelope. Relevant cases from the official [error guide](https://dev.meta.ai/docs/error-handling): `400 invalid_request_error`, `401 authentication_error`/`invalid_api_key`, `402` billing errors, `403` unavailable model/feature access, `404 model_not_found`, `413 payload_too_large`, `429 rate_limit_error`, retryable `500`/`503`, and `504 gateway_timeout`. Stage 8 should return explicit provider errors without exposing keys or raw private prompts. It should not retry 400/401/402/403/404/413; bounded exponential backoff with jitter and `Retry-After` applies to 429/500/503.

The official [pricing and rate-limit page](https://dev.meta.ai/docs/pricing-rate-limits) currently lists Standard `muse-spark-1.3` at 3,000 requests/minute and 4,000,000 tokens/minute per team, not per key. Successful token responses include request/token quota headers. Access, billing, actual team limits and model availability must still be verified in the Model API dashboard; no access is assumed.

Standard mode documentation states submitted content is not used to train Meta models. Contributor variants offer lower prices in exchange for permission to train on prompts, code, files, context and responses. REIBRY handles private Memories, so the integration must default to Standard `muse-spark-1.3`; Contributor mode must not be selected implicitly.

## Smallest Stage 8 integration point

The Stage 8 server-only adapter accepts a structure equivalent to:

~~~ts
type GroundedMuseInput = {
  query: string;
  evidence: Array<{
    memoryId: string;
    title: string;
    sourceType: "text" | "link";
    storedExcerpt: string | null;
    sourceUrl: string | null;
    processingStatus: "processing" | "complete" | "partial" | "failed";
    evidenceFields: Array<"title" | "note" | "metadata" | "hostname">;
  }>;
  constraints: {
    metadataOnlyLinksContainNoPageOrVideoBody: true;
    citeOnlySuppliedMemoryIds: true;
  };
};
~~~

The implemented adapter is bounded, abortable and tested with injected mock transport before any approved live call. The browser never receives `MODEL_API_KEY`. The server validates structured output, rejects unknown Memory citations, distinguishes provider/access/rate-limit errors, and avoids sending evidence when retrieval returns no match. See `META_INTEGRATION.md` for the completed boundary.
