import { DeferredRoute } from "@/components/parity/deferred-route";
export const dynamic = "force-dynamic";
export default function OnboardingPage() { return <DeferredRoute next="/onboarding" eyebrow="Welcome to REIBRY" title="Set up your world" description="The original onboarding introduces Capture, Memories, Life, and planning in a guided sequence." dependency="Profile and Life setup persistence is intentionally unavailable until its secure Stage 11 backend is restored. This screen will not pretend setup was completed." />; }
