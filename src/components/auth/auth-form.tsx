"use client";
// Form conventions adapted from original REIBRY app/auth/page.tsx.
// Source 76d3494465bab43a5051498e90b9a486a65312b9; original contributors retain attribution.
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui/primitives";
import { BrandMark } from "@/components/ui/brand-mark";
import { credentials, errorCode, messages, safeNext } from "@/lib/auth/policy";
import { requestAuth } from "@/lib/auth/session";
import { notifySessionChange, useAuthSession } from "./auth-session-provider";
import { SignOutButton } from "./sign-out-button";
export function AuthForm({ next, configured, notice }: { next: string | null; configured: boolean; notice: string }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [confirmation, setConfirmation] = useState(false);
  const session = useAuthSession(), router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(""); setConfirmation(false);
    if (mode === "sign-up" && confirm !== password) { setError("Passwords do not match."); return; }
    try {
      const input = credentials({ email, password, next }, mode === "sign-up");
      setBusy(true);
      const data = await requestAuth("/api/auth/" + mode, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      setPassword(""); setConfirm("");
      if (mode === "sign-up" && data?.requiresConfirmation === true) { setConfirmation(true); return; }
      if (data?.signedIn !== true && !(mode === "sign-up" && data?.requiresConfirmation === false)) throw new Error();
      session.refresh(); notifySessionChange();
      router.replace(safeNext(next) || "/account"); router.refresh();
    } catch (failure) { setError(messages[errorCode(failure)]); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap" aria-labelledby="auth-heading">
    <div className="auth-logo-ring"><BrandMark /></div><h1 id="auth-heading" className="auth-brand">REIBRY</h1>
    <p className="auth-tagline">From Saved to Done<br />Secure account access for Meta Edition.</p>
    {!configured && <p role="status" className="auth-notice">{messages.AUTH_NOT_CONFIGURED}</p>}
    {notice && <p role="status" className="auth-notice">{notice}</p>}
    {(session.state.status === "authenticated" || session.state.error === "AUTH_REQUIRED") && <div className="auth-notice">{session.state.status === "authenticated" ? <><p>Your session is verified.</p><Link href={safeNext(next) || "/account"}>Continue to account</Link></> : <p>Account access is locked while signing out.</p>}<SignOutButton /></div>}
    <div className="auth-tabs" role="group" aria-label="Account access">
      <Button variant="ghost" aria-pressed={mode === "sign-in"} disabled={busy} onClick={() => { setMode("sign-in"); setError(""); setConfirmation(false); }}>Sign in</Button>
      <Button variant="ghost" aria-pressed={mode === "sign-up"} disabled={busy} onClick={() => { setMode("sign-up"); setError(""); setConfirmation(false); }}>Sign up</Button>
    </div>
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <TextField id="auth-email" label="Email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
      <TextField id="auth-password" label="Password" type={visible ? "text" : "password"} required minLength={mode === "sign-up" ? 8 : 1} maxLength={1024} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
      <Button variant="ghost" aria-controls="auth-password" aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? "Hide password" : "Show password"}</Button>
      {mode === "sign-up" && <TextField id="auth-confirm" label="Confirm password" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} disabled={busy} />}
      {error && <p role="alert" className="auth-error">{error}</p>}
      {confirmation && <p role="status" className="auth-notice">If your account requires confirmation, check your email for the next step. You can then return to sign in.</p>}
      {busy && <p role="status">Working… This request is limited to 12 seconds.</p>}
      <Button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in securely" : "Create account"}</Button>
    </form>
    <p className="field-hint">Live Supabase authentication has not yet been verified for this edition.</p>
    <Link href="/">Return to REIBRY</Link>
  </section>;
}
