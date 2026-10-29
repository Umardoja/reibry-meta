// Test-only deterministic adapter. Production code has no import path to this module.
import { serializeMemory, type Memory, type MemoryList, type MemoryUpdate, type NewMemory, type NewTextMemory } from "../../src/lib/memory/contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../../src/lib/memory/repository.ts";
export type MemoryTestState = Map<string, Memory>;
const dedupeStates = new WeakMap<MemoryTestState, Map<string, string>>();
export function createMemoryTestState(seed: Memory[] = []): MemoryTestState {
  return new Map(seed.map(item => [item.id, serializeMemory(item)]));
}
export function createInMemoryMemoryRepository(ownerId: string, state: MemoryTestState,
  options: { now?: () => string; id?: () => string } = {}): MemoryRepository {
  const now = options.now ?? (() => "2026-10-27T12:00:00.000Z");
  let sequence = 1;
  const id = options.id ?? (() => {
    let candidate = `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
    while (state.has(candidate)) candidate = `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
    return candidate;
  });
  const dedupe = dedupeStates.get(state) ?? new Map<string, string>(); dedupeStates.set(state, dedupe);
  const createRecord = (input: NewMemory) => {
    const timestamp = now();
    const memory: Memory = { id: id(), userId: ownerId, ...input, createdAt: timestamp, updatedAt: timestamp };
    state.set(memory.id, memory); return serializeMemory(memory);
  };
  const owned = (memoryId: string) => {
    const item = state.get(memoryId);
    if (!item || item.userId !== ownerId) throw new MemoryRepositoryFailure("NOT_FOUND");
    return item;
  };
  return {
    ownerId,
    async create(input: NewTextMemory) {
      return createRecord({ ...input, sourceType: "text", sourceUrl: null, analysisStatus: "processing", metadata: {} });
    },
    async createUnique(input, dedupeKey) {
      const ownerKey = `${ownerId}:${dedupeKey}`; const existingId = dedupe.get(ownerKey);
      if (existingId) return { memory: serializeMemory(state.get(existingId)!), duplicate: true };
      const memory = createRecord(input); dedupe.set(ownerKey, memory.id); return { memory, duplicate: false };
    },
    async searchCandidates(limit) {
      return [...state.values()].filter(item => item.userId === ownerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, limit).map(serializeMemory);
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
