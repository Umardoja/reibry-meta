import { authRoute } from "@/lib/auth/server";
const getOperations = ["session", "me"] as const;
const postOperations = ["sign-in", "sign-up", "sign-out"] as const;
type Context = { params: Promise<{ operation: string }> };
export async function GET(request: Request, context: Context) {
  const { operation } = await context.params;
  const match = getOperations.find(value => value === operation);
  return match ? authRoute(match, request) : new Response(null, { status: postOperations.some(value => value === operation) ? 405 : 404 });
}
export async function POST(request: Request, context: Context) {
  const { operation } = await context.params;
  const match = postOperations.find(value => value === operation);
  return match ? authRoute(match, request) : new Response(null, { status: getOperations.some(value => value === operation) ? 405 : 404 });
}
