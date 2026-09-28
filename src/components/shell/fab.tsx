"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ClipboardPen, Plus, ScanSearch } from "lucide-react";
import type { RevisionMode } from "@/lib/revision-form";

export function NewRevisionFab({ onSelect }: { onSelect: (mode: RevisionMode) => void }) {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      fabRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const choose = (mode: RevisionMode) => {
    setOpen(false);
    onSelect(mode);
  };

  return (
    <>
      {open && <div className="new-revision-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      <div ref={menuRef} id="new-revision-options" className="new-revision-options" role="menu" aria-label="Cómo crear la revisión" hidden={!open}>
        <button type="button" role="menuitem" onClick={() => choose("manual")}>
          <span>Ingreso manual</span>
          <span className="new-revision-option-icon" aria-hidden="true"><ClipboardPen size={20} /></span>
        </button>
        <button type="button" role="menuitem" onClick={() => choose("reconocimiento")}>
          <span>Por reconocimiento</span>
          <span className="new-revision-option-icon" aria-hidden="true"><ScanSearch size={20} /></span>
        </button>
      </div>
      <button
        ref={fabRef}
        type="button"
        className="new-revision-fab"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Cerrar opciones de revisión" : "Crear nueva revisión"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="new-revision-options"
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>
    </>
  );
}

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="scroll-top-fab"
      onClick={onClick}
      aria-label="Volver arriba"
    >
      <ArrowUp size={19} aria-hidden="true" />
      <span>Arriba</span>
    </button>
  );
}
