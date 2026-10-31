import type { Memory, MemoryList, MemoryPage, MemoryUpdate, NewMemory, NewTextMemory } from "./contracts.ts";
export type MemoryRepositoryFailureCode = "NOT_FOUND" | "STORAGE_UNAVAILABLE";
export class MemoryRepositoryFailure extends Error {
  code: MemoryRepositoryFailureCode;
  constructor(code: MemoryRepositoryFailureCode) { super(code === "NOT_FOUND" ? "Memory not found." : "Memory storage is unavailable."); this.code = code; }
}
/** A repository is permanently bound to one verified user. Callers cannot select ownership. */
export interface MemoryRepository {
  readonly ownerId: string;
  create(input: NewTextMemory): Promise<Memory>;
  createUnique(input: NewMemory, dedupeKey: string): Promise<{ memory: Memory; duplicate: boolean }>;
  /** Bounded owner-only records for server-side lexical ranking. Never exposed directly to clients. */
  searchCandidates(limit: number): Promise<Memory[]>;
  list(input: MemoryList): Promise<MemoryPage>;
  read(id: string): Promise<Memory>;
  update(id: string, input: MemoryUpdate): Promise<Memory>;
  delete(id: string): Promise<void>;
  /** The owner's oldest link Memory recorded for this platform post ID (other than excludeId), or null. Owner-scoped like every read. */
  findLinkByPostId?(platform: "tiktok", postId: string, excludeId?: string): Promise<Memory | null>;
}
