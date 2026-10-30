// Stage 8 Meta-specific contracts. Model output is untrusted until this module validates it.
import type { RetrievalItem } from "../../retrieval/contracts.ts";
import type { ActionProposalView } from "../../actions/contracts.ts";

export const ASK_QUESTION_MAX = 500;
export const META_EVIDENCE_MAX = 6;
export const META_EVIDENCE_BYTES_MAX = 12_000;
export const META_REQUEST_BYTES_MAX = 32_000;
export const META_RESPONSE_BYTES_MAX = 64_000;
export const META_OUTPUT_TOKENS_MAX = 800;
export const META_MODEL = "muse-spark-1.3";
export const META_ENDPOINT = "https://api.meta.ai/v1/responses";

export type EvidenceStatus = "supported" | "partial" | "insufficient";
export type ModelEvidence = {
  memory_id: string;
  title: string;
  source_type: "text" | "link";
  stored_note_excerpt: string | null;
  relevant_stored_metadata: string[];
  source_provenance: {
    kind: "stored-note" | "metadata-only-link";
    hostname: string | null;
    sanitized_url: string | null;
  };
  processing_status: RetrievalItem["processingStatus"];
  match_reason: string;
};
export type GroundedModelAnswer = {
  answer: string;
  evidence_status: EvidenceStatus;
  cited_memory_ids: string[];
  proposed_next_steps: Array<{
    title: string;
    description: string;
    supporting_memory_ids: string[];
  }>;
};
export type MetaUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
export type AskResponse = GroundedModelAnswer & {
  provider_called: boolean;
  model: typeof META_MODEL | null;
  usage: MetaUsage | null;
  citations: Array<{ memory_id: string; title: string; memory_href: string; evidence_limit: "stored-note" | "metadata-only-link" }>;
  action_proposals: ActionProposalView[];
};

export class MetaContractError extends Error {}

export const groundedAnswerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    evidence_status: { type: "string", enum: ["supported", "partial", "insufficient"] },
    cited_memory_ids: { type: "array", items: { type: "string" } },
    proposed_next_steps: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          supporting_memory_ids: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description", "supporting_memory_ids"],
      },
    },
  },
  required: ["answer", "evidence_status", "cited_memory_ids", "proposed_next_steps"],
} as const;

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).length === expected.length && Object.keys(value).every(key => expected.includes(key));
}
function strings(value: unknown, max: number) {
  return Array.isArray(value) && value.length <= max && value.every(item => typeof item === "string") && new Set(value).size === value.length;
}
function boundedString(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }

export function parseAskBody(value: unknown) {
  if (!value || typeof value !== "object" || !exactKeys(value as Record<string, unknown>, ["question"])) throw new MetaContractError("Use a question-only request.");
  const question = (value as Record<string, unknown>).question;
  if (typeof question !== "string" || !question.trim() || question.length > ASK_QUESTION_MAX) throw new MetaContractError(`Question must contain 1-${ASK_QUESTION_MAX} characters.`);
  return { question: question.trim() };
}

export function sanitizeSourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return `${url.origin}/`;
  } catch { return null; }
}

export function toModelEvidence(items: RetrievalItem[]): ModelEvidence[] {
  const result = items.slice(0, META_EVIDENCE_MAX).map(item => {
    const sanitized = sanitizeSourceUrl(item.sourceUrl);
    let hostname: string | null = null;
    try { hostname = sanitized ? new URL(sanitized).hostname.replace(/^www\./, "") : null; } catch { /* already sanitized */ }
    return {
      memory_id: item.memoryId,
      title: item.displayTitle.slice(0, 200),
      source_type: item.sourceType,
      stored_note_excerpt: item.sourceType === "text" ? item.storedExcerpt?.slice(0, 280) || null : null,
      relevant_stored_metadata: item.matchedSourceMetadata.slice(0, 3).map(value => value.slice(0, 200)),
      source_provenance: { kind: item.sourceType === "text" ? "stored-note" as const : "metadata-only-link" as const, hostname, sanitized_url: sanitized },
      processing_status: item.processingStatus,
      match_reason: item.match.reason.slice(0, 180),
    };
  });
  if (new TextEncoder().encode(JSON.stringify(result)).length > META_EVIDENCE_BYTES_MAX) throw new MetaContractError("Evidence payload is too large.");
  return result;
}

const unsupportedMetadataClaim = /\b(transcript says|video says|article says|webpage says|page says|i watched|i read the (?:article|page)|full (?:video|webpage|article))\b/i;
export function validateGroundedAnswer(value: unknown, evidence: ModelEvidence[]): GroundedModelAnswer {
  if (!value || typeof value !== "object") throw new MetaContractError("Model output is not an object.");
  const object = value as Record<string, unknown>;
  if (!exactKeys(object, ["answer", "evidence_status", "cited_memory_ids", "proposed_next_steps"]) ||
      !boundedString(object.answer, 2_000) || !["supported", "partial", "insufficient"].includes(String(object.evidence_status)) ||
      !strings(object.cited_memory_ids, META_EVIDENCE_MAX) || !Array.isArray(object.proposed_next_steps) || object.proposed_next_steps.length > 3)
    throw new MetaContractError("Model output does not match the grounded answer contract.");
  const available = new Map(evidence.map(item => [item.memory_id, item]));
  const cited = object.cited_memory_ids as string[];
  if (cited.some(id => !available.has(id))) throw new MetaContractError("Model cited an unknown Memory.");
  const steps = object.proposed_next_steps.map(step => {
    if (!step || typeof step !== "object") throw new MetaContractError("Invalid proposed next step.");
    const item = step as Record<string, unknown>;
    if (!exactKeys(item, ["title", "description", "supporting_memory_ids"]) || !boundedString(item.title, 100) ||
        !boundedString(item.description, 400) || !strings(item.supporting_memory_ids, META_EVIDENCE_MAX) ||
        (item.supporting_memory_ids as string[]).some(id => !available.has(id))) throw new MetaContractError("Invalid proposed next step.");
    return { title: item.title as string, description: item.description as string, supporting_memory_ids: item.supporting_memory_ids as string[] };
  });
  if (object.evidence_status !== "insufficient" && cited.length === 0) throw new MetaContractError("A supported answer must cite supplied evidence.");
  const referenced = [...cited, ...steps.flatMap(step => step.supporting_memory_ids)];
  const citedMetadataOnly = referenced.some(id => available.get(id)?.source_provenance.kind === "metadata-only-link");
  const combined = [object.answer as string, ...steps.map(step => step.description)].join(" ");
  if (citedMetadataOnly && unsupportedMetadataClaim.test(combined)) throw new MetaContractError("Model claimed unavailable source content.");
  if (citedMetadataOnly && !/metadata|saved title|limited evidence/i.test(object.answer as string)) throw new MetaContractError("Metadata-only evidence limitation was omitted.");
  return { answer: object.answer as string, evidence_status: object.evidence_status as EvidenceStatus, cited_memory_ids: cited, proposed_next_steps: steps };
}
