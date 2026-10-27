import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { MemoryLibrary } from "@/components/memory/memory-library";
import { Container } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function MemoriesPage() {
  let verified = false;
  try { verified = !!await verifiedPageUser(); } catch { /* Fail closed on auth/provider/refresh errors. */ }
  if (!verified) redirect("/auth?next=/memories");
  return <Container><header className="section-heading"><p className="eyebrow">Persistence foundation</p><h1>Your Memories</h1>
    <p>Only records returned by your verified, owner-scoped session appear here.</p></header><MemoryLibrary /></Container>;
}
