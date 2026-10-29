import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { MemoryLibrary } from "@/components/memory/memory-library";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function MemoriesPage() {
  let verified = false;
  try { verified = !!await verifiedPageUser(); } catch { /* Fail closed on auth/provider/refresh errors. */ }
  if (!verified) redirect("/auth?next=/memories");
  return <Container><header className="section-heading"><p className="eyebrow">Your library</p><h1>Memories</h1>
    <p>Everything you chose to remember, searchable from the evidence actually stored in your account.</p></header><MemoryLibrary /></Container>;
}
