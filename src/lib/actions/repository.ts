import type { ActionCard, ActionProposal, ActionProposalInput } from "./contracts.ts";
export type ActionRepositoryFailureCode = "NOT_FOUND" | "EXPIRED" | "INVALID_STATE" | "STORAGE_UNAVAILABLE";
export class ActionRepositoryFailure extends Error {
  code: ActionRepositoryFailureCode;
  constructor(code: ActionRepositoryFailureCode) { super(code); this.code = code; }
}
/** Owner-bound persistence. Proposal creation and confirmation are database-controlled transitions. */
export interface ActionRepository {
  readonly ownerId: string;
  createProposals(inputs: ActionProposalInput[], modelProvenance: string): Promise<ActionProposal[]>;
  listProposals(): Promise<ActionProposal[]>;
  confirm(proposalId: string): Promise<ActionCard>;
  reject(proposalId: string): Promise<ActionProposal>;
  listCards(): Promise<ActionCard[]>;
  readCard(cardId: string): Promise<ActionCard>;
}
