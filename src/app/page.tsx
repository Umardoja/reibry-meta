import { AskReibry } from "@/components/ai/ask-reibry";
import { PageContainer } from "@/components/ui/primitives";
export default function Home() {
  return <PageContainer className="home-page"><header className="home-intro"><p className="eyebrow">From saved to done</p><h1>What are you trying to do?</h1><p className="page-sub">Tell REIBRY what is on your mind. It will search only your saved Memories before it reasons.</p></header><AskReibry variant="home" /></PageContainer>;
}
