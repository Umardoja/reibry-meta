import { lifeApiRoute } from "@/lib/life/server";
export async function POST(request:Request){return lifeApiRoute("create",request);}
