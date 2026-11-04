"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IC } from "@/components/design/icons";
const destinations = [{ href: "/", label: "Home", icon: IC.today }, { href: "/memories", label: "Memories", icon: IC.memories }, { href: "/capture", label: "Capture", icon: IC.plus }, { href: "/plans", label: "Plans", icon: IC.life }, { href: "/settings", label: "Account", icon: IC.account }];
export function Navigation() {
  const pathname = usePathname(); const router = useRouter(); const [pendingHref, setPendingHref] = useState<string | null>(null); const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const pendingHrefRef = useRef<string | null>(null);
  useEffect(() => () => { if (pendingTimer.current) clearTimeout(pendingTimer.current); }, []);
  const warmRoute = (href: string) => { if (href !== pathname) router.prefetch(href); };
  function begin(href: string) { if (href === pathname || pendingHrefRef.current === href) return false; pendingHrefRef.current = href; setPendingHref(href); if (pendingTimer.current) clearTimeout(pendingTimer.current); pendingTimer.current = setTimeout(() => { pendingHrefRef.current = null; setPendingHref(current => current === href ? null : current); }, 10_000); return true; }
  return <nav className="bottom-nav" aria-label="Main navigation">{destinations.map(({ href, label, icon }) => { const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`); const pending = pendingHref === href && !active; return <Link key={href} href={href} prefetch aria-current={active ? "page" : undefined} aria-busy={pending || undefined} onPointerEnter={() => warmRoute(href)} onFocus={() => warmRoute(href)} onClick={event => { if (!begin(href)) event.preventDefault(); }} className={`${href === "/capture" ? "nav-capture" : `nav-btn${active ? " active" : ""}`}${pending ? " nav-pending" : ""}`}>{href === "/capture" ? <span className="nav-capture-disc">{icon}</span> : <span className="nav-icon">{icon}</span>}<span>{label}</span></Link>; })}</nav>;
}
