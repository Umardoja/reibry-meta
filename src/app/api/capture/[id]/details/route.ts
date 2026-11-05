import { captureDetailsApiRoute } from "@/lib/capture/server";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { return captureDetailsApiRoute(request, (await context.params).id); }
