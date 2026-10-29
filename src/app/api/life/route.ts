import { lifeApiRoute } from "@/lib/life/server";
export async function GET(request:Request){return lifeApiRoute("list",request);}
