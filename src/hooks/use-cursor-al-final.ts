"use client";

import { useCallback, useEffect, useMemo, useRef, type FocusEvent, type MouseEvent, type PointerEvent } from "react";

type Campo = HTMLInputElement | HTMLTextAreaElement;

// Al enfocar un campo que ya tiene texto deja el cursor al final, solo en el primer foco. En móvil el
// navegador coloca el cursor donde se tocó después de focus (iOS al final del toque), así que también se
// aplica en pointerup y en el click de ese primer toque, siempre diferido un frame. Los toques posteriores
// con el campo ya enfocado no lo mueven, y si hay texto seleccionado (arrastrando) se respeta.
export function useCursorAlFinal<T extends Campo = HTMLInputElement>() {
  const recienEnfocado = useRef(false);
  // El foco llegó por un toque o clic: el último ajuste se hace en el click de ese toque.
  const porToque = useRef(false);
  const frame = useRef<number | null>(null);

  const cancelar = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const programar = useCallback((campo: T, final: boolean) => {
    cancelar();
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!recienEnfocado.current || document.activeElement !== campo) return;
      const seleccionado = campo.selectionStart !== campo.selectionEnd;
      if (final || seleccionado) recienEnfocado.current = false;
      const largo = campo.value.length;
      if (!largo || seleccionado) return;
      try {
        campo.setSelectionRange(largo, largo);
      } catch {
        // Algunos tipos de input no admiten selección.
      }
    });
  }, [cancelar]);

  useEffect(() => cancelar, [cancelar]);

  return useMemo(() => ({
    onPointerDown(event: PointerEvent<T>) {
      if (document.activeElement !== event.currentTarget) {
        porToque.current = true;
        return;
      }
      // Toque con el campo ya enfocado: el usuario está moviendo el cursor.
      recienEnfocado.current = false;
      porToque.current = false;
      cancelar();
    },
    onFocus(event: FocusEvent<T>) {
      recienEnfocado.current = true;
      programar(event.currentTarget, !porToque.current);
    },
    onPointerUp(event: PointerEvent<T>) {
      if (recienEnfocado.current) programar(event.currentTarget, false);
    },
    onClick(event: MouseEvent<T>) {
      porToque.current = false;
      if (recienEnfocado.current) programar(event.currentTarget, true);
    },
    onBlur() {
      recienEnfocado.current = false;
      porToque.current = false;
      cancelar();
    },
  }), [cancelar, programar]);
}
