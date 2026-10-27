"use client";
import { useState } from "react";
import { Button, Card, Skeleton, TextField } from "./primitives";
import { Modal } from "./modal";
export function FoundationPreview() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">About this foundation</Button>
      <section id="ui-foundation" className="ui-foundation" aria-labelledby="ui-heading">
        <p className="section-label">Shared UI</p>
        <h2 id="ui-heading">Familiar by design.</h2>
        <p className="page-sub">REIBRY’s colors, surfaces and controls. These examples preview the interface only.</p>
        <div className="preview-grid">
          <Card>
            <h3>Form controls</h3>
            <TextField id="preview-label" label="Example text field" placeholder="Try a little text" hint="UI preview only. Nothing is saved or sent." autoComplete="off" />
            <Button variant="ghost" disabled>Unavailable example</Button>
          </Card>
          <Card>
            <h3>Loading appearance</h3>
            <p className="page-sub">A visual sample, not a pending request.</p>
            <div className="skeleton-preview"><Skeleton /><Skeleton /></div>
          </Card>
        </div>
      </section>
      <Modal open={open} onClose={() => setOpen(false)} title="About this foundation">
        <p>This Meta Edition brings REIBRY’s familiar visual system into an independent application.</p>
        <p>Shared cards, buttons, fields and dialogs are ready for future development. The example field is local UI state only; nothing is persisted.</p>
        <p>Authentication screens and server session checks are available. Live cloud authentication is not yet verified. Memories, Capture, Plans, Ready Packs and AI integrations are not implemented here.</p>
        <p>This is a design foundation, not a demonstration of future AI functionality.</p>
        <Button onClick={() => setOpen(false)}>Back to the foundation</Button>
      </Modal>
    </>
  );
}
