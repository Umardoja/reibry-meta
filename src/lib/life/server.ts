import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthCookies } from "../auth/server.ts";
import { canonicalOrigin } from "../auth/origin.ts";
import { AuthFailure, missingSession, providerFailure } from "../auth/policy.ts";
import { cookieJar, isAuthCookie } from "../supabase/cookies.ts";
import { createUserSupabaseClient } from "../supabase/server.ts";
import { createSupabaseLifeRepository } from "./supabase-repository.ts";
import { handleLifeRequest,lifePrivateHeaders,type LifeOperation } from "./handler.ts";
export async function lifeApiRoute(operation:LifeOperation,request:Request,id:string|null=null){const incoming=(await cookies()).getAll();const jar=cookieJar(incoming);let origin:string;try{origin=canonicalOrigin(request,process.env.AUTH_SITE_URL);}catch{return NextResponse.json({data:null,error:{code:"AUTH_NOT_CONFIGURED",message:"Authentication is not configured."}},{status:503,headers:lifePrivateHeaders});}const result=await handleLifeRequest(operation,request,id,async signal=>{if(!incoming.some(cookie=>isAuthCookie(cookie.name)))throw new AuthFailure("AUTH_REQUIRED");const{client}=createUserSupabaseClient(jar,signal,origin);const{data,error}=await client.auth.getUser();if(error){if(missingSession(error))throw new AuthFailure("AUTH_REQUIRED");throw providerFailure(error);}if(!data.user?.id)throw new AuthFailure("AUTH_REQUIRED");return{userId:data.user.id,repository:createSupabaseLifeRepository(client,data.user.id)};},origin);const response=NextResponse.json({data:result.data,error:result.error},{status:result.status,headers:lifePrivateHeaders});return applyAuthCookies(response,result.status===401?jar.clear():result.error?[]:jar.writes(),origin.startsWith("https:"));}
