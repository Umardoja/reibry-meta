// Explicitly opt-in, synthetic-only Meta Model API verification. Never imports hosted application persistence.
import { defaultMetaDependencies } from "../src/lib/ai/meta/client.ts";
import { META_MODEL } from "../src/lib/ai/meta/contracts.ts";
import { createMetaReasoner } from "../src/lib/ai/meta/grounded-reasoning.ts";
import type { RetrievalItem } from "../src/lib/retrieval/contracts.ts";

const authorization = "I_AUTHORIZE_BILLABLE_META_TEST";
if (process.env.META_LIVE_VERIFY !== authorization) {
  console.error(`Live verification is disabled. After explicit owner approval, set META_LIVE_VERIFY=${authorization} and MODEL_API_KEY, then rerun npm run verify:meta.`);
  console.error("Synthetic request ceiling: at most 2 requests including one transient retry, under 2 KB input and 384 maximum output tokens per request; estimated worst-case Standard cost is below $0.01.");
  process.exitCode = 2;
} else if (!process.env.MODEL_API_KEY) {
  console.error("MODEL_API_KEY is missing. Set it only in the server process environment; never commit it or pass it in a URL.");
  process.exitCode = 2;
} else {
  const synthetic: RetrievalItem = {
    memoryId: "00000000-0000-4000-8000-000000000008", memoryHref: "/memories#memory-00000000-0000-4000-8000-000000000008",
    displayTitle: "Synthetic launch checklist", sourceType: "text", storedExcerpt: "Synthetic evidence: review accessibility before the demo.",
    matchedSourceMetadata: [], sourceUrl: null, processingStatus: "complete", match: { reason: "Synthetic note text matches.", score: 100, fields: ["note"] },
  };
  let requests = 0;
  const countedFetch: typeof fetch = async (input, init) => { requests++; if (requests > 2) throw new Error("Live verification request ceiling exceeded."); return fetch(input, init); };
  const reasoner = createMetaReasoner({ ...defaultMetaDependencies, env: { MODEL_API_KEY: process.env.MODEL_API_KEY, META_RATE_LIMIT_MODE: "in-memory" }, fetch: countedFetch }, 384);
  const started = performance.now();
  try {
    const result = await reasoner("What does the synthetic launch checklist require?", [synthetic], new AbortController().signal);
    const usage = result.usage!; const estimatedCost = usage.inputTokens / 1_000_000 * 1.25 + usage.outputTokens / 1_000_000 * 4.25;
    console.log(`status=PASS model=${META_MODEL} latency_ms=${Math.round(performance.now() - started)} requests=${requests} input_tokens=${usage.inputTokens} output_tokens=${usage.outputTokens} total_tokens=${usage.totalTokens} estimated_usd=${estimatedCost.toFixed(6)} validation=PASS`);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "META_UNAVAILABLE";
    console.error(`status=FAIL model=${META_MODEL} requests=${requests} category=${code} validation=FAIL`);
    process.exitCode = 1;
  }
}
