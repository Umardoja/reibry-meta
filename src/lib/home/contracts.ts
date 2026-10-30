import type { ActionProposalView } from "../actions/contracts.ts";
import type { AskResponse } from "../ai/meta/contracts.ts";
import type { LifeContext, NewLifeContext } from "../life/contracts.ts";
import type { RetrievalItem } from "../retrieval/contracts.ts";

export const HOME_MESSAGE_MAX = 500;
export const HOME_TIMEZONE_MAX = 100;
export const HOME_RESULT_MAX = 6;

export type HomeIntent = "MEMORY_SEARCH" | "GROUNDED_ANSWER" | "LIFE_UPCOMING" | "LIFE_UNDATED" |
  "LIFE_DRAFT" | "ACTION_REVIEW" | "CLARIFICATION" | "UNSUPPORTED";

export type HomeRequest = { message: string; timezone: string; mode: "message" | "confirm-life" };
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
  if (Object.keys(input).some(key => !["message", "timezone", "mode"].includes(key))) throw new HomeContractError("Unsupported Home field.");
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > HOME_MESSAGE_MAX)
    throw new HomeContractError(`Message must contain 1-${HOME_MESSAGE_MAX} characters.`);
  const timezone = input.timezone === undefined ? "UTC" : input.timezone;
  if (typeof timezone !== "string" || !timezone.trim() || timezone.length > HOME_TIMEZONE_MAX) throw new HomeContractError("Use a valid timezone.");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new HomeContractError("Use an IANA timezone."); }
  const mode = input.mode === undefined ? "message" : input.mode;
  if (mode !== "message" && mode !== "confirm-life") throw new HomeContractError("Unsupported Home operation.");
  return { message: input.message.trim(), timezone: timezone.trim(), mode };
}

export function emptyHomeResponse(intent: HomeIntent, message: string): HomeResponse {
  return { intent, message, memories: [], groundedAnswer: null, lifeContexts: [], lifeDraft: null, savedLife: null, actionProposals: [] };
}
