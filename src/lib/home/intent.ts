import type { HomeIntent } from "./contracts.ts";

const externalTool = /\b(?:send|email|message|text|book|buy|purchase|pay|transfer|browse|open a website|run|execute|shell|terminal|calendar event|schedule a meeting)\b/i;
const actionReview = /\b(?:action cards?|action proposals?|(?:review|explain) (?:my |an? |the )?(?:proposed )?(?:actions?|suggestions?)|saved actions?)\b/i;
const undatedLife = /\b(?:life contexts?|plans?|events?)\b.*\b(?:need dates?|without dates?|no date|undated)\b|\bwhat needs? a date\b/i;
const upcomingLife = /\b(?:what(?:'s| is| do i have)? coming up|upcoming|next (?:event|deadline|trip|appointment)|show (?:my )?(?:life|events?|deadlines?|trips?)|show (?:my )?.{1,80} plans?)\b/i;
const lifeDraft = /^(?:please\s+)?(?:add|create|save|remember|help me add|i have|i'm planning|i am planning|i need to|i want to|remind me)\b/i;
const grounded = /\b(?:answer|explain|summari[sz]e|what did i save|what do my (?:saved )?memories|based on (?:my )?(?:saved )?memories|using (?:my )?(?:saved )?memories|according to (?:my )?(?:saved )?)\b/i;
const search = /\b(?:find|search|look for|where is|where's|show me)\b.*\b(?:saved|memory|memories|note|link|video|recipe|article)?\b|\b(?:saved|memory|memories)\b.*\b(?:about|for|called|with)\b/i;

export function classifyHomeIntent(message: string): HomeIntent {
  const value = message.trim();
  if (externalTool.test(value)) return "UNSUPPORTED";
  if (actionReview.test(value)) return "ACTION_REVIEW";
  if (undatedLife.test(value)) return "LIFE_UNDATED";
  if (upcomingLife.test(value)) return "LIFE_UPCOMING";
  if (lifeDraft.test(value)) return "LIFE_DRAFT";
  if (grounded.test(value) || (/\?$/.test(value) && /\b(?:saved|memory|memories|notes?)\b/i.test(value))) return "GROUNDED_ANSWER";
  if (search.test(value)) return "MEMORY_SEARCH";
  return "CLARIFICATION";
}

export function homeSearchQuery(message: string) {
  return message.replace(/^(?:please\s+)?(?:find|search(?: for)?|look for|where is|where's|show me)\s+/i, "")
    .replace(/\b(?:in|from)\s+my\s+(?:saved\s+)?(?:memories|memory|notes?)\b/gi, "")
    .replace(/\b(?:saved\s+)?(?:memory|memories)\b/gi, "").replace(/\s+/g, " ").replace(/[?!.]+$/g, "").trim().slice(0, 200) || message.slice(0, 200);
}
