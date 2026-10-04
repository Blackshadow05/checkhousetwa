"use client";

import { useEffect } from "react";
import { THEME_BOOT_SCRIPT, applyTheme, msUntilThemeChange, scheduledTheme } from "@/lib/theme-schedule";

export function ThemeSchedule() {
  useEffect(() => {
    let timer = 0;
    const sync = () => {
      window.clearTimeout(timer);
      applyTheme(scheduledTheme());
      timer = window.setTimeout(sync, msUntilThemeChange() + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    sync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", sync);
    };
  }, []);
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
    />
  );
}
