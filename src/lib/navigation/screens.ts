export const SCREENS = {
  otros: { id: "otros", path: "/otros", title: "Otros" },
  inicio: {
    id: "inicio",
    path: "/",
    title: "Inicio",
  },
  revisiones: {
    id: "revisiones",
    path: "/revisiones",
    title: "Revisiones",
  },
  sync: {
    id: "sync",
    path: "/sync",
    title: "Sincronizar",
  },
} as const;

export type ScreenId = keyof typeof SCREENS;

export const SCREEN_ORDER: ScreenId[] = ["inicio", "revisiones", "otros", "sync"];

export function isScreenId(value: string): value is ScreenId {
  return value in SCREENS;
}

export function screenFromPath(pathname: string): ScreenId {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/otros" || normalized === "/reporte-pantallas" || normalized === "/reporte-pantallas/nuevo") return "otros";

  if (normalized === "/revisiones") {
    return "revisiones";
  }

  if (normalized === "/sync") {
    return "sync";
  }

  return "inicio";
}

export function screenFromSlug(slug: string[] | undefined): ScreenId {
  if (!slug || slug.length === 0) {
    return "inicio";
  }

  const [first] = slug;
  if (first === "reporte-pantallas" && (slug.length === 1 || slug.length === 2 && slug[1] === "nuevo")) return "otros";
  if (first && isScreenId(first) && slug.length === 1) {
    return first;
  }

  return "inicio";
}

export function pathFromScreen(screen: ScreenId): string {
  return SCREENS[screen].path;
}
