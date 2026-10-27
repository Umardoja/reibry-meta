import type { Memory, MemoryList, MemoryPage, MemoryUpdate, NewTextMemory } from "./contracts.ts";
export type MemoryRepositoryFailureCode = "NOT_FOUND" | "STORAGE_UNAVAILABLE";
export class MemoryRepositoryFailure extends Error {
  code: MemoryRepositoryFailureCode;
  constructor(code: MemoryRepositoryFailureCode) { super(code === "NOT_FOUND" ? "Memory not found." : "Memory storage is unavailable."); this.code = code; }
}
/** A repository is permanently bound to one verified user. Callers cannot select ownership. */
export interface MemoryRepository {
  readonly ownerId: string;
  create(input: NewTextMemory): Promise<Memory>;
  list(input: MemoryList): Promise<MemoryPage>;
  read(id: string): Promise<Memory>;
  update(id: string, input: MemoryUpdate): Promise<Memory>;
  delete(id: string): Promise<void>;
}
