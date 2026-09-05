"use client";

import { createContext, useContext } from "react";
import type { ScreenId } from "@/lib/navigation/screens";

export type AppNavigationValue = {
  screen: ScreenId;
  navigate: (screen: ScreenId) => void;
};

const AppNavigationContext = createContext<AppNavigationValue | null>(null);

export const AppNavigationProvider = AppNavigationContext.Provider;

export function useAppNavigationContext(): AppNavigationValue {
  const value = useContext(AppNavigationContext);

  if (!value) {
    throw new Error("useAppNavigationContext debe usarse dentro de AppShell");
  }

  return value;
}
