import { actionApiRoute } from "@/lib/actions/server";
export function GET(request: Request) { return actionApiRoute("list-proposals", request); }
