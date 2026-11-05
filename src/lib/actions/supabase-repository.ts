import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeActionCard, decodeActionProposal } from "./contracts.ts";
import { ActionRepositoryFailure, type ActionRepository, type ActionRepositoryFailureCode } from "./repository.ts";

const proposalColumns = "id,user_id,title,description,status,expires_at,confirmed_at,model_provenance,created_at,updated_at";
const cardColumns = "id,proposal_id,user_id,title,description,status,model_provenance,confirmed_at,created_at,updated_at";
function failure(error: { code?: string } | null | undefined): never {
  const mapped: Record<string, ActionRepositoryFailureCode> = { P0002: "NOT_FOUND", P0003: "EXPIRED", P0004: "INVALID_STATE" };
  throw new ActionRepositoryFailure(error?.code && mapped[error.code] ? mapped[error.code] : "STORAGE_UNAVAILABLE");
}
function rows(value: unknown) { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }

export type TrustedProposalOptions = { client: () => SupabaseClient; requestId?: () => string };

export function createSupabaseActionRepository(client: SupabaseClient, ownerId: string, trusted?: TrustedProposalOptions): ActionRepository {
  async function memoryMap(proposalIds: string[]) {
    if (!proposalIds.length) return new Map<string, string[]>();
    const { data, error } = await client.from("action_proposal_memories").select("proposal_id,memory_id")
      .eq("user_id", ownerId).in("proposal_id", proposalIds).order("memory_id", { ascending: true });
    if (error) return failure(error); const map = new Map<string, string[]>();
    for (const item of rows(data)) {
      const proposalId = String(item.proposal_id); const current = map.get(proposalId) ?? []; current.push(String(item.memory_id)); map.set(proposalId, current);
    }
    return map;
  }
  async function proposals(data: unknown) {
    const values = rows(data); const links = await memoryMap(values.map(value => String(value.id)));
    try { return values.map(value => decodeActionProposal(value, links.get(String(value.id)) ?? [])); } catch { return failure(null); }
  }
  async function cards(data: unknown) {
    const values = rows(data); const links = await memoryMap(values.map(value => String(value.proposal_id)));
    try { return values.map(value => decodeActionCard(value, links.get(String(value.proposal_id)) ?? [])); } catch { return failure(null); }
  }
  return {
    ownerId,
    async createProposals(inputs, modelProvenance) {
      if (!inputs.length) return [];
      if (!trusted) return failure(null);
      const payload = inputs.map(item => ({ title: item.title, description: item.description, supporting_memory_ids: item.supportingMemoryIds }));
      const { data, error } = await trusted.client().rpc("create_trusted_action_proposals", {
        p_user_id: ownerId, p_items: payload, p_model_provenance: modelProvenance,
        p_request_id: (trusted.requestId ?? (() => globalThis.crypto.randomUUID()))(),
      });
      if (error || !data) return failure(error); return proposals(data);
    },
    async listProposals() {
      const { data, error } = await client.from("action_proposals").select(proposalColumns).eq("user_id", ownerId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
      if (error) return failure(error); return proposals(data ?? []);
    },
    async confirm(proposalId) {
      const { data, error } = await client.rpc("confirm_action_proposal", { p_proposal_id: proposalId }).single();
      if (error || !data) return failure(error); const [card] = await cards([data]); if (!card) return failure(null); return card;
    },
    async reject(proposalId) {
      const { data, error } = await client.rpc("reject_action_proposal", { p_proposal_id: proposalId }).single();
      if (error || !data) return failure(error); const [proposal] = await proposals([data]); if (!proposal) return failure(null); return proposal;
    },
    async listCards() {
      const { data, error } = await client.from("action_cards").select(cardColumns).eq("user_id", ownerId)
        .order("confirmed_at", { ascending: false }).order("id", { ascending: false }).limit(100);
      if (error) return failure(error); return cards(data ?? []);
    },
    async readCard(cardId) {
      const { data, error } = await client.from("action_cards").select(cardColumns).eq("user_id", ownerId).eq("id", cardId).maybeSingle();
      if (error) return failure(error); if (!data) return failure({ code: "P0002" });
      const [card] = await cards([data]); if (!card) return failure(null); return card;
    },
  };
}
