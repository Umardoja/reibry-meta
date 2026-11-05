import { homeApiRoute } from "@/lib/home/server";
export function POST(request: Request) { return homeApiRoute(request); }
