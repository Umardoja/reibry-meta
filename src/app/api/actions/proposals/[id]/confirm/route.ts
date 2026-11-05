import { actionApiRoute } from "@/lib/actions/server";
export async function POST(request: Request, context: RouteContext<"/api/actions/proposals/[id]/confirm">) {
  return actionApiRoute("confirm", request, (await context.params).id);
}
