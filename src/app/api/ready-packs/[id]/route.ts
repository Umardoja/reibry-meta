import { readyPackApiRoute } from "@/lib/ready-packs/server";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return readyPackApiRoute("read",request,(await params).id);}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){return readyPackApiRoute("checklist",request,(await params).id);}
