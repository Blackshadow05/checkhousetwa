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
    // The offline fallback serves one shell for every URL.
    queueMicrotask(onPopState);

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: ScreenId) => {
    const path = pathFromScreen(next);

    if (window.location.pathname !== path || window.location.search || window.location.hash) {
      window.history.pushState({ screen: next }, "", path);
    }

    setScreen(next);
    window.dispatchEvent(new Event("casitas:navigate"));
  }, []);

  return { screen, navigate };
}
