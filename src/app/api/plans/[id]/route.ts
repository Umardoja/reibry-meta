import { planApiRoute } from "@/lib/plans/server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return planApiRoute("read", request, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return planApiRoute("update", request, (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return planApiRoute("delete", request, (await context.params).id); }
