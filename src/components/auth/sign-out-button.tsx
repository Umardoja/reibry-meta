"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestAuth } from "@/lib/auth/session";
import { Button } from "@/components/ui/primitives";
import { notifySessionChange, useAuthSession } from "./auth-session-provider";
export function SignOutButton() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const session = useAuthSession(), router = useRouter();
  async function signOut() {
    setBusy(true); setMessage(""); session.lock();
    try {
      const data = await requestAuth("/api/auth/sign-out", { method: "POST" });
      if (data?.signedOut !== true) throw new Error();
      session.signedOut(); notifySessionChange();
      router.replace(data.remoteRevoked === false ? "/auth?signout=local" : "/auth?signout=complete"); router.refresh();
    } catch { setMessage("Sign-out could not be confirmed. Protected content is hidden. Retry sign-out before leaving this device."); }
    finally { setBusy(false); }
  }
  return <div><Button variant="ghost" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</Button>{message && <p role="alert">{message}</p>}</div>;
}
