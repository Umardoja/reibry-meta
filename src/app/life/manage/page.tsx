import { redirect } from "next/navigation";
import { verifiedPageUser } from "@/lib/auth/server";
import { LifeManager } from "@/components/life/life-manager";
export const dynamic = "force-dynamic";
export default async function LifeManagePage(){let verified=false;try{verified=!!await verifiedPageUser();}catch{}if(!verified)redirect("/auth?next=/life/manage");return <LifeManager/>;}
