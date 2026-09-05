"use client";

import { ArrowUp } from "lucide-react";

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="scroll-top-fab"
      onClick={onClick}
      aria-label="Volver arriba"
    >
      <ArrowUp size={19} />
      <span>Arriba</span>
    </button>
  );
}
