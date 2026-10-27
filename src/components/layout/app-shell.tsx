// Presentation-only adaptation of REIBRY components/layout/app-shell.tsx and navigation.tsx.
// Original contributors retain attribution; source commit 76d3494465bab43a5051498e90b9a486a65312b9.
import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "../ui/brand-mark";
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="app-header">
        <div className="header-logo-wrap"><BrandMark /></div>
        <div><p className="header-brand">REIBRY</p><p className="header-page">Meta Edition</p></div>
        <span className="edition-pill">Development foundation</span>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <nav className="foundation-nav" aria-label="Foundation navigation">
        <Link href="/" className="nav-btn active" aria-current="page">Home</Link>
        <a href="#ui-foundation" className="nav-btn">UI foundation</a>
      </nav>
      <footer className="app-footer">Built on the original REIBRY foundation.</footer>
    </div>
  );
}
