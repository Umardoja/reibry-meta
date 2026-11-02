import { createHash, randomBytes } from "node:crypto";
import { CaptureContractError, CAPTURE_URL_MAX } from "../capture/contracts.ts";
import { memoryId } from "../memory/contracts.ts";

export const SHORTCUT_DEVICE_NAME_MAX = 80;
export const SHORTCUT_DEVICE_MAX_DAYS = 180;
export const SHORTCUT_DEVICE_DEFAULT_DAYS = 90;
export const SHORTCUT_REQUEST_MAX_BYTES = 4_096;
const tokenPattern = /^rsc1_[A-Za-z0-9_-]{43}$/;

export type ShortcutDevice = { id: string; name: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };
export type IssuedShortcutDevice = { device: ShortcutDevice; secret: string };
export type ShortcutCaptureInput = { url: string; requestId: string };

export class ShortcutCaptureContractError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ShortcutCaptureContractError("Provide a JSON object.");
  return value as Record<string, unknown>;
}

export function hashShortcutCredential(secret: string) {
  if (!tokenPattern.test(secret)) throw new ShortcutCaptureContractError("Invalid capture credential.");
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** The plaintext token is returned only to the authenticated setup response. */
export function createShortcutCredential() { return `rsc1_${randomBytes(32).toString("base64url")}`; }

export function parseDeviceIssue(value: unknown) {
  const input = object(value);
  if (Object.keys(input).some(key => !["name", "expiresDays"].includes(key))) throw new ShortcutCaptureContractError("Unsupported device field.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > SHORTCUT_DEVICE_NAME_MAX) throw new ShortcutCaptureContractError("Use a device name of 1-80 characters.");
  const expiresDays = input.expiresDays === undefined ? SHORTCUT_DEVICE_DEFAULT_DAYS : input.expiresDays;
  if (typeof expiresDays !== "number" || !Number.isSafeInteger(expiresDays) || expiresDays < 1 || expiresDays > SHORTCUT_DEVICE_MAX_DAYS) throw new ShortcutCaptureContractError("Use an expiry of 1-180 days.");
  return { name, expiresDays: Number(expiresDays) };
}

export function parseShortcutCapture(value: unknown): ShortcutCaptureInput {
  const input = object(value);
  if (Object.keys(input).some(key => key !== "url" && key !== "requestId")) throw new ShortcutCaptureContractError("Unsupported capture field.");
  if (typeof input.url !== "string" || !input.url.trim() || input.url.length > CAPTURE_URL_MAX) throw new CaptureContractError("Enter a valid public HTTPS link.");
  return { url: input.url.trim(), requestId: memoryId(input.requestId) };
}
