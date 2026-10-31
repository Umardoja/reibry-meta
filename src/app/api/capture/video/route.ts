import { videoUploadApiRoute } from "@/lib/video/server";
// Node runtime: the server validates the real container with ffprobe before anything is stored.
export const runtime = "nodejs";
export async function POST(request: Request) { return videoUploadApiRoute(request); }
