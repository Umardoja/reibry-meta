import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { ActionLibrary } from "@/components/actions/action-library";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function ActionsPage() {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) redirect("/auth?next=/actions");
  return <Container><header className="section-heading"><p className="eyebrow">Your next steps</p><h1>Action Cards</h1>
    <p>Next steps you chose to keep. REIBRY never carries them out for you — you stay in charge.</p></header><ActionLibrary /></Container>;
}
