import { PlanDetail } from "@/components/plans/plan-detail";
export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) { return <PlanDetail id={(await params).id}/>; }
