import { actionApiRoute } from "@/lib/actions/server";
export async function POST(request: Request, context: RouteContext<"/api/actions/proposals/[id]/reject">) {
  return actionApiRoute("reject", request, (await context.params).id);
}
