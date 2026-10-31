import { videoAnalysisApiRoute } from "@/lib/video/server";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) { return videoAnalysisApiRoute(request, (await context.params).id); }
