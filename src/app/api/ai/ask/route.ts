import { askApiRoute } from "@/lib/ai/server";
export function POST(request: Request) { return askApiRoute(request); }
