import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { CaptureForm } from "@/components/capture/capture-form";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function CapturePage() {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) redirect("/auth?next=/capture");
  return <Container><header className="section-heading"><p className="eyebrow">Source-preserving capture</p><h1>Capture</h1>
    <p>Save a note or public HTTPS link as an owned Memory. Optional metadata can fail without losing the source.</p></header><CaptureForm /></Container>;
}
