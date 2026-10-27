"use client";
// Adapted from original REIBRY AuthSessionProvider; no native bridge or optimistic grant.
import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import { checkSession, initialSession, sessionReducer, type SessionState } from "@/lib/auth/session";
const Context = createContext<{ state: SessionState; retry: () => void; refresh: () => void; lock: () => void; signedOut: () => void } | null>(null);
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  useEffect(() => {
    if (state.status !== "checking") return;
    let active = true;
    const controller = new AbortController();
    void checkSession(fetch, 12_000, controller.signal).then(result => {
      if (active) dispatch({ type: "result", version: state.version, ...result });
    });
    return () => { active = false; controller.abort(); };
  }, [state.status, state.version]);
  useEffect(() => {
    const check = () => { if (document.visibilityState === "visible") dispatch({ type: "refresh" }); };
    window.addEventListener("focus", check);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("reibry-meta-session-events");
    if (channel) channel.onmessage = () => dispatch({ type: "refresh" });
    return () => { window.removeEventListener("focus", check); channel?.close(); };
  }, []);
  return <Context.Provider value={{ state, retry: () => dispatch({ type: "retry" }), refresh: () => dispatch({ type: "refresh" }),
    lock: () => dispatch({ type: "lock" }), signedOut: () => dispatch({ type: "signed-out" }) }}>{children}</Context.Provider>;
}
export function useAuthSession() {
  const context = useContext(Context);
  if (!context) throw new Error("AuthSessionProvider is required");
  return context;
}
export function notifySessionChange() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("reibry-meta-session-events");
  channel.postMessage("recheck"); channel.close(); // Notification only, never tokens or user data.
}
