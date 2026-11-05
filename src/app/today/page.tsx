import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { TodayWorkspace } from "@/components/today/today-workspace";
export const dynamic = "force-dynamic";
export default async function TodayPage() { let user = null; try { user = await verifiedPageUser(); } catch { redirect("/auth?next=%2Ftoday"); } if (!user) redirect("/auth?next=%2Ftoday"); return <TodayWorkspace />; }
