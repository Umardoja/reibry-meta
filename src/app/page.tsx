export default function Home() {
  return (
    <div className="foundation">
      <header className="brand" aria-label="REIBRY">
        <span className="brand-mark" aria-hidden="true">r.</span>
        <span>REIBRY</span>
      </header>

      <main>
        <p className="edition">Meta Edition — Application Foundation</p>
        <h1>From Saved<br />to Done<span className="period">.</span></h1>
        <p className="description">A personal AI memory and action platform.</p>
        <div className="foundation-note">
          <span className="status-dot" aria-hidden="true" />
          <p>A new chapter for REIBRY.<br />The foundation is here. More to come.</p>
        </div>
      </main>

      <footer>
        <span>REIBRY Meta Edition</span>
        <span>Built on the original REIBRY foundation.</span>
      </footer>
    </div>
  );
}
