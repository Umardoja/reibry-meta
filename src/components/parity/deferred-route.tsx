import Link from "next/link";
import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { PageContainer, StatePanel } from "@/components/ui/primitives";

export async function DeferredRoute({ next, eyebrow, title, description, dependency, links = [] }: { next: string; eyebrow: string; title: string; description: string; dependency: string; links?: { href: string; label: string }[] }) {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) redirect(`/auth?next=${encodeURIComponent(next)}`);
  return <PageContainer><header className="section-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>
    <StatePanel title="This original journey is being reconnected"><p>{dependency}</p>{links.length > 0 && <div className="deferred-links">{links.map(link => <Link key={link.href} href={link.href} className="button btn-ghost">{link.label}</Link>)}</div>}</StatePanel>
  </PageContainer>;
}
