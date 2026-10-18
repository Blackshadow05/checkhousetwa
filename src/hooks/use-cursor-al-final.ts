"use client";

import { useCallback, useEffect, useMemo, useRef, type FocusEvent, type MouseEvent, type PointerEvent } from "react";

type Campo = HTMLInputElement | HTMLTextAreaElement;

// Tras el foco, el navegador puede recolocar el cursor durante el toque que lo dio (pointerup/click en
// móvil); pasado este margen ya no se mueve aunque el click nunca llegue.
const VENTANA_FOCO_MS = 800;

// Al enfocar un campo que ya tiene texto deja el cursor al final, solo durante el foco. En móvil el
// navegador coloca el cursor donde se tocó después de focus (iOS al final del toque), así que también se
// aplica en pointerup y en el click de ese primer toque, siempre diferido un frame. Nada lo vuelve a mover
// después: ni los cambios de valor ni los toques posteriores, así se puede editar en medio del texto. Escribir,
// usar el teclado o seleccionar texto cancela el ajuste pendiente.
export function useCursorAlFinal<T extends Campo = HTMLInputElement>() {
  // Momento del foco; null cuando ya no corresponde mover el cursor.
  const enfocadoEn = useRef<number | null>(null);
  // El foco llegó por un toque o clic: el último ajuste se hace en el click de ese toque.
  const porToque = useRef(false);
  const frame = useRef<number | null>(null);

  const cancelar = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const terminar = useCallback(() => {
    enfocadoEn.current = null;
    porToque.current = false;
    cancelar();
  }, [cancelar]);

  const armado = useCallback(() => enfocadoEn.current !== null && Date.now() - enfocadoEn.current <= VENTANA_FOCO_MS, []);

  const programar = useCallback((campo: T, final: boolean) => {
    cancelar();
    if (!armado()) {
      enfocadoEn.current = null;
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!armado() || document.activeElement !== campo) return;
      const seleccionado = campo.selectionStart !== campo.selectionEnd;
      if (final || seleccionado) enfocadoEn.current = null;
      const largo = campo.value.length;
      if (!largo || seleccionado) return;
      try {
        campo.setSelectionRange(largo, largo);
      } catch {
        // Algunos tipos de input no admiten selección.
      }
    });
  }, [armado, cancelar]);

  useEffect(() => cancelar, [cancelar]);

  return useMemo(() => ({
    onPointerDown(event: PointerEvent<T>) {
      if (document.activeElement !== event.currentTarget) {
        porToque.current = true;
        return;
      }
      // Toque con el campo ya enfocado: el usuario está moviendo el cursor.
      terminar();
    },
    onFocus(event: FocusEvent<T>) {
      enfocadoEn.current = Date.now();
      programar(event.currentTarget, !porToque.current);
    },
    onPointerUp(event: PointerEvent<T>) {
      if (enfocadoEn.current !== null) programar(event.currentTarget, false);
    },
    onClick(event: MouseEvent<T>) {
      const pendiente = enfocadoEn.current !== null;
      porToque.current = false;
      if (pendiente) programar(event.currentTarget, true);
    },
    // Cualquier edición o tecla (flechas, Inicio…) es del usuario: no se toca más el cursor.
    onKeyDown: terminar,
    onBeforeInput: terminar,
    onCompositionStart: terminar,
    onBlur: terminar,
  }), [programar, terminar]);
}
