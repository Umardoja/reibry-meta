import { lifeApiRoute } from "@/lib/life/server";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return lifeApiRoute("read",request,(await context.params).id);}
export async function PATCH(request:Request,context:Context){return lifeApiRoute("update",request,(await context.params).id);}
export async function DELETE(request:Request,context:Context){return lifeApiRoute("delete",request,(await context.params).id);}
