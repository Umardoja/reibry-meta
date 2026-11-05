// Ported from REIBRY Original types/reibry.ts and integration/schemas.ts at 76d3494.
export const lifeTypes = ["event", "goal", "deadline", "trip", "task", "project", "interest", "reminder"] as const;
export const lifeStatuses = ["active", "completed", "cancelled", "archived"] as const;
export type LifeContextType = (typeof lifeTypes)[number];
export type LifeContextStatus = (typeof lifeStatuses)[number];
export interface LifeContext { id: string; userId: string; type: LifeContextType; title: string; description: string | null; startDate: string | null; endDate: string | null; status: LifeContextStatus; confidence: number | null; createdAt: string; updatedAt: string }
export type NewLifeContext = Omit<LifeContext, "id" | "userId" | "createdAt" | "updatedAt">;
export type LifeUpdate = Partial<Pick<LifeContext, "type" | "title" | "description" | "startDate" | "endDate" | "status">>;
export class LifeContractError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown) => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new LifeContractError("Provide a JSON object."); return value as Record<string, unknown>; };
function exact(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new LifeContractError("Unsupported Life field."); }
function text(value: unknown, name: string, max: number) { if (typeof value !== "string" || !value.trim() || value.length > max) throw new LifeContractError(`${name} must contain 1-${max} characters.`); return value.trim(); }
function optionalText(value: unknown, max: number) { if (value === null) return null; if (typeof value !== "string" || value.length > max) throw new LifeContractError("Invalid description."); return value.trim() || null; }
function date(value: unknown) { if (value === null) return null; if (typeof value !== "string" || value.length > 40 || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new LifeContractError("Use an ISO date with timezone."); return new Date(value).toISOString(); }
export function assertLifeRange(start: string | null | undefined, end: string | null | undefined) { if (start && end && Date.parse(end) < Date.parse(start)) throw new LifeContractError("End time must be after the start time."); }
export function lifeId(value: unknown) { if (typeof value !== "string" || !uuid.test(value)) throw new LifeContractError("Use a valid Life identifier."); return value.toLowerCase(); }
export function parseLifeCreate(value: unknown) { const input = object(value); exact(input, ["text", "timezone"]); const raw = text(input.text, "Life context", 20_000); const timezone = input.timezone === undefined ? "UTC" : text(input.timezone, "Timezone", 100); try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new LifeContractError("Use an IANA timezone."); } return { text: raw, timezone }; }
export function parseLifeUpdate(value: unknown): LifeUpdate { const input = object(value); exact(input, ["type", "title", "description", "startDate", "endDate", "status"]); const update: LifeUpdate = {};
  if (input.type !== undefined) { if (!lifeTypes.includes(input.type as LifeContextType)) throw new LifeContractError("Invalid Life type."); update.type = input.type as LifeContextType; }
  if (input.title !== undefined) update.title = text(input.title, "Title", 300);
  if (input.description !== undefined) update.description = optionalText(input.description, 20_000);
  if (input.startDate !== undefined) update.startDate = date(input.startDate);
  if (input.endDate !== undefined) update.endDate = date(input.endDate);
  if (input.status !== undefined) { if (!lifeStatuses.includes(input.status as LifeContextStatus)) throw new LifeContractError("Invalid Life status."); update.status = input.status as LifeContextStatus; }
  if (!Object.keys(update).length) throw new LifeContractError("Provide a Life change."); assertLifeRange(update.startDate, update.endDate); return update;
}
export function decodeLifeContext(value: unknown): LifeContext { const row = object(value); const type = row.type as LifeContextType; const status = row.status as LifeContextStatus; if (!lifeTypes.includes(type) || !lifeStatuses.includes(status)) throw new LifeContractError("Invalid Life record."); const startDate = row.start_date === null ? null : date(row.start_date); const endDate = row.end_date === null ? null : date(row.end_date); assertLifeRange(startDate, endDate); const confidence = row.confidence === null ? null : Number(row.confidence); if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new LifeContractError("Invalid confidence."); return { id: lifeId(row.id), userId: lifeId(row.user_id), type, title: text(row.title, "Title", 300), description: row.description === null ? null : optionalText(row.description, 20_000), startDate, endDate, status, confidence, createdAt: date(row.created_at)!, updatedAt: date(row.updated_at)! }; }
export function serializeLifeContext(value: LifeContext): LifeContext { return { ...value }; }
