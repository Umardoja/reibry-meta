// Deterministic Action repository for tests only. Production has no import path to this module.
import { ACTION_PROPOSAL_TTL_MS, type ActionCard, type ActionProposal, type ActionProposalInput } from "../../src/lib/actions/contracts.ts";
import { ActionRepositoryFailure, type ActionRepository } from "../../src/lib/actions/repository.ts";
export type ActionTestState = { proposals: Map<string, ActionProposal>; cards: Map<string, ActionCard>; memoryOwners: Map<string, string> };
export function createActionTestState(memoryOwners: Array<[string, string]> = []): ActionTestState {
  return { proposals: new Map(), cards: new Map(), memoryOwners: new Map(memoryOwners) };
}
const copyProposal = (value: ActionProposal): ActionProposal => structuredClone(value);
const copyCard = (value: ActionCard): ActionCard => structuredClone(value);
export function createInMemoryActionRepository(ownerId: string, state: ActionTestState, options: {
  now?: () => string; failConfirmation?: () => boolean;
} = {}): ActionRepository {
  const now = options.now ?? (() => "2026-10-29T12:00:00.000Z"); let proposalSequence = state.proposals.size + 1; let cardSequence = state.cards.size + 1;
  const proposalId = () => `10000000-0000-4000-8000-${String(proposalSequence++).padStart(12, "0")}`;
  const cardId = () => `20000000-0000-4000-8000-${String(cardSequence++).padStart(12, "0")}`;
  const ownedProposal = (id: string) => { const item = state.proposals.get(id); if (!item || item.userId !== ownerId) throw new ActionRepositoryFailure("NOT_FOUND"); return item; };
  const supportingOwned = (ids: string[]) => ids.every(id => state.memoryOwners.get(id) === ownerId);
  return {
    ownerId,
    async createProposals(inputs: ActionProposalInput[], modelProvenance: string) {
      if (modelProvenance !== "meta:muse-spark-1.3" || inputs.some(item => !supportingOwned(item.supportingMemoryIds))) throw new ActionRepositoryFailure("INVALID_STATE");
      return inputs.map(input => { const timestamp = now(); const proposal: ActionProposal = { id: proposalId(), userId: ownerId, ...structuredClone(input),
        status: "proposed", expiresAt: new Date(Date.parse(timestamp) + ACTION_PROPOSAL_TTL_MS).toISOString(), confirmedAt: null,
        modelProvenance, createdAt: timestamp, updatedAt: timestamp }; state.proposals.set(proposal.id, proposal); return copyProposal(proposal); });
    },
    async listProposals() { return [...state.proposals.values()].filter(item => item.userId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(copyProposal); },
    async confirm(id) {
      const proposal = ownedProposal(id); const existing = [...state.cards.values()].find(item => item.proposalId === id && item.userId === ownerId);
      if (proposal.status === "confirmed") { if (!existing) throw new ActionRepositoryFailure("INVALID_STATE"); return copyCard(existing); }
      if (proposal.status === "rejected") throw new ActionRepositoryFailure("INVALID_STATE");
      if (proposal.status === "expired" || Date.parse(proposal.expiresAt) <= Date.parse(now())) throw new ActionRepositoryFailure("EXPIRED");
      if (!supportingOwned(proposal.supportingMemoryIds)) throw new ActionRepositoryFailure("INVALID_STATE");
      const timestamp = now(); const card: ActionCard = { id: cardId(), proposalId: id, userId: ownerId, title: proposal.title,
        description: proposal.description, supportingMemoryIds: [...proposal.supportingMemoryIds], status: "confirmed",
        modelProvenance: proposal.modelProvenance, confirmedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
      if (options.failConfirmation?.()) throw new ActionRepositoryFailure("STORAGE_UNAVAILABLE");
      state.cards.set(card.id, card); state.proposals.set(id, { ...proposal, status: "confirmed", confirmedAt: timestamp, updatedAt: timestamp });
      return copyCard(card);
    },
    async reject(id) {
      const proposal = ownedProposal(id); if (proposal.status === "confirmed") throw new ActionRepositoryFailure("INVALID_STATE");
      if (proposal.status === "expired" || Date.parse(proposal.expiresAt) <= Date.parse(now())) throw new ActionRepositoryFailure("EXPIRED");
      if (proposal.status === "rejected") return copyProposal(proposal);
      const next: ActionProposal = { ...proposal, status: "rejected", updatedAt: now() }; state.proposals.set(id, next); return copyProposal(next);
    },
    async listCards() { return [...state.cards.values()].filter(item => item.userId === ownerId)
      .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt) || b.id.localeCompare(a.id)).map(copyCard); },
    async readCard(id) { const item = state.cards.get(id); if (!item || item.userId !== ownerId) throw new ActionRepositoryFailure("NOT_FOUND"); return copyCard(item); },
  };
}
