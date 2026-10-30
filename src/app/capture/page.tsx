import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { CaptureForm, type SharedPayload } from "@/components/capture/capture-form";
import { ShareHandoff } from "@/components/capture/share-handoff";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";

/** Share-sheet / iPhone Shortcut handoff: ?url=, ?text= and ?title= only prefill the form. Nothing is saved without the user's tap. */
function sharedPayload(params: Record<string, string | string[] | undefined>): SharedPayload | null {
  const one = (name: string) => { const value = params[name]; return typeof value === "string" ? value.trim() : ""; };
  const text = one("text").slice(0, 5_000); const direct = one("url");
  const url = (/^https:\/\/\S+$/i.test(direct) ? direct : text.match(/https:\/\/[^\s<>"']+/i)?.[0] ?? "").slice(0, 2_048);
  if (!url) return null;
  return { url, title: one("title").slice(0, 200), note: text.replace(url, "").replace(/\s+/g, " ").trim().slice(0, 5_000) };
}

export default async function CapturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const shared = sharedPayload(await searchParams);
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) { if (shared) return <Container><ShareHandoff shared={shared} /></Container>; redirect("/auth?next=/capture"); }
  return <Container><header className="section-heading"><p className="eyebrow">Capture</p><h1>Save a thought, link, or plan.</h1>
    <p>Share or paste a link and get back to what you were doing. REIBRY saves it first, then adds whatever details the platform shares.</p></header><CaptureForm shared={shared} /></Container>;
}
