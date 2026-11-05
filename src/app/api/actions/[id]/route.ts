import { actionApiRoute } from "@/lib/actions/server";
export async function GET(request: Request, context: RouteContext<"/api/actions/[id]">) {
  return actionApiRoute("read-card", request, (await context.params).id);
}
