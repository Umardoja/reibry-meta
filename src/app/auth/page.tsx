import { AuthForm } from "@/components/auth/auth-form";
import { authConfig } from "@/lib/supabase/config";
import { safeNext, messages } from "@/lib/auth/policy";
export const dynamic = "force-dynamic";
export default async function AuthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  let configured = false;
  try { authConfig(process.env); configured = true; } catch { /* Fail closed; no provider call. */ }
  const notice = query.signout === "local" ? "Signed out on this device. Remote session revocation could not be confirmed."
    : query.signout === "complete" ? "You are signed out." : query.error === "INVALID_CALLBACK" ? messages.INVALID_CALLBACK
    : query.error ? messages.AUTH_UNAVAILABLE : "";
  return <AuthForm configured={configured} next={safeNext(query.next)} notice={notice} />;
}
