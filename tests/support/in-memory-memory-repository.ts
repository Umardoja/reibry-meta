// Test-only deterministic adapter. Production code has no import path to this module.
import { serializeMemory, type Memory, type MemoryList, type MemoryUpdate, type NewTextMemory } from "../../src/lib/memory/contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../../src/lib/memory/repository.ts";
export type MemoryTestState = Map<string, Memory>;
export function createMemoryTestState(seed: Memory[] = []): MemoryTestState {
  return new Map(seed.map(item => [item.id, serializeMemory(item)]));
}
export function createInMemoryMemoryRepository(ownerId: string, state: MemoryTestState,
  options: { now?: () => string; id?: () => string } = {}): MemoryRepository {
  const now = options.now ?? (() => "2026-10-27T12:00:00.000Z");
  let sequence = 1;
  const id = options.id ?? (() => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`);
  const owned = (memoryId: string) => {
    const item = state.get(memoryId);
    if (!item || item.userId !== ownerId) throw new MemoryRepositoryFailure("NOT_FOUND");
    return item;
  };
  return {
    ownerId,
    async create(input: NewTextMemory) {
      const timestamp = now();
      const memory: Memory = { id: id(), userId: ownerId, title: input.title, sourceType: "text", sourceUrl: null,
        rawText: input.rawText, analysisStatus: "processing", metadata: {}, createdAt: timestamp, updatedAt: timestamp };
      state.set(memory.id, memory); return serializeMemory(memory);
    },
    async list(input: MemoryList) {
      const items = [...state.values()].filter(item => item.userId === ownerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const page = items.slice(input.offset, input.offset + input.limit);
      return { items: page.map(serializeMemory), nextOffset: input.offset + input.limit < items.length ? input.offset + input.limit : null };
    },
    async read(memoryId) { return serializeMemory(owned(memoryId)); },
    async update(memoryId, input: MemoryUpdate) {
      const current = owned(memoryId); const next = { ...current, ...input, updatedAt: now() };
      state.set(memoryId, next); return serializeMemory(next);
    },
    async delete(memoryId) { owned(memoryId); state.delete(memoryId); },
  };
}
