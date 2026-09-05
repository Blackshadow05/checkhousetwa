"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="bottom-sheet"
      aria-label={title}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientY < bounds.top ||
          event.clientX < bounds.left ||
          event.clientX > bounds.right
        )
          onClose();
      }}
    >
      <div className="sheet-handle" aria-hidden="true" />
      <div className="sheet-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar panel"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
