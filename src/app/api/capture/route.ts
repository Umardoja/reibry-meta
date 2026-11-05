import { captureApiRoute } from "@/lib/capture/server";
export function POST(request: Request) { return captureApiRoute(request); }
