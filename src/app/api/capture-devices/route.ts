import { shortcutDevicesApiRoute } from "@/lib/shortcut-capture/server";
export async function GET(request: Request) { return shortcutDevicesApiRoute(request); }
export async function POST(request: Request) { return shortcutDevicesApiRoute(request); }
export async function DELETE(request: Request) { return shortcutDevicesApiRoute(request); }
