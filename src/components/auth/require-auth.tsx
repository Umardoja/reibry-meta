"use client";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { canShowProtected } from "@/lib/auth/session";
import { messages } from "@/lib/auth/policy";
import { Button } from "@/components/ui/primitives";
import { useAuthSession } from "./auth-session-provider";
export function RequireAuth({ children, nextPath = "/account" }: { children: ReactNode; nextPath?: string }) {
  const { state, retry } = useAuthSession();
  const router = useRouter();
  const signInHref = `/auth?next=${encodeURIComponent(nextPath)}`;
  // Private content is never rendered while unauthenticated. Replace the
  // temporary signed-out state so visiting / reaches the normal auth flow and
  // does not leave a stale protected-page shell in history.
  useEffect(() => {
    if (state.status === "unauthenticated") router.replace(signInHref);
  }, [router, signInHref, state.status]);
  if (canShowProtected(state)) return children;
  if (state.status === "checking") return <p role="status">Checking your session… This check is limited to 12 seconds.</p>;
  if (state.status === "error") return <div role="alert"><p>{messages[state.error || "AUTH_UNAVAILABLE"]}</p>
    {state.attempts < 3 ? <Button variant="ghost" onClick={retry}>Retry session check</Button> : <p>Retry limit reached. Return to sign in or reload to try again.</p>}
    <Link href={signInHref}>Return to sign in</Link></div>;
  return <p>You are signed out. <Link href={signInHref}>Sign in to continue</Link>.</p>;
}
