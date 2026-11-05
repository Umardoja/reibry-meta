import type { Plan, PlanCreate, PlanUpdate } from "./contracts.ts";
export type PlanRepositoryFailureCode = "NOT_FOUND" | "CONFLICT" | "INVALID_REFERENCE" | "STORAGE_UNAVAILABLE";
export class PlanRepositoryFailure extends Error { code: PlanRepositoryFailureCode; constructor(code: PlanRepositoryFailureCode) { super(code); this.code = code; } }
export interface PlanRepository { readonly ownerId: string; create(input: PlanCreate): Promise<{ plan: Plan; duplicate: boolean }>; list(limit: number): Promise<Plan[]>; read(id: string): Promise<Plan>; update(id: string, input: PlanUpdate): Promise<Plan>; delete(id: string): Promise<void>; }
