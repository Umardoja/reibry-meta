import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { memoryId } from "@/lib/memory/contracts";
import { MemoryDetail } from "@/components/memory/memory-detail";
import { PageContainer } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function MemoryPage({ params }: { params: Promise<{ id: string }> }) { let verified = false; try { verified = !!await verifiedPageUser(); } catch {} const { id: raw } = await params; if (!verified) redirect(`/auth?next=/memories/${encodeURIComponent(raw)}`); let id = ""; try { id = memoryId(raw); } catch { return <PageContainer><p role="alert">That Memory address is invalid.</p></PageContainer>; } return <PageContainer><MemoryDetail id={id} /></PageContainer>; }
