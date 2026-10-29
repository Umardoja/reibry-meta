import Link from "next/link";
import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, PageContainer } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function SettingsPage() { let verified = false; try { verified = !!await verifiedPageUser(); } catch {} if (!verified) redirect("/auth?next=/settings"); return <PageContainer className="settings-content"><header className="section-heading"><p className="eyebrow">Account</p><h1>Settings</h1><p>Manage this Meta Edition session and access product-specific planning tools.</p></header><Card className="settings-section"><h2>Account</h2><p>Your session is verified by the hardened Supabase SSR boundary.</p><SignOutButton /></Card><Card className="settings-section"><h2>Meta Edition</h2><div className="deferred-links"><Link href="/ask">Ask REIBRY</Link><Link href="/actions">Action Cards</Link></div></Card><Card className="settings-section"><h2>Notifications</h2><p>Original notification preferences require the Stage 11 profile backend and are not yet available.</p></Card></PageContainer>; }
