import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { RequireAuth } from "@/components/auth/require-auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  let verified = false;
  try { verified = !!await verifiedPageUser(); } catch { /* No protected content on provider/config/refresh failure. */ }
  if (!verified) redirect("/auth?next=/account");
  return <Container><RequireAuth><Card><h1 className="auth-brand">Account access</h1>
    <p>Your session has been verified. Profile and application data are not part of this stage.</p></Card></RequireAuth>
    <SignOutButton /></Container>;
}
