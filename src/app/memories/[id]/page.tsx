import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { memoryId } from "@/lib/memory/contracts";
import { experimentalVideoUploadEnabled } from "@/lib/video/flags";
import { MemoryDetail } from "@/components/memory/memory-detail";
import { PageContainer } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";
export default async function MemoryPage({ params }: { params: Promise<{ id: string }> }) {
  let verified = false; try { verified = !!await verifiedPageUser(); } catch { /* Fail closed. */ }
  const { id: raw } = await params; if (!verified) redirect(`/auth?next=/memories/${encodeURIComponent(raw)}`);
  let id = ""; try { id = memoryId(raw); } catch { return <PageContainer><div className="empty-state"><h2>That Memory doesn&apos;t exist</h2><p>The address looks incomplete.</p></div></PageContainer>; }
  return <PageContainer><MemoryDetail id={id} videoTools={experimentalVideoUploadEnabled()} /></PageContainer>;
}
