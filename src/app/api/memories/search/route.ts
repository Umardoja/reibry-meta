import { retrievalApiRoute } from "@/lib/retrieval/server";
export function GET(request: Request) { return retrievalApiRoute(request); }
