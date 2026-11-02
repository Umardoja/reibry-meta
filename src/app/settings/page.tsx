import Link from "next/link";
import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { IC } from "@/components/design/icons";
import { Card, PageContainer } from "@/components/ui/primitives";
import { ShortcutDeviceSetup } from "@/components/settings/shortcut-device-setup";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ } if (!verified) redirect("/auth?next=/settings");
  return <PageContainer className="settings-content">
    <header className="page-hero"><p className="eyebrow">Account</p><h1>Your account</h1><p>Your Memories, plans and notes are private to you.</p></header>
    <Card className="settings-section"><h2>Signed in</h2><p className="page-sub">You&apos;re signed in on this device. Signing out here doesn&apos;t sign out your other devices.</p><SignOutButton /></Card>
    <Card className="settings-section"><h2>More from REIBRY</h2><div className="inline-actions"><Link className="btn-soft" href="/today">{IC.sun}Today</Link><Link className="btn-soft" href="/ask">{IC.chat}Ask REIBRY</Link><Link className="btn-soft" href="/actions">{IC.cards}Action Cards</Link></div></Card>
    <Card className="settings-section"><h2>Notifications</h2><p className="page-sub">Reminders aren&apos;t available yet.</p></Card>
    <ShortcutDeviceSetup />
  </PageContainer>;
}
