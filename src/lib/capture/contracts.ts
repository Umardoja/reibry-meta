// Adapted from original REIBRY capture adapters and contracts at source 76d3494.
// The Meta Edition contract deliberately excludes analysis, summaries and caller ownership.
export const CAPTURE_TEXT_MAX = 50_000;
export const CAPTURE_URL_MAX = 2_048;
export const CAPTURE_TITLE_MAX = 200;

export const CAPTURE_NOTE_MAX = 5_000;
/** note: the user's own words about a shared link. It is stored as user-provenance raw_text and never replaced by provider metadata. */
export type CaptureInput = { sourceType: "text" | "link"; content: string; title?: string; note?: string };
export class CaptureContractError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CaptureContractError("Provide a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new CaptureContractError(`${label} must contain 1-${max} characters.`);
  return value.trim();
}
export function parseCaptureInput(value: unknown): CaptureInput {
  const input = object(value);
  if (Object.keys(input).some(key => !["sourceType", "content", "title", "note"].includes(key))) throw new CaptureContractError("Unsupported Capture field.");
  if (input.sourceType !== "text" && input.sourceType !== "link") throw new CaptureContractError("Choose a note or public HTTPS link.");
  const content = text(input.content, input.sourceType === "text" ? "Note" : "Link", input.sourceType === "text" ? CAPTURE_TEXT_MAX : CAPTURE_URL_MAX);
  const title = input.title === undefined || input.title === "" ? undefined : text(input.title, "Title", CAPTURE_TITLE_MAX);
  if (input.note !== undefined && input.note !== "" && input.sourceType !== "link") throw new CaptureContractError("A separate note applies to links only.");
  const note = input.note === undefined || input.note === "" ? undefined : text(input.note, "Note", CAPTURE_NOTE_MAX);
  return { sourceType: input.sourceType, content, ...(title ? { title } : {}), ...(note ? { note } : {}) };
}

export function deterministicTitle(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > CAPTURE_TITLE_MAX ? `${clean.slice(0, CAPTURE_TITLE_MAX - 1).trimEnd()}…` : clean;
}
