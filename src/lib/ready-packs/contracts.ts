// Adapted from REIBRY Original ReadyPack contracts and finalization helpers at source commit 76d3494.
import type { PlanMemoryReference } from "../plans/contracts.ts";

export const readyPackTypes = ["travel", "event", "learning"] as const;
export type ReadyPackType = (typeof readyPackTypes)[number];
export type ReadyPackStatus = "active" | "completed" | "archived";
export type ReadyPackItem = { id: string; memory: PlanMemoryReference; section: string; relevanceReason: string; relevanceStrength: "direct" | "strong" | "related" };
export type ReadyPackSection = { name: string; position: number; reviewed: boolean; items: ReadyPackItem[] };
export interface ReadyPack { id: string; userId: string; planId: string; title: string; packType: ReadyPackType; status: ReadyPackStatus; sections: ReadyPackSection[]; version: number; createdAt: string; updatedAt: string }
export type ReadyPackCandidate = { memory: PlanMemoryReference; section: string; relevanceReason: string; relevanceStrength: "strong"; evidenceLimit: "stored-note" | "metadata-only" };
export type ReadyPackPreview = { planId: string; title: string; packType: ReadyPackType | null; sections: Array<{ name: string; candidates: ReadyPackCandidate[] }>; missingSections: string[]; message: string | null };
export type ReadyPackConfirmation = { planId: string; selections: Record<string, string[]>; requestId: string; expectedVersion?: number };
export type ReadyPackChecklistUpdate = { section: string; reviewed: boolean; expectedVersion: number };
export class ReadyPackContractError extends Error {}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=(value:unknown)=>{if(!value||typeof value!=="object"||Array.isArray(value))throw new ReadyPackContractError("Provide a JSON object.");return value as Record<string,unknown>;};
const exact=(value:Record<string,unknown>,keys:string[])=>{if(Object.keys(value).some(key=>!keys.includes(key)))throw new ReadyPackContractError("Unsupported Ready Pack field.");};
export function readyPackId(value:unknown){if(typeof value!=="string"||!uuid.test(value))throw new ReadyPackContractError("Use a valid identifier.");return value.toLowerCase();}
export function expectedPackSections(type:ReadyPackType){return type==="travel"?["Places","Food","Stay","Travel tips"]:type==="event"?["Cake ideas","Gift ideas","Places to go","Activities"]:["Tutorials","Topics","Practice","Resources"];}
export function parseReadyPackConfirmation(value:unknown):ReadyPackConfirmation{const input=object(value);exact(input,["planId","selections","requestId","expectedVersion"]);const planId=readyPackId(input.planId);const requestId=readyPackId(input.requestId);const selections=object(input.selections);if(Object.keys(selections).length>4)throw new ReadyPackContractError("Too many sections.");const parsed:Record<string,string[]>={};let count=0;for(const [section,ids] of Object.entries(selections)){if(typeof section!=="string"||!section.trim()||section.length>80||!Array.isArray(ids)||ids.length>12)throw new ReadyPackContractError("Invalid section selection.");parsed[section]=ids.map(readyPackId);count+=ids.length;}if(count<1||count>20||new Set(Object.values(parsed).flat()).size!==count)throw new ReadyPackContractError("Choose 1-20 unique Memories.");let expectedVersion: number|undefined;if(input.expectedVersion!==undefined){if(!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<1)throw new ReadyPackContractError("Use the current Ready Pack version.");expectedVersion=Number(input.expectedVersion);}return{planId,selections:parsed,requestId,expectedVersion};}
export function parseReadyPackChecklist(value:unknown):ReadyPackChecklistUpdate{const input=object(value);exact(input,["section","reviewed","expectedVersion"]);if(typeof input.section!=="string"||!input.section.trim()||input.section.length>80||typeof input.reviewed!=="boolean"||!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<1)throw new ReadyPackContractError("Check the guide update.");return{section:input.section,reviewed:input.reviewed,expectedVersion:Number(input.expectedVersion)};}
export function parseReadyPackList(url:URL){if([...url.searchParams.keys()].some(key=>key!=="planId"))throw new ReadyPackContractError("Unsupported Ready Pack filter.");const value=url.searchParams.get("planId");return value?readyPackId(value):null;}
export function serializeReadyPack(pack:ReadyPack):ReadyPack{return{...pack,sections:pack.sections.map(section=>({...section,items:section.items.map(item=>({...item,memory:{...item.memory}}))}))};}
