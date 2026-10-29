import { DeferredRoute } from "@/components/parity/deferred-route";
export const dynamic = "force-dynamic";
export default function LifePage() { return <DeferredRoute next="/life" eyebrow="Life chronology" title="What’s happening in your world?" description="Events, deadlines, goals, and meaningful dates form the original Life timeline." dependency="The owner-scoped Life repository and parsing API are not present yet. Adding events is disabled rather than storing them somewhere unsafe." links={[{ href: "/life/manage", label: "Manage Life" }]} />; }
