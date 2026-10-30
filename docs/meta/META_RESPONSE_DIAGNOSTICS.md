# Meta Responses diagnostics

Date: 2026-10-30 (Africa/Lagos).

This Stage 12C review used the official Meta Responses, response-schema,
structured-output, and reasoning documentation current on the date above. It
made **no Meta request**. The two-request Stage 12B allowance remains exhausted.

## What is known and what is not

Stage 12B's second synthetic request returned HTTP 200 and was then rejected as
`META_INVALID_RESPONSE`. The raw provider body was intentionally neither logged
nor retained. Therefore the exact historical failure cannot be proved
retrospectively: it may have been envelope extraction, incomplete output, JSON
parsing, runtime schema validation, citation validation, or grounding
validation.

The code review nevertheless found a documented parser defect that could reject
a valid Responses envelope:

- the official output-message `status` field is optional, but the extractor
  required it to equal `completed`; and
- the official response is an output-item array whose message content is an
  array, but the extractor required exactly one `output_text` block.

The old path also ignored the documented `refusal` content type and collapsed
all post-HTTP-200 failures into one category. Reasoning items were harmlessly
skipped, but there was no fixture proving that behavior.

## Request contract review

The request continues to use `POST https://api.meta.ai/v1/responses`, Standard
`muse-spark-1.3`, `store=false`, no tools, and Responses-native `text.format`
with `type=json_schema` and `strict=true`. It does not use the Chat Completions
top-level `response_format` field. Every object in the provider schema has
`additionalProperties=false`, and every declared property is required. The
application retains stricter runtime length, item-count, uniqueness, citation,
and evidence checks.

Muse Spark reasoning tokens count inside `max_output_tokens`. The application
ceiling remains 800. The opt-in verifier previously used 384; it now uses the
same 800-token ceiling so a future authorized diagnostic has room for reasoning
and visible JSON. At the documented Standard prices, two maximum-sized outputs
plus the verifier's sub-2-KB inputs remain below the verifier's $0.01 ceiling.
This is a future safety calculation, not a claim that another request ran.

## Correction

The extractor now:

- accepts an omitted message status and a completed status;
- ignores documented reasoning output items;
- concatenates ordered `output_text` content blocks before one JSON parse;
- rejects incomplete items, refusals, absent text, and oversized text;
- distinguishes envelope, incomplete, refusal, missing/oversized text, invalid
  JSON, runtime-schema, citation, grounding, and usage failures using fixed
  non-sensitive diagnostic categories; and
- keeps the public API response generic and does not log raw output.

Citation and grounding enforcement were not weakened. Unknown Memory IDs,
supported answers with no citation, and metadata-only claims about unseen page,
video, or transcript content still fail closed.

## Fixture proof

Synthetic tests cover a normal single block, omitted message status, reasoning
items, multiple output-text blocks, refusal, missing output, top-level token
truncation/incomplete status, invalid JSON, wrong application schema, unknown or
missing evidence, empty citations, metadata-only unsupported claims, and a valid
grounded answer. They use injected transport only.

## Next live proof

A future owner authorization must set a fresh total request and cost ceiling.
The synthetic verifier should then prove, without printing raw content:

1. HTTP status and returned model;
2. completed versus incomplete/refusal classification;
3. structured JSON parse and runtime contract validation;
4. exact citation membership and metadata-only grounding;
5. input/output/reasoning token usage when supplied; and
6. bounded latency and estimated cost.

Stage 12D subsequently performed one separately authorized synthetic request.
It returned HTTP 200 and passed structured-output, grounding, and exact citation
validation with no retry. This verifies the corrected synthetic adapter path;
it does not verify inference over personal data or authenticated persistence.

## Local secret-artifact note

The final Next build loaded ignored `.env.local`. An exact-value scan found the
Meta key in one ignored Turbopack cache file, but in no client-static or
deployable output. No value was printed or committed. This establishes local
cache retention, not external exposure. Purge compiler caches before sharing
workspaces or CI artifacts, and rotate the key if the cache may have left the
controlled machine.
