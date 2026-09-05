"use client";

import { useCallback, useEffect, useState } from "react";
import {
  pathFromScreen,
  screenFromPath,
  type ScreenId,
} from "@/lib/navigation/screens";

export function useAppNavigation(initialScreen: ScreenId) {
  const [screen, setScreen] = useState<ScreenId>(initialScreen);

  useEffect(() => {
    const onPopState = () => {
      setScreen(screenFromPath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: ScreenId) => {
    const path = pathFromScreen(next);

    if (window.location.pathname !== path) {
      window.history.pushState({ screen: next }, "", path);
    }

    setScreen(next);
  }, []);

  return { screen, navigate };
}
