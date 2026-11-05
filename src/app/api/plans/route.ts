import { planApiRoute } from "@/lib/plans/server";
export function GET(request: Request) { return planApiRoute("list", request); }
export function POST(request: Request) { return planApiRoute("create", request); }
