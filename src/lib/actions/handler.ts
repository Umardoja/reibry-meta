import { AuthFailure, bounded, errorCode as authErrorCode } from "../auth/policy.ts";
import { ActionContractError, actionId, cardView, proposalView } from "./contracts.ts";
import { ActionRepositoryFailure, type ActionRepository } from "./repository.ts";

export type ActionOperation = "list-proposals" | "confirm" | "reject" | "list-cards" | "read-card";
export type ActionContext = { userId: string; repository: ActionRepository };
export type ActionContextFactory = (signal: AbortSignal) => Promise<ActionContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "NOT_FOUND" | "EXPIRED" | "INVALID_STATE" | "STORAGE_UNAVAILABLE";
export type ActionResult = { status: number; data: unknown; error: { code: FailureCode; message: string } | null };
export const actionPrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer", Pragma: "no-cache" };
const messages: Record<FailureCode, string> = { VALIDATION_ERROR: "The Action request is invalid.", AUTH_REQUIRED: "Sign in to access Actions.",
  AUTH_NOT_CONFIGURED: "Authentication is not configured.", AUTH_TIMEOUT: "Session verification took too long.", NOT_FOUND: "Action not found.",
  EXPIRED: "This proposal has expired.", INVALID_STATE: "This proposal can no longer be changed.", STORAGE_UNAVAILABLE: "Action storage is temporarily unavailable." };
function failure(code: FailureCode, status = code === "AUTH_REQUIRED" ? 401 : code === "NOT_FOUND" ? 404 : code === "EXPIRED" || code === "INVALID_STATE" ? 409 :
  code === "VALIDATION_ERROR" ? 400 : code === "AUTH_TIMEOUT" ? 504 : 503): ActionResult { return { status, data: null, error: { code, message: messages[code] } }; }
function mapped(error: unknown): FailureCode {
  if (error instanceof ActionRepositoryFailure) return error.code;
  if (error instanceof AuthFailure) { const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE"; }
  return error instanceof ActionContractError ? "VALIDATION_ERROR" : "STORAGE_UNAVAILABLE";
}
export async function handleActionRequest(operation: ActionOperation, request: Request, id: string | null, factory: ActionContextFactory,
  expectedOrigin = new URL(request.url).origin, timeout = 8_000): Promise<ActionResult> {
  const method = operation === "confirm" || operation === "reject" ? "POST" : "GET";
  if (request.method !== method) return failure("VALIDATION_ERROR", 405);
  if (method === "POST" && (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site")) return failure("VALIDATION_ERROR", 403);
  if (method === "POST") {
    const length = request.headers.get("content-length");
    if ((length !== null && length !== "0") || request.headers.has("content-type") || request.headers.has("transfer-encoding")) return failure("VALIDATION_ERROR");
  }
  try { return await bounded(async signal => {
    const itemId = id === null ? null : actionId(id); const context = await factory(signal);
    if (context.repository.ownerId !== context.userId) throw new AuthFailure("AUTH_REQUIRED");
    if (operation === "list-proposals") return { status: 200, data: { items: (await context.repository.listProposals()).map(proposalView) }, error: null };
    if (operation === "confirm") return { status: 200, data: cardView(await context.repository.confirm(itemId!)), error: null };
    if (operation === "reject") return { status: 200, data: proposalView(await context.repository.reject(itemId!)), error: null };
    if (operation === "list-cards") return { status: 200, data: { items: (await context.repository.listCards()).map(cardView) }, error: null };
    return { status: 200, data: cardView(await context.repository.readCard(itemId!)), error: null };
  }, timeout); } catch (error) { return failure(mapped(error)); }
}
