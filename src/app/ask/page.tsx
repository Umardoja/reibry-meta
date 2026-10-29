import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { AskReibry } from "@/components/ai/ask-reibry";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function AskPage() {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  if (!verified) redirect("/auth?next=/ask");
  return <Container><header className="section-heading"><p className="eyebrow">Meta Muse Spark</p><h1>Ask REIBRY</h1>
    <p>Ask about evidence already saved in your Memories. Answers cite exact Memories; suggested next steps never execute automatically.</p></header><AskReibry /></Container>;
}
