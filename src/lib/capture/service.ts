import "server-only";
import { createHash } from "node:crypto";
import type { JsonValue } from "../memory/contracts.ts";
import type { MemoryRepository } from "../memory/repository.ts";
import { deterministicTitle, type CaptureInput } from "./contracts.ts";
import { enrichLink, type MetadataResult } from "./enrichment.ts";
import { parsePublicLink, type ParsedCaptureUrl } from "./url-policy.ts";

export type CaptureResult = { memory: Awaited<ReturnType<MemoryRepository["read"]>>; duplicate: boolean; enrichment: Pick<MetadataResult, "status" | "provider"> };
export type LinkEnricher = (link: ParsedCaptureUrl) => Promise<MetadataResult>;
function key(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function noteTitle(content: string) { return deterministicTitle(content.split(/\r?\n/, 1)[0] || "Saved note"); }

export async function capture(input: CaptureInput, repository: MemoryRepository, enrich: LinkEnricher = enrichLink): Promise<CaptureResult> {
  if (input.sourceType === "text") {
    const canonical = input.content.replace(/\r\n/g, "\n").trim();
    const created = await repository.createUnique({ title: input.title || noteTitle(canonical), sourceType: "text", sourceUrl: null,
      rawText: canonical, analysisStatus: "processing", metadata: { capture: "note", enrichment: "not-applicable" } }, key(`text\0${canonical}`));
    return { ...created, enrichment: { status: "unsupported", provider: null } };
  }
  const link = parsePublicLink(input.content);
  const metadata = await enrich(link);
  const fields: Record<string, JsonValue> = { capture: "link", normalizedUrl: link.normalized, platform: link.platform,
    enrichment: metadata.status, metadataProvider: metadata.provider };
  if (metadata.author) fields.author = metadata.author;
  if (metadata.thumbnailUrl) fields.thumbnailUrl = metadata.thumbnailUrl;
  const created = await repository.createUnique({ title: input.title || metadata.title || link.hostname, sourceType: "link",
    sourceUrl: link.submitted, rawText: null, analysisStatus: "processing", metadata: fields }, key(`link\0${link.normalized}`));
  return { ...created, enrichment: { status: metadata.status, provider: metadata.provider } };
}
