"use client";

import { useState } from "react";

export type SlideDirection = "initial" | "none" | "forward" | "back";

export function useSlideDirection(index: number): SlideDirection {
  const [state, setState] = useState<{ index: number; direction: SlideDirection }>({
    index,
    direction: "initial",
  });
  if (state.index !== index) {
    const direction: SlideDirection =
      state.index < 0 || index < 0 ? "none" : index > state.index ? "forward" : "back";
    setState({ index, direction });
    return direction;
  }
  return state.direction;
}
