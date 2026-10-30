import type { ActionProposalView } from "../actions/contracts.ts";
import type { AskResponse } from "../ai/meta/contracts.ts";
import type { LifeContext, NewLifeContext } from "../life/contracts.ts";
import type { RetrievalItem } from "../retrieval/contracts.ts";

export const HOME_MESSAGE_MAX = 500;
export const HOME_TIMEZONE_MAX = 100;
export const HOME_RESULT_MAX = 6;
// Ephemeral chat context replayed to Muse: bounded, never persisted, never proof of ownership.
export const HOME_HISTORY_TURNS_MAX = 8;
export const HOME_HISTORY_TEXT_MAX = 600;
export const HOME_HISTORY_CHARS_MAX = 4_000;
export const HOME_REFERENCES_MAX = 6;

export type HomeIntent = "MEMORY_SEARCH" | "GROUNDED_ANSWER" | "LIFE_UPCOMING" | "LIFE_UNDATED" |
  "LIFE_DRAFT" | "ACTION_REVIEW" | "CLARIFICATION" | "UNSUPPORTED" | "CONVERSATION";

export type HomeHistoryTurn = { role: "user" | "assistant"; text: string };
export type HomeRequest = { message: string; timezone: string; mode: "message" | "confirm-life"; history: HomeHistoryTurn[]; references: string[] };
export type HomeLifeDraft = NewLifeContext & { sourceText: string; requiresConfirmation: true };
export type HomeLifeItem = Pick<LifeContext, "id" | "type" | "title" | "description" | "startDate" | "endDate" | "status"> & {
  href: string;
};
export type HomeResponse = {
  intent: HomeIntent;
  message: string;
  memories: RetrievalItem[];
  groundedAnswer: AskResponse | null;
  lifeContexts: HomeLifeItem[];
  lifeDraft: HomeLifeDraft | null;
  savedLife: HomeLifeItem | null;
  actionProposals: ActionProposalView[];
  /** Sanitized provider failure category when Home fell back instead of a Muse reply (never provider bodies or secrets). */
  fallbackReason: string | null;
};

export function homeLifeItem(context: LifeContext): HomeLifeItem {
  return {
    id: context.id,
    type: context.type,
    title: context.title,
    description: context.description,
    startDate: context.startDate,
    endDate: context.endDate,
    status: context.status,
    href: `/life/manage#life-${encodeURIComponent(context.id)}`,
  };
}

export class HomeContractError extends Error {}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HomeContractError("Provide a JSON object.");
  return value as Record<string, unknown>;
}

export function parseHomeBody(value: unknown): HomeRequest {
  const input = record(value);
  if (Object.keys(input).some(key => !["message", "timezone", "mode", "history", "references"].includes(key))) throw new HomeContractError("Unsupported Home field.");
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > HOME_MESSAGE_MAX)
    throw new HomeContractError(`Message must contain 1-${HOME_MESSAGE_MAX} characters.`);
  const timezone = input.timezone === undefined ? "UTC" : input.timezone;
  if (typeof timezone !== "string" || !timezone.trim() || timezone.length > HOME_TIMEZONE_MAX) throw new HomeContractError("Use a valid timezone.");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new HomeContractError("Use an IANA timezone."); }
  const mode = input.mode === undefined ? "message" : input.mode;
  if (mode !== "message" && mode !== "confirm-life") throw new HomeContractError("Unsupported Home operation.");
  return { message: input.message.trim(), timezone: timezone.trim(), mode, history: parseHistory(input.history), references: parseReferences(input.references) };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseHistory(value: unknown): HomeHistoryTurn[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > HOME_HISTORY_TURNS_MAX) throw new HomeContractError("Conversation history is too long.");
  const turns = value.map(item => {
    const turn = record(item);
    if (Object.keys(turn).some(key => key !== "role" && key !== "text") || (turn.role !== "user" && turn.role !== "assistant") ||
        typeof turn.text !== "string" || !turn.text.trim() || turn.text.length > HOME_HISTORY_TEXT_MAX) throw new HomeContractError("Invalid conversation history.");
    return { role: turn.role, text: turn.text.trim() } as HomeHistoryTurn;
  });
  if (turns.reduce((total, turn) => total + turn.text.length, 0) > HOME_HISTORY_CHARS_MAX) throw new HomeContractError("Conversation history is too long.");
  return turns;
}
function parseReferences(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > HOME_REFERENCES_MAX || value.some(id => typeof id !== "string" || !uuid.test(id))) throw new HomeContractError("Invalid references.");
  return [...new Set(value.map(id => (id as string).toLowerCase()))];
}

export function emptyHomeResponse(intent: HomeIntent, message: string): HomeResponse {
  return { intent, message, memories: [], groundedAnswer: null, lifeContexts: [], lifeDraft: null, savedLife: null, actionProposals: [], fallbackReason: null };
}
