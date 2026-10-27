import { memoryApiRoute } from "@/lib/memory/server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return memoryApiRoute("read", request, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return memoryApiRoute("update", request, (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return memoryApiRoute("delete", request, (await context.params).id); }
