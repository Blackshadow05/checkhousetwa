"use client";

import { ArrowUp, Plus } from "lucide-react";

export function NewRevisionFab({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="new-revision-fab" onClick={onClick} aria-label="Crear nueva revisión">
      <Plus size={24} strokeWidth={2} aria-hidden="true" />
    </button>
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
