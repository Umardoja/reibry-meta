"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { storePendingShare, type SharedPayload } from "@/components/capture/capture-form";

/** Signed-out share: keep the shared link in this tab only, then sign in and return to /capture where it is prefilled (never auto-saved). */
export function ShareHandoff({ shared }: { shared: SharedPayload }) {
  const router = useRouter();
  useEffect(() => { storePendingShare(shared); router.replace("/auth?next=/capture"); }, [router, shared]);
  return <p role="status">Sign in to save this link…</p>;
}
