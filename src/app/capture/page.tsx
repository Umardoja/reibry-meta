import type { Metadata } from "next";
import { verifiedPageUser } from "@/lib/auth/server";
import { parseSharedPayload } from "@/lib/capture/share";
import { experimentalVideoUploadEnabled } from "@/lib/video/flags";
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
  return <Container><div className="capture-page">
    <header className="page-hero"><p className="eyebrow">Capture</p><h1>Save it before you forget it.</h1>
      <p>A video, a recipe, a place, an idea. Paste the link or jot it down — REIBRY keeps it, so you can get back to what you were doing.</p></header>
    <CaptureForm shared={shared} />
    <section className="capture-tips" aria-labelledby="capture-tips-heading"><h2 id="capture-tips-heading">Saving from other apps</h2>
      <ol><li>In TikTok, YouTube or Instagram, tap <strong>Share → Copy link</strong>, come back here and tap <strong>Paste</strong>.</li>
        <li>On iPhone, add the <strong>Save to REIBRY</strong> Shortcut once, then choose it from the Share menu.</li>
        <li>REIBRY saves the link first, then adds any title, creator and cover the platform shares. It never watches the video for you unless you say so.</li></ol></section>
    {/* Experimental: manual video upload is off for the consumer product (owner decision, Stage 12J-3). */}
    {experimentalVideoUploadEnabled() && <VideoCapture />}
  </div></Container>;
}
