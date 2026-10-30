import { readyPackApiRoute } from "@/lib/ready-packs/server";
export async function GET(request:Request){return readyPackApiRoute("list",request);}
export async function POST(request:Request){return readyPackApiRoute("confirm",request);}
