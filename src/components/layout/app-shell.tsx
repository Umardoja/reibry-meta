"use client";
// Product shell adapted from REIBRY Original components/layout/app-shell.tsx; Stage 12J-3 adds the desktop sidebar layout (CSS).
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { IC } from "@/components/design/icons";
import { BrandMark } from "@/components/ui/brand-mark";
import { Navigation } from "./navigation";
const labels: Record<string, string> = { "/": "Home", "/today": "Today", "/memories": "Memories", "/capture": "Capture", "/ask": "Ask REIBRY", "/life": "Life", "/life/manage": "Life",
  "/plans": "Plans", "/actions": "Action Cards", "/settings": "Account", "/account": "Account", "/auth": "Account" };
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === "/auth" || pathname === "/onboarding";
  const label = pathname.startsWith("/memories/") ? "Memory" : pathname.startsWith("/plans/") ? "Plan" : labels[pathname] || "REIBRY";
  return <div className={`app${bare ? " app-bare" : ""}`}>
    <a href="#main" className="skip-link">Skip to content</a>
    {pathname !== "/onboarding" && <header className="app-header">
      <Link href="/" className="header-logo-wrap" aria-label="REIBRY home"><BrandMark /></Link>
      <div className="header-title-stack"><p className="header-brand">REIBRY</p><p className="header-page">{label}</p></div>
      {!bare && <details className="account-menu"><summary className="header-account" aria-label="Account and more">{IC.account}</summary>
        <div className="account-menu-panel"><Link href="/today">{IC.sun}Today</Link><Link href="/ask">{IC.chat}Ask REIBRY</Link><Link href="/actions">{IC.cards}Action Cards</Link>
          <Link href="/settings">{IC.account}Account</Link><SignOutButton /></div></details>}
    </header>}
    <main id="main" tabIndex={-1} className={bare ? "bare-content" : "page-scroll"}>{children}</main>
    {!bare && <Navigation />}
  </div>;
}
