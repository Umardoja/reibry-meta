import { memoryId } from "../memory/contracts.ts";

export const ACTION_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1_000;
export const ACTION_TITLE_MAX = 100;
export const ACTION_DESCRIPTION_MAX = 400;
export const ACTION_MEMORY_MAX = 6;
export type ActionProposalStatus = "proposed" | "confirmed" | "rejected" | "expired";
export type ActionProposalInput = { title: string; description: string; supportingMemoryIds: string[] };
export interface ActionProposal {
  id: string; userId: string; title: string; description: string; supportingMemoryIds: string[];
  status: ActionProposalStatus; expiresAt: string; confirmedAt: string | null; modelProvenance: string;
  createdAt: string; updatedAt: string;
}
export interface ActionCard {
  id: string; proposalId: string; userId: string; title: string; description: string; supportingMemoryIds: string[];
  status: "confirmed"; modelProvenance: string; confirmedAt: string; createdAt: string; updatedAt: string;
}
export type ActionProposalView = Omit<ActionProposal, "userId">;
export type ActionCardView = Omit<ActionCard, "userId"> & { memoryHrefs: string[] };
export class ActionContractError extends Error {}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActionContractError("Invalid Action record.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ActionContractError("Invalid Action text.");
  return value.trim().replace(/\r\n?/g, "\n");
}
function iso(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new ActionContractError("Invalid Action timestamp.");
  return value;
}
function ids(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ACTION_MEMORY_MAX) throw new ActionContractError("Action needs supporting Memories.");
  const result = value.map(memoryId); if (new Set(result).size !== result.length) throw new ActionContractError("Duplicate supporting Memory.");
  return result;
}
export function actionId(value: unknown) { try { return memoryId(value); } catch { throw new ActionContractError("Use a valid Action identifier."); } }

export function proposalInputs(steps: Array<{ title: string; description: string; supporting_memory_ids: string[] }>, allowedIds: Set<string>) {
  const result: ActionProposalInput[] = [];
  for (const step of steps.slice(0, 3)) {
    try {
      const supportingMemoryIds = ids(step.supporting_memory_ids);
      if (supportingMemoryIds.some(id => !allowedIds.has(id))) continue;
      result.push({ title: text(step.title, ACTION_TITLE_MAX), description: text(step.description, ACTION_DESCRIPTION_MAX), supportingMemoryIds });
    } catch { /* Invalid or unsupported suggestions never become persisted proposals. */ }
  }
  return result;
}

export function decodeActionProposal(value: unknown, supportingMemoryIds: unknown, now = Date.now()): ActionProposal {
  const row = record(value); const storedStatus = String(row.status);
  if (!["proposed", "confirmed", "rejected", "expired"].includes(storedStatus)) throw new ActionContractError("Invalid proposal status.");
  const expiresAt = iso(row.expires_at); const confirmedAt = row.confirmed_at === null ? null : iso(row.confirmed_at);
  const status = storedStatus === "proposed" && Date.parse(expiresAt) <= now ? "expired" : storedStatus as ActionProposalStatus;
  if ((status === "confirmed") !== (confirmedAt !== null)) throw new ActionContractError("Invalid confirmation state.");
  return { id: actionId(row.id), userId: memoryId(row.user_id), title: text(row.title, ACTION_TITLE_MAX),
    description: text(row.description, ACTION_DESCRIPTION_MAX), supportingMemoryIds: ids(supportingMemoryIds), status,
    expiresAt, confirmedAt, modelProvenance: text(row.model_provenance, 100), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

export function decodeActionCard(value: unknown, supportingMemoryIds: unknown): ActionCard {
  const row = record(value); if (row.status !== "confirmed") throw new ActionContractError("Invalid Action Card status.");
  return { id: actionId(row.id), proposalId: actionId(row.proposal_id), userId: memoryId(row.user_id),
    title: text(row.title, ACTION_TITLE_MAX), description: text(row.description, ACTION_DESCRIPTION_MAX),
    supportingMemoryIds: ids(supportingMemoryIds), status: "confirmed", modelProvenance: text(row.model_provenance, 100),
    confirmedAt: iso(row.confirmed_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
export function proposalView(value: ActionProposal): ActionProposalView {
  const { userId, ...view } = structuredClone(value); void userId; return view;
}
export function cardView(value: ActionCard): ActionCardView {
  const { userId, ...view } = structuredClone(value); void userId;
  return { ...view, memoryHrefs: value.supportingMemoryIds.map(id => `/memories#memory-${id}`) };
}
