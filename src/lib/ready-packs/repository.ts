import type { ReadyPack,ReadyPackConfirmation,ReadyPackChecklistUpdate,ReadyPackType } from "./contracts.ts";
export type ReadyPackRepositoryFailureCode="NOT_FOUND"|"CONFLICT"|"INVALID_REFERENCE"|"STORAGE_UNAVAILABLE";
export class ReadyPackRepositoryFailure extends Error{code:ReadyPackRepositoryFailureCode;constructor(code:ReadyPackRepositoryFailureCode){super(code);this.code=code;}}
export type TrustedPackConfirmation=ReadyPackConfirmation&{title:string;packType:ReadyPackType;reasons:Record<string,Record<string,string>>};
export interface ReadyPackRepository{readonly ownerId:string;list(planId:string|null):Promise<ReadyPack[]>;read(id:string):Promise<ReadyPack>;confirm(input:TrustedPackConfirmation):Promise<{pack:ReadyPack;duplicate:boolean}>;updateChecklist(id:string,input:ReadyPackChecklistUpdate):Promise<ReadyPack>;}
