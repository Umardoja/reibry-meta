"use client";
// Presentation adapted from REIBRY ui/modal.tsx and globals.css.
// Native dialog replaces the original portal for focus containment and inert background.
// Original contributors retain attribution; source commit 76d3494465bab43a5051498e90b9a486a65312b9.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./primitives";
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);
  return (
    <dialog ref={ref} className="modal-sheet" aria-labelledby={titleId} onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}>
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>Close</Button>
      </div>
      <div className="modal-scroll">{children}</div>
    </dialog>
  );
}
