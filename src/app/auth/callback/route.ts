// PKCE callback adapted from original REIBRY; no onboarding/profile dependency.
import { authRoute } from "@/lib/auth/server";
export function GET(request: Request) { return authRoute("callback", request); }
