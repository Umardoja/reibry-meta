import { experimentalVideoUploadEnabled } from "@/lib/video/flags";
import { videoUploadApiRoute } from "@/lib/video/server";
// Node runtime: the server validates the real container with ffprobe before anything is stored.
export const runtime = "nodejs";
// Experimental and off by default (Stage 12J-3): without REIBRY_EXPERIMENTAL_VIDEO_UPLOAD=true this endpoint does not exist.
export async function POST(request: Request) { return experimentalVideoUploadEnabled() ? videoUploadApiRoute(request) : new Response(null, { status: 404 }); }
