import { readyPackApiRoute } from "@/lib/ready-packs/server";
export async function GET(request:Request){return readyPackApiRoute("preview",request);}
