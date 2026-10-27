"use client";
import Link from "next/link";
import { useAuthSession } from "./auth-session-provider";
export function AuthStatus() {
  const { state } = useAuthSession();
  return <div className="auth-status"><span role="status">{state.status === "checking" ? "Checking session…" : state.status === "authenticated" ? "Signed in" : state.status === "error" ? "Session unavailable" : "Signed out"}</span>
    <Link href={state.status === "authenticated" ? "/account" : "/auth"}>{state.status === "authenticated" ? "Account" : "Sign in"}</Link></div>;
}
