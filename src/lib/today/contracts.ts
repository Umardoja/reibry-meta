// Today contracts adapt REIBRY Original types/reibry.ts at 76d3494.
import type { LifeContext, LifeContextStatus, LifeContextType } from "../life/contracts.ts";
import type { MemorySourceType, MemoryStatus } from "../memory/contracts.ts";

export const TODAY_CONTEXT_SCAN_MAX = 50;
export const TODAY_MATCH_CONTEXT_MAX = 12;
export const TODAY_MEMORY_SCAN_MAX = 250;
export const TODAY_ITEM_MAX = 3;

export type TodayLifeItem = Pick<LifeContext, "id" | "title" | "description" | "startDate" | "endDate"> & {
  type: LifeContextType;
  status: LifeContextStatus;
  href: string;
};

export type TodayResurfacedMemory = {
  memoryId: string;
  memoryHref: string;
  displayTitle: string;
  sourceType: MemorySourceType;
  sourceLabel: string;
  processingStatus: MemoryStatus;
  storedExcerpt: string | null;
  lifeContext: TodayLifeItem;
  reason: string;
  score: number;
  evidenceFields: Array<"title" | "note" | "metadata" | "hostname">;
  evidenceLimit: "stored-note" | "metadata-only";
};

export type TodayFeed = {
  generatedAt: string;
  upcomingLifeContexts: TodayLifeItem[];
  resurfacedMemories: TodayResurfacedMemory[];
};

export class TodayContractError extends Error {}

export function toTodayLifeItem(context: LifeContext): TodayLifeItem {
  if (!context.startDate || !Number.isFinite(Date.parse(context.startDate))) throw new TodayContractError("Today requires a dated Life context.");
  return { id: context.id, title: context.title, description: context.description, type: context.type, status: context.status,
    startDate: context.startDate, endDate: context.endDate, href: `/life/manage#life-${context.id}` };
}

export function validateTodayFeed(feed: TodayFeed) {
  if (!Number.isFinite(Date.parse(feed.generatedAt)) || feed.upcomingLifeContexts.length > TODAY_ITEM_MAX || feed.resurfacedMemories.length > TODAY_ITEM_MAX)
    throw new TodayContractError("Invalid Today feed.");
  for (const item of feed.resurfacedMemories) {
    if (item.memoryHref !== `/memories/${item.memoryId}` || !item.reason || item.reason.length > 300 || item.storedExcerpt && item.storedExcerpt.length > 280 ||
      !Number.isInteger(item.score) || item.score < 1 || item.score > 100 || !item.evidenceFields.length ||
      item.lifeContext.href !== `/life/manage#life-${item.lifeContext.id}`) throw new TodayContractError("Invalid Today evidence.");
  }
  return feed;
}
