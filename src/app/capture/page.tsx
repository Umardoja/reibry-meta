import type { Metadata } from "next";
import { verifiedPageUser } from "@/lib/auth/server";
import { parseSharedPayload } from "@/lib/capture/share";
import { CaptureForm } from "@/components/capture/capture-form";
import { ShareHandoff } from "@/components/capture/share-handoff";
import { VideoCapture } from "@/components/video/video-capture";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
// A shared link can be private: never send this page's address (which may carry ?url=) to any other site.
export const metadata: Metadata = { referrer: "no-referrer" };

/** Share-sheet / iPhone Shortcut handoff: ?url=, ?text= and ?title= (or the same in the #fragment) only prefill the form. Nothing is saved without the user's tap. */
export default async function CapturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const shared = parseSharedPayload(name => { const value = params[name]; return typeof value === "string" ? value : null; });
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  // Signed out: keep any shared link (query or fragment) in this tab only, then sign in and come back to a prefilled form.
  if (!verified) return <Container><ShareHandoff shared={shared} /></Container>;
  return <Container><header className="section-heading"><p className="eyebrow">Capture</p><h1>Save a thought, link, or plan.</h1>
    <p>Share or paste a link and get back to what you were doing. REIBRY saves it first, then adds whatever details the platform shares.</p></header><CaptureForm shared={shared} /><VideoCapture /></Container>;
}
