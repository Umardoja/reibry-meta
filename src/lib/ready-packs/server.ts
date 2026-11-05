import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canonicalOrigin } from "../auth/origin.ts";
import { AuthFailure,missingSession,providerFailure } from "../auth/policy.ts";
import { applyAuthCookies } from "../auth/server.ts";
import { createSupabaseMemoryRepository } from "../memory/supabase-repository.ts";
import { createSupabasePlanRepository } from "../plans/supabase-repository.ts";
import { cookieJar,isAuthCookie } from "../supabase/cookies.ts";
import { createUserSupabaseClient } from "../supabase/server.ts";
import { handleReadyPackRequest,readyPackPrivateHeaders,type ReadyPackOperation } from "./handler.ts";
import { createSupabaseReadyPackRepository } from "./supabase-repository.ts";
export async function readyPackApiRoute(operation:ReadyPackOperation,request:Request,id:string|null=null){const incoming=(await cookies()).getAll();const jar=cookieJar(incoming);let origin:string;try{origin=canonicalOrigin(request,process.env.AUTH_SITE_URL);}catch{return NextResponse.json({data:null,error:{code:"AUTH_NOT_CONFIGURED",message:"Authentication is not configured."}},{status:503,headers:readyPackPrivateHeaders});}const result=await handleReadyPackRequest(operation,request,id,async signal=>{if(!incoming.some(cookie=>isAuthCookie(cookie.name)))throw new AuthFailure("AUTH_REQUIRED");const{client}=createUserSupabaseClient(jar,signal,origin);const{data,error}=await client.auth.getUser();if(error){if(missingSession(error))throw new AuthFailure("AUTH_REQUIRED");throw providerFailure(error);}if(!data.user?.id)throw new AuthFailure("AUTH_REQUIRED");return{userId:data.user.id,repository:createSupabaseReadyPackRepository(client,data.user.id),plans:createSupabasePlanRepository(client,data.user.id),memories:createSupabaseMemoryRepository(client,data.user.id)};},origin);const response=NextResponse.json({data:result.data,error:result.error},{status:result.status,headers:readyPackPrivateHeaders});return applyAuthCookies(response,result.status===401?jar.clear():result.error?[]:jar.writes(),origin.startsWith("https:"));}
