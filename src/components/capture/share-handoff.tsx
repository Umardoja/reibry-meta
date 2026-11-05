"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { storePendingShare } from "@/components/capture/capture-form";
import { parseSharedFragment, type SharedPayload } from "@/lib/capture/share";

/**
 * Signed out on /capture: keep a shared link (from ?url= or the #url= fragment, which the server never sees) in this tab only, then
 * sign in and return to /capture where it is prefilled. Never auto-saved, and nothing about the user travels in the link.
 */
export function ShareHandoff({ shared }: { shared: SharedPayload | null }) {
  const router = useRouter();
  useEffect(() => {
    const payload = shared ?? parseSharedFragment(window.location.hash);
    if (payload) storePendingShare(payload);
    // Drop the link from the address bar and history before leaving this page.
    window.history.replaceState(null, "", "/capture");
    router.replace("/auth?next=/capture");
  }, [router, shared]);
  return <p role="status">{shared ? "Sign in to save this link…" : "Sign in to capture…"}</p>;
}
