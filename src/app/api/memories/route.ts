import { memoryApiRoute } from "@/lib/memory/server";
export function GET(request: Request) { return memoryApiRoute("list", request); }
export function POST(request: Request) { return memoryApiRoute("create", request); }
