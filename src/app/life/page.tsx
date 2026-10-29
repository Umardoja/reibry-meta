import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { LifeWorkspace } from "@/components/life/life-workspace";
export const dynamic = "force-dynamic";
export default async function LifePage(){let verified=false;try{verified=!!await verifiedPageUser();}catch{}if(!verified)redirect("/auth?next=/life");return <LifeWorkspace/>;}
