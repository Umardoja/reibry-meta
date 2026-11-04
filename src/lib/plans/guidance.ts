import { resolveLifeDate } from "../life/dates.ts";
import type { RetrievalItem } from "../retrieval/contracts.ts";

/**
 * A deterministic, review-first bridge between Home and the existing Plan / Ready
 * Pack flow. It deliberately produces planning advice, not claims about a source.
 * The user still chooses the Memories and explicitly creates the Plan.
 */
export type PlanningKind = "exam" | "celebration" | "project";
export type PlanningScheduleStep = { title: string; description: string };
export type PlanningDraft = {
  kind: PlanningKind;
  title: string;
  description: string;
  startDate: string;
  daysRemaining: number;
  candidateMemories: RetrievalItem[];
  schedule: PlanningScheduleStep[];
  requiresConfirmation: true;
};

export type PlanningDraftResult = { draft: PlanningDraft | null; question: string | null; query: string | null };

// A saved note called "study plan" is evidence, not an instruction to create a
// new Plan. Keep this deliberately narrower than conversational retrieval.
const planningWords = /\b(?:help me (?:plan|prepare|get ready|organise|organize)|(?:can you|could you) help me (?:plan|prepare)|prepare for|create (?:a |my )?(?:study |preparation )?plan|plan (?:my|for|a) (?:upcoming )?(?:exam|birthday|party|project|deadline))\b/i;
const examWords = /\b(?:exam|test|revision|study)\b/i;
const birthdayWords = /\b(?:birthday|celebration|party|anniversary|wedding)\b/i;
const projectWords = /\b(?:project|deadline|due date|deliverable|submission)\b/i;
const filler = new Set(["a", "an", "and", "about", "for", "have", "help", "i", "in", "is", "me", "my", "next", "on", "prepare", "please", "the", "to", "with"]);

export function isPlanningPrompt(message: string) {
  if (!planningWords.test(message) || !(examWords.test(message) || birthdayWords.test(message) || projectWords.test(message))) return false;
  // Undated celebrations have an established conversational/Life-context path.
  // A deterministic draft is reserved for a user-stated deadline, while exams
  // still enter the draft path so REIBRY can ask for subject/date as needed.
  if (examWords.test(message)) return true;
  return /\b(?:today|tomorrow|tonight|this|next|in\s+\d+\s+(?:day|days|week|weeks)|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2})\b/i.test(message);
}

function kindFor(message: string): PlanningKind | null {
  if (examWords.test(message)) return "exam";
  if (birthdayWords.test(message)) return "celebration";
  if (projectWords.test(message)) return "project";
  return null;
}

function words(value: string) {
  return value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
}

function examSubject(message: string) {
  const match = message.match(/(?:\b(?:for|about|my|a|an)\s+)?([\p{L}\p{N}][\p{L}\p{N}\s-]{0,70}?)\s+(?:exam|test)\b/iu);
  if (!match) return "";
  const subject = match[1].replace(/\b(?:i|have|an?|my|upcoming)\b/giu, " ").replace(/\s+/g, " ").trim();
  return subject.length >= 2 && subject.length <= 80 ? subject : "";
}

function titleFor(kind: PlanningKind, message: string, subject: string) {
  if (kind === "exam") return subject ? `${subject.replace(/\b\w/g, letter => letter.toUpperCase())} exam` : "Exam preparation";
  if (kind === "celebration") {
    const match = message.match(/\b((?:(?:my|our)\s+)?(?:[\p{L}\p{N}'’-]+\s+){0,3}birthday)\b/iu)?.[1];
    const phrase = match?.replace(/^(?:my|our)\s+/i, "").trim();
    return phrase ? `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`.slice(0, 120) : "Celebration";
  }
  const match = message.match(/\b(?:[\p{L}\p{N}-]+\s+){0,4}(?:project|deadline|deliverable|submission)\b/iu)?.[0];
  return (match ? match.replace(/\b\w/g, letter => letter.toUpperCase()) : "Project deadline").slice(0, 120);
}

function searchQuery(kind: PlanningKind, subject: string, message: string) {
  if (subject) return subject;
  if (kind === "celebration") return "birthday";
  if (kind === "project") {
    const useful = words(message).filter(word => word.length > 2 && !filler.has(word) && !["project", "deadline", "prepare", "planning"].includes(word));
    return useful.slice(0, 4).join(" ") || "project";
  }
  return "exam";
}

function schedule(kind: PlanningKind, daysRemaining: number): PlanningScheduleStep[] {
  const urgency = daysRemaining <= 2 ? "Keep the scope small and focus on the highest-value work first." : "Leave room to adjust after checking your saved resources.";
  if (kind === "exam") return [
    { title: "Set the scope", description: "Choose the topics to cover and the saved resources you trust." },
    { title: "Study with your saved resources", description: "Work through the selected tutorials and notes; record gaps in your own words." },
    { title: "Practice and review", description: "Test recall, revisit weak areas, and avoid treating a saved link as more than its stored details." },
    { title: "Final check", description: urgency },
  ];
  if (kind === "celebration") return [
    { title: "Choose the essentials", description: "Pick only the saved cake, decor, place, or activity ideas you actually want to use." },
    { title: "Confirm the practical details", description: "Set a budget, people to contact, and anything that needs lead time." },
    { title: "Prepare", description: "Gather or order confirmed items and keep the remaining work visible." },
    { title: "Day-of check", description: urgency },
  ];
  return [
    { title: "Define the deliverable", description: "Write the smallest complete outcome and choose the saved resources that support it." },
    { title: "Make focused progress", description: "Break the work into one concrete milestone at a time." },
    { title: "Review and improve", description: "Check against the deadline and resolve the most important gaps." },
    { title: "Submit or hand off", description: urgency },
  ];
}

/** Returns a draft only when the user supplied both a bounded planning goal and a real date. */
export function buildPlanningDraft(input: { message: string; timezone: string; now: Date; candidates: RetrievalItem[]; forcePlanning?: boolean }): PlanningDraftResult {
  const kind = kindFor(input.message);
  // The Plans entry is the user's explicit choice to plan. Home still requires an
  // unambiguous planning request so ordinary conversation cannot become a Plan.
  if (!kind || (!input.forcePlanning && !isPlanningPrompt(input.message))) return { draft: null, question: null, query: null };
  const due = resolveLifeDate(input.message, input.now, input.timezone);
  if (!due) return { draft: null, question: "When is it due? Give me a day or date so I can keep the plan realistic.", query: null };
  const subject = kind === "exam" ? examSubject(input.message) : "";
  if (kind === "exam" && !subject) return { draft: null, question: "What subject is the exam for? I won't guess which saved resources belong in your study plan.", query: null };
  const daysRemaining = Math.max(0, Math.ceil((Date.parse(due) - input.now.getTime()) / 86_400_000));
  const title = titleFor(kind, input.message, subject);
  const query = searchQuery(kind, subject, input.message);
  const steps = schedule(kind, daysRemaining);
  const description = [`Suggested ${daysRemaining === 1 ? "1 day" : `${daysRemaining} days`} to prepare.`, ...steps.map((step, index) => `${index + 1}. ${step.title}: ${step.description}`)].join("\n");
  return { draft: { kind, title, description, startDate: due, daysRemaining, candidateMemories: input.candidates, schedule: steps, requiresConfirmation: true }, question: null, query };
}
