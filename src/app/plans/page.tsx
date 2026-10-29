import { DeferredRoute } from "@/components/parity/deferred-route";
export const dynamic = "force-dynamic";
export default function PlansPage() { return <DeferredRoute next="/plans" eyebrow="Plans" title="Plans" description="Coming up, undated, and past plans retain their own original product journey." dependency="Plan and Ready Pack persistence has not yet been ported. Confirmed Meta Action Cards remain available separately and are not misrepresented as original Plans." links={[{ href: "/actions", label: "View Action Cards" }, { href: "/ask", label: "Ask REIBRY" }]} />; }
