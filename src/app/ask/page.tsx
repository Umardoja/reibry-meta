import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { AskReibry } from "@/components/ai/ask-reibry";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function AskPage() {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) redirect("/auth?next=/ask");
  return <Container><header className="section-heading"><p className="eyebrow">Search your memory</p><h1>Ask REIBRY</h1>
    <p>Describe it however you remember it. Answers cite exact saved Memories, and suggested steps remain suggestions until you approve them.</p></header><AskReibry /></Container>;
}
