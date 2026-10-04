const COSTA_RICA_OFFSET_MS = -6 * 60 * 60 * 1000;
const DARK_FROM_HOUR = 18;
const DARK_UNTIL_HOUR = 6;
const THEME_COLORS = { light: "#f6f7f4", dark: "#131b18" } as const;

export type ScheduledTheme = keyof typeof THEME_COLORS;

export function scheduledTheme(now = Date.now()): ScheduledTheme {
  const hour = new Date(now + COSTA_RICA_OFFSET_MS).getUTCHours();
  return hour >= DARK_FROM_HOUR || hour < DARK_UNTIL_HOUR ? "dark" : "light";
}

export function msUntilThemeChange(now = Date.now()) {
  const local = new Date(now + COSTA_RICA_OFFSET_MS);
  const next = new Date(local);
  next.setUTCMinutes(0, 0, 0);
  const hour = local.getUTCHours();
  if (hour < DARK_UNTIL_HOUR) next.setUTCHours(DARK_UNTIL_HOUR);
  else if (hour < DARK_FROM_HOUR) next.setUTCHours(DARK_FROM_HOUR);
  else next.setUTCHours(24 + DARK_UNTIL_HOUR);
  return next.getTime() - local.getTime();
}

export function applyTheme(theme: ScheduledTheme) {
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  let meta = document.getElementById("theme-color-meta");
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = "theme-color-meta";
    meta.setAttribute("name", "theme-color");
    document.head.append(meta);
  }
  meta.setAttribute("content", THEME_COLORS[theme]);
}

export const THEME_BOOT_SCRIPT = `(function(){var h=new Date(Date.now()+${COSTA_RICA_OFFSET_MS}).getUTCHours(),t=h>=${DARK_FROM_HOUR}||h<${DARK_UNTIL_HOUR}?"dark":"light",c=${JSON.stringify(THEME_COLORS)};document.documentElement.dataset.theme=t;var m=document.createElement("meta");m.id="theme-color-meta";m.name="theme-color";m.content=c[t];document.head.appendChild(m)})()`;
