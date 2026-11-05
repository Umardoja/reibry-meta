"use client";

import { useEffect, useState, type FormEvent } from "react";
import { StatePanel } from "@/components/ui/primitives";

type Device = { id: string; name: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };
type Reply = { data: { devices?: Device[]; device?: Device; revoked?: boolean } | null; setupSecret?: string; error: { message?: string } | null };

/** The one-time secret is intentionally held only in component state and vanishes on refresh. */
export function ShortcutDeviceSetup() {
  const [devices, setDevices] = useState<Device[]>([]); const [secret, setSecret] = useState(""); const [name, setName] = useState("My iPhone Shortcut");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading"); const [error, setError] = useState("");
  useEffect(() => {
    let active = true; const controller = new AbortController();
    void fetch("/api/capture-devices", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json() as Reply; if (!response.ok || !Array.isArray(body.data?.devices)) throw new Error(body.error?.message || "Shortcut setup is unavailable."); return body.data.devices; })
      .then(items => { if (active) { setDevices(items); setState("ready"); } })
      .catch(cause => { if (active && !(cause instanceof DOMException && cause.name === "AbortError")) { setState("error"); setError(cause instanceof Error ? cause.message : "Shortcut setup is unavailable."); } });
    return () => { active = false; controller.abort(); };
  }, []);
  async function issue(event: FormEvent) {
    event.preventDefault(); if (state === "saving") return; setState("saving"); setSecret(""); setError("");
    try { const response = await fetch("/api/capture-devices", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const body = await response.json() as Reply;
      if (!response.ok || !body.data?.device || !body.setupSecret) throw new Error(body.error?.message || "Shortcut setup is unavailable.");
      setDevices(current => [body.data!.device!, ...current]); setSecret(body.setupSecret); setState("ready");
    } catch (cause) { setState("error"); setError(cause instanceof Error ? cause.message : "Shortcut setup is unavailable."); }
  }
  async function revoke(id: string) {
    if (state === "saving") return; setState("saving"); setError("");
    try { const response = await fetch("/api/capture-devices", { method: "DELETE", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const body = await response.json() as Reply;
      if (!response.ok || !body.data?.revoked) throw new Error(body.error?.message || "Unable to revoke this Shortcut.");
      setDevices(current => current.map(item => item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item)); setState("ready");
    } catch (cause) { setState("error"); setError(cause instanceof Error ? cause.message : "Unable to revoke this Shortcut."); }
  }
  return <section className="settings-section shortcut-device-setup" aria-busy={state === "loading" || state === "saving"}>
    <h2>iPhone Shortcut saving</h2><p className="page-sub">Create a capture-only credential for your own Shortcut. It can save public links only; it cannot sign in, read Memories, or access Plans.</p>
    {secret && <StatePanel><strong>Copy this credential into your private Shortcut now.</strong><br />The plain credential will not be shown again; REIBRY stores only its hash.<textarea className="input" value={secret} readOnly aria-label="One-time Shortcut credential" /></StatePanel>}
    <form className="inline-actions" onSubmit={issue}><label className="sr-only" htmlFor="shortcut-device-name">Shortcut name</label><input id="shortcut-device-name" className="input" maxLength={80} value={name} onChange={event => setName(event.target.value)} required /><button className="button btn-primary" disabled={state !== "ready"}>{state === "saving" ? "Creating…" : "Create Shortcut credential"}</button></form>
    {error && <StatePanel tone="error">{error}</StatePanel>}
    {state === "ready" && <div className="stack-list">{devices.length ? devices.map(device => <div key={device.id} className="list-row"><span><strong>{device.name}</strong><small>{device.revokedAt ? "Revoked" : `Expires ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(device.expiresAt))}`}</small></span>{!device.revokedAt && <button type="button" className="btn-soft" onClick={() => void revoke(device.id)}>Revoke</button>}</div>) : <p className="field-hint">No Shortcut credential yet.</p>}</div>}
  </section>;
}
