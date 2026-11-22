"use client";

import { useDismissKeyboard } from "@/hooks/use-dismiss-keyboard";
import { useKeyboardViewport } from "@/hooks/use-keyboard-viewport";

export function HideKeyboardOnTapOutside() {
  useDismissKeyboard(true);
  useKeyboardViewport();
  return null;
}
