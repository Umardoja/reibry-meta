// Adapted from original REIBRY types/reibry.ts and api/contracts.ts.
// Source 76d3494465bab43a5051498e90b9a486a65312b9; original contributors retain attribution.
export type MemorySourceType = "text" | "link";
export type MemoryStatus = "processing" | "complete" | "partial" | "failed";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Memory {
  id: string;
  userId: string;
  title: string;
  sourceType: MemorySourceType;
  sourceUrl: string | null;
  rawText: string | null;
  analysisStatus: MemoryStatus;
  metadata: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
}
export type NewTextMemory = { title: string; rawText: string };
export type NewMemory = Pick<Memory, "title" | "sourceType" | "sourceUrl" | "rawText" | "analysisStatus" | "metadata">;
export type MemoryUpdate = { title?: string; rawText?: string };
export type MemoryPage = { items: Memory[]; nextOffset: number | null };
export type MemoryList = { limit: number; offset: number };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedCreate = new Set(["title", "rawText", "sourceType"]);
const allowedUpdate = new Set(["title", "rawText"]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemoryContractError("Provide a JSON object.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: Set<string>) {
  if (Object.keys(value).some(key => !allowed.has(key))) throw new MemoryContractError("Unsupported Memory field.");
}
function boundedText(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new MemoryContractError(`${name} must contain 1-${max} characters.`);
  return value;
}
export class MemoryContractError extends Error {}
export function memoryId(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new MemoryContractError("Use a valid Memory identifier.");
  return value.toLowerCase();
}
export function parseCreateMemory(value: unknown): NewTextMemory {
  const input = object(value); exactKeys(input, allowedCreate);
  if (input.sourceType !== undefined && input.sourceType !== "text") throw new MemoryContractError("Stage 5 accepts text Memories only.");
  const rawText = boundedText(input.rawText, "Memory text", 50_000);
  const firstLine = rawText.trim().split(/\r?\n/, 1)[0];
  const title = input.title === undefined ? firstLine.slice(0, 200) : boundedText(input.title, "Title", 200).trim();
  return { title, rawText };
}
export function parseUpdateMemory(value: unknown): MemoryUpdate {
  const input = object(value); exactKeys(input, allowedUpdate);
  const update: MemoryUpdate = {};
  if (input.title !== undefined) update.title = boundedText(input.title, "Title", 200).trim();
  if (input.rawText !== undefined) update.rawText = boundedText(input.rawText, "Memory text", 50_000);
  if (!Object.keys(update).length) throw new MemoryContractError("Provide a title or Memory text update.");
  return update;
}
export function parseMemoryList(url: URL): MemoryList {
  const allowed = new Set(["limit", "offset"]);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key))) throw new MemoryContractError("Unsupported list filter.");
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const raw = url.searchParams.get(name); if (raw === null) return fallback;
    if (!/^\d+$/.test(raw)) throw new MemoryContractError(`Invalid ${name}.`);
    const value = Number(raw); if (!Number.isSafeInteger(value) || value < min || value > max) throw new MemoryContractError(`Invalid ${name}.`);
    return value;
  };
  return { limit: integer("limit", 20, 1, 50), offset: integer("offset", 0, 0, 5_000) };
}
function jsonObject(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemoryContractError("Invalid Memory metadata.");
  try { return JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>; } catch { throw new MemoryContractError("Invalid Memory metadata."); }
}
export function decodeMemory(value: unknown): Memory {
  const row = object(value);
  const sourceType = row.source_type;
  const status = row.analysis_status;
  if (sourceType !== "text" && sourceType !== "link") throw new MemoryContractError("Invalid Memory source type.");
  if (!["processing", "complete", "partial", "failed"].includes(String(status))) throw new MemoryContractError("Invalid Memory status.");
  const iso = (input: unknown) => {
    if (typeof input !== "string" || !Number.isFinite(Date.parse(input))) throw new MemoryContractError("Invalid Memory timestamp.");
    return input;
  };
  const sourceUrl = row.source_url === null ? null : boundedText(row.source_url, "Source URL", 2_048);
  if (sourceUrl && !["http:", "https:"].includes(new URL(sourceUrl).protocol)) throw new MemoryContractError("Invalid Memory source URL.");
  const rawText = row.raw_text === null ? null : boundedText(row.raw_text, "Memory text", 50_000);
  if ((sourceType === "text" && rawText === null) || (sourceType === "link" && sourceUrl === null)) throw new MemoryContractError("Invalid Memory source.");
  return {
    id: memoryId(row.id), userId: memoryId(row.user_id), title: boundedText(row.title, "Title", 200),
    sourceType, sourceUrl, rawText, analysisStatus: status as MemoryStatus,
    metadata: jsonObject(row.metadata), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}
export function serializeMemory(memory: Memory): Memory {
  return { id: memory.id, userId: memory.userId, title: memory.title, sourceType: memory.sourceType,
    sourceUrl: memory.sourceUrl, rawText: memory.rawText, analysisStatus: memory.analysisStatus,
    metadata: JSON.parse(JSON.stringify(memory.metadata)) as Record<string, JsonValue>,
    createdAt: memory.createdAt, updatedAt: memory.updatedAt };
}
