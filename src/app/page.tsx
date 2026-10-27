import { Container, Card } from "@/components/ui/primitives";
import { FoundationPreview } from "@/components/ui/foundation-preview";
export default function Home() {
  return (
    <Container>
      <section className="intro" aria-labelledby="tagline">
        <p className="section-label">REIBRY</p>
        <h1 id="tagline">From Saved<br />to Done.</h1>
        <p className="intro-description">A personal AI memory and action platform.</p>
        <Card className="foundation-status">
          <span className="status-dot" aria-hidden="true" />
          <div><h2>Meta Edition — Application Foundation</h2><p>The familiar REIBRY experience, built forward one stage at a time.</p></div>
        </Card>
      </section>
      <FoundationPreview />
    </Container>
  );
}
