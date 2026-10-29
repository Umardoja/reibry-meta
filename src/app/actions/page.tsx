import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { ActionLibrary } from "@/components/actions/action-library";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function ActionsPage() {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) redirect("/auth?next=/actions");
  return <Container><header className="section-heading"><p className="eyebrow">User-confirmed planning</p><h1>Action Cards</h1>
    <p>These are persistent internal planning artifacts you explicitly saved. They are not executed tasks or external actions.</p></header><ActionLibrary /></Container>;
}
