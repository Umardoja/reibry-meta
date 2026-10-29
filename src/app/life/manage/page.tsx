import { DeferredRoute } from "@/components/parity/deferred-route";
export const dynamic = "force-dynamic";
export default function LifeManagePage() { return <DeferredRoute next="/life/manage" eyebrow="Life management" title="Manage your timeline" description="The original screen separates upcoming, undated, and past Life items." dependency="Editing and deletion require the missing Life persistence contract and RLS policies. Those controls remain unavailable until Stage 11." links={[{ href: "/life", label: "Back to Life" }]} />; }
