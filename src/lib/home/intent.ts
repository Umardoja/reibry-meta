import { resolveLifeDate } from "../life/dates.ts";
import type { HomeIntent } from "./contracts.ts";

// Deterministic routes are reserved for trusted reads and the confirm-first Life write. Everything else is conversation with Muse.
const externalAction = /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:send|email|text|message|call|ring|book|reserve|buy|order|purchase|pay|transfer|post|tweet|browse|open (?:a |the )?(?:website|site|link)|run|execute|schedule a meeting|create a calendar event)\b/i;
const actionReview = /\b(?:action cards?|action proposals?|(?:review|explain|show) (?:my |an? |the )?(?:proposed )?(?:actions?|suggestions?)|saved actions?)\b/i;
const undatedLife = /\b(?:life contexts?|plans?|events?)\b.*\b(?:need dates?|without dates?|no date|undated)\b|\bwhat needs? a date\b/i;
const upcomingLife = /\b(?:what(?:'s| is| do i have)? coming up|upcoming|next (?:event|deadline|trip|appointment)|show (?:my )?(?:life|events?|deadlines?|trips?)|show (?:my )?.{1,80} plans?)\b/i;
const explicitLifeAdd = /^(?:please\s+)?(?:add|create|schedule|put|set up|remind me|set a reminder)\b/i;
const statedLifePlan = /^(?:i have|i've got|i am planning|i'm planning|i am going|i'm going)\b/i;
const notLife = /\b(?:memory|memories|note|notes|link|video|recipe|article)\b/i;
const smallTalk = /^(?:hi|hey|hello|hiya|yo|howdy|good (?:morning|afternoon|evening)|thanks|thank you|thx|cheers|ok|okay|cool|great|nice|awesome|bye|goodbye|see you)\b[\s,!.]*(?:(?:there|reibry|so much|a lot|again|everyone|very much|this is (?:helpful|great|useful)|that(?:'s| is) (?:helpful|great|useful))[\s,!.]*)?$/i;
const capabilities = /\b(?:what can you do|what do you do|how can you help|what can i (?:do|ask)|who are you|what are you|how does (?:this|reibry) work)\b|^help[!.?\s]*$/i;
const planning = /\b(?:plan|planning|next steps?|to-?do|checklist|organi[sz]e|turn (?:that|it|this) into|help me (?:plan|prepare|get ready|organi[sz]e)|steps|actions?)\b/i;

export function classifyHomeIntent(message: string, timezone = "UTC", now = new Date()): HomeIntent {
  const value = message.trim();
  if (actionReview.test(value)) return "ACTION_REVIEW";
  if (undatedLife.test(value)) return "LIFE_UNDATED";
  if (upcomingLife.test(value)) return "LIFE_UPCOMING";
  if (explicitLifeAdd.test(value) && !notLife.test(value)) return "LIFE_DRAFT";
  if (statedLifePlan.test(value) && resolveLifeDate(value, now, timezone)) return "LIFE_DRAFT";
  if (externalAction.test(value)) return "UNSUPPORTED";
  return "CONVERSATION";
}

/** Action proposals are persisted only when the user actually asks for planning or next steps (live 12H: unprompted proposals cluttered review). */
export function isPlanningRequest(message: string) { return planning.test(message); }

/** Greetings, thanks and capability questions need no Memory retrieval. */
export function isSmallTalk(message: string) { const value = message.trim(); return smallTalk.test(value) || capabilities.test(value); }
