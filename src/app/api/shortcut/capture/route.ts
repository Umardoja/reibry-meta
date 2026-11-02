import { shortcutCaptureApiRoute } from "@/lib/shortcut-capture/server";
export async function POST(request: Request) { return shortcutCaptureApiRoute(request); }
