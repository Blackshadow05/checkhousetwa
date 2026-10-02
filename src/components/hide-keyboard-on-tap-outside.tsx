"use client";

import { useDismissKeyboard } from "@/hooks/use-dismiss-keyboard";

export function HideKeyboardOnTapOutside() {
  useDismissKeyboard(true);
  return null;
}
