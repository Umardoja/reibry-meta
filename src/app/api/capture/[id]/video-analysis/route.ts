import { experimentalVideoUploadEnabled } from "@/lib/video/flags";
import { videoAnalysisApiRoute } from "@/lib/video/server";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// Experimental and off by default (Stage 12J-3): on-demand video analysis calls Meta and is not part of the consumer product.
export async function POST(request: Request, context: Context) { return experimentalVideoUploadEnabled() ? videoAnalysisApiRoute(request, (await context.params).id) : new Response(null, { status: 404 }); }
