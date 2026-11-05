"use client";
// Product shell adapted from REIBRY Original components/layout/app-shell.tsx.
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { IC } from "@/components/design/icons";
import { Navigation } from "./navigation";
const labels: Record<string, string> = { "/today": "Today", "/memories": "Memories", "/capture": "Capture", "/ask": "Ask REIBRY", "/life": "Life", "/plans": "Plans", "/actions": "Action Cards", "/settings": "Account", "/account": "Account", "/auth": "Account" };
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const closeAccountMenu = () => { accountMenu.current?.removeAttribute("open"); };
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => { if (accountMenu.current && !accountMenu.current.contains(event.target as Node)) closeAccountMenu(); };
    const dismissEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeAccountMenu(); };
    document.addEventListener("pointerdown", dismissOutside); document.addEventListener("keydown", dismissEscape);
    return () => { document.removeEventListener("pointerdown", dismissOutside); document.removeEventListener("keydown", dismissEscape); };
  }, []);
  const bare = pathname === "/auth" || pathname === "/onboarding";
  const label = pathname.startsWith("/memories/") ? "Memory" : pathname.startsWith("/plans/") ? "Plan" : labels[pathname] || "REIBRY";
  return <div className={`app${bare ? " app-bare" : ""}`}>
    <a href="#main" className="skip-link">Skip to content</a>
    {pathname !== "/onboarding" && <header className="app-header"><div className="header-logo-wrap">{IC.brain}</div>
      <div className="header-title-stack"><p className="header-brand">REIBRY</p><p className="header-page">{label}</p></div>
      {!bare && <details ref={accountMenu} className="account-menu"><summary className="header-account" aria-label="Account menu">{IC.account}</summary><div className="account-menu-panel" onClickCapture={closeAccountMenu}><Link href="/settings">Settings</Link><Link href="/ask">Ask REIBRY</Link><Link href="/actions">Action Cards</Link><SignOutButton /></div></details>}
    </header>}
    <main id="main" tabIndex={-1} className={bare ? "bare-content" : "page-scroll"}>{children}</main>
    {!bare && <Navigation />}
  </div>;
}
