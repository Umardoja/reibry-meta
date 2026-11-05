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
    <p className="auth-tagline">From Saved to Done<br />Your personal memory for the useful things you find.</p>
    {!configured && <p role="status" className="auth-notice">{messages.AUTH_NOT_CONFIGURED}</p>}
    {notice && <p role="status" className="auth-notice">{notice}</p>}
    {(session.state.status === "authenticated" || session.state.error === "AUTH_REQUIRED") && <div className="auth-notice">{session.state.status === "authenticated" ? <><p>Your session is verified.</p><Link href={safeNext(next) || "/account"}>Continue to account</Link></> : <p>Account access is locked while signing out.</p>}<SignOutButton /></div>}
    <div className="auth-tabs" role="group" aria-label="Account access">
      <Button variant="ghost" aria-pressed={mode === "sign-in"} disabled={busy} onClick={() => { setMode("sign-in"); setError(""); setConfirmation(false); }}>Sign in</Button>
      <Button variant="ghost" aria-pressed={mode === "sign-up"} disabled={busy} onClick={() => { setMode("sign-up"); setError(""); setConfirmation(false); }}>Sign up</Button>
    </div>
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <TextField id="auth-email" label="Email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
      <div className="field">
        <label htmlFor="auth-password">Password</label>
        <div className="password-input-wrap">
          <input id="auth-password" className="input" type={visible ? "text" : "password"} required minLength={mode === "sign-up" ? 8 : 1} maxLength={1024} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
          <button className="password-visibility-toggle" type="button" aria-controls="auth-password" aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} title={visible ? "Hide password" : "Show password"} disabled={busy} onClick={() => setVisible(value => !value)}>
            {visible ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.3A10.8 10.8 0 0 1 12 4c5.5 0 9.4 4.5 10 8-.2 1.1-.8 2.4-1.7 3.5M6.6 6.6C4.4 8 2.7 10.2 2 12c.8 3.5 4.5 8 10 8 1.5 0 2.9-.3 4.1-.9" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
          </button>
        </div>
      </div>
      {mode === "sign-up" && <TextField id="auth-confirm" label="Confirm password" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} disabled={busy} />}
      {error && <p role="alert" className="auth-error">{error}</p>}
      {confirmation && <p role="status" className="auth-notice">If your account requires confirmation, check your email for the next step. You can then return to sign in.</p>}
      {busy && <p role="status">Working… This request is limited to 12 seconds.</p>}
      <Button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in securely" : "Create account"}</Button>
    </form>
    <p className="field-hint">Your Memories are private to your account.</p>
    <Link href="/">Return to REIBRY</Link>
  </section>;
}
