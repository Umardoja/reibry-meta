"use client";
// Mobile: bottom bar with the five everyday destinations and a raised Capture button.
// Desktop (>= 960px, CSS): the same element becomes a sidebar with the brand and every destination.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IC } from "@/components/design/icons";
import { BrandMark } from "@/components/ui/brand-mark";
type Destination = { href: string; label: string; icon: React.ReactNode; desktopOnly?: boolean };
const destinations: Destination[] = [
  { href: "/", label: "Home", icon: IC.home }, { href: "/today", label: "Today", icon: IC.sun, desktopOnly: true },
  { href: "/memories", label: "Memories", icon: IC.memories }, { href: "/capture", label: "Capture", icon: IC.plus },
  { href: "/plans", label: "Plans", icon: IC.plan }, { href: "/life", label: "Life", icon: IC.cal },
  { href: "/actions", label: "Action Cards", icon: IC.cards, desktopOnly: true }, { href: "/settings", label: "Account", icon: IC.account, desktopOnly: true },
];
export function Navigation() {
  const pathname = usePathname();
  return <nav className="app-nav" aria-label="Main navigation">
    <Link href="/" className="nav-brand" aria-label="REIBRY home"><BrandMark /><span>REIBRY</span></Link>
    <Link href="/capture" className="nav-save-cta">{IC.plus}<span>Save something</span></Link>
    {destinations.map(({ href, label, icon, desktopOnly }) => {
      const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
      const capture = href === "/capture";
      return <Link key={href} href={href} aria-current={active ? "page" : undefined}
        className={`nav-item${capture ? " nav-capture" : ""}${active ? " active" : ""}${desktopOnly ? " desktop-only" : ""}`}>
        <span className={capture ? "nav-capture-disc" : "nav-icon"}>{icon}</span><span className="nav-label">{label}</span></Link>;
    })}
    <p className="nav-promise">You save useful things every day. REIBRY remembers them.</p>
  </nav>;
}
