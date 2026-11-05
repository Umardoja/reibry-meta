import { todayApiRoute } from "@/lib/today/server";
export async function GET(request: Request) { return todayApiRoute(request); }
