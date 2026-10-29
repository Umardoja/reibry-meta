import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { CaptureForm } from "@/components/capture/capture-form";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function CapturePage() {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) redirect("/auth?next=/capture");
  return <Container><header className="section-heading"><p className="eyebrow">Capture</p><h1>Save a thought, link, or plan.</h1>
    <p>REIBRY preserves what you share. Optional link details can fail without losing the original source.</p></header><CaptureForm /></Container>;
}
