"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { canShowProtected } from "@/lib/auth/session";
import { messages } from "@/lib/auth/policy";
import { Button } from "@/components/ui/primitives";
import { useAuthSession } from "./auth-session-provider";
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, retry } = useAuthSession();
  if (canShowProtected(state)) return children;
  if (state.status === "checking") return <p role="status">Checking your session… This check is limited to 12 seconds.</p>;
  if (state.status === "error") return <div role="alert"><p>{messages[state.error || "AUTH_UNAVAILABLE"]}</p>
    {state.attempts < 3 ? <Button variant="ghost" onClick={retry}>Retry session check</Button> : <p>Retry limit reached. Return to sign in or reload to try again.</p>}
    <Link href="/auth?next=/account">Return to sign in</Link></div>;
  return <p>You are signed out. <Link href="/auth?next=/account">Sign in to continue</Link>.</p>;
}
