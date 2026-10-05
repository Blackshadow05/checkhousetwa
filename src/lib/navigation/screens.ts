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
  if (normalized === "/reportes" || normalized === "/reportes/revision-casitas") return "otros";
  if (normalized === "/horarios") return "otros";
  if (normalized === "/historial-accesos") return "otros";
  if (normalized === "/eliminar-revisiones") return "otros";
  if (normalized === "/escanear-menu") return "otros";
  if (normalized === "/editar-imagen") return "otros";
  if (normalized === "/otros" || normalized === "/reporte-pantallas" || normalized === "/reporte-pantallas/nuevo") return "otros";
  if (normalized === "/admin-usuarios" || normalized === "/admin-usuarios/nuevo" || normalized === "/admin-usuarios/editar") return "otros";

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
  if (first === "reportes" && (slug.length === 1 || slug.length === 2 && slug[1] === "revision-casitas")) return "otros";
  if (first === "horarios" && slug.length === 1) return "otros";
  if (first === "historial-accesos" && slug.length === 1) return "otros";
  if (first === "eliminar-revisiones" && slug.length === 1) return "otros";
  if (first === "escanear-menu" && slug.length === 1) return "otros";
  if (first === "editar-imagen" && slug.length === 1) return "otros";
  if (first === "reporte-pantallas" && (slug.length === 1 || slug.length === 2 && slug[1] === "nuevo")) return "otros";
  if (first === "admin-usuarios" && (slug.length === 1 || slug.length === 2 && (slug[1] === "nuevo" || slug[1] === "editar"))) return "otros";
  if (first && isScreenId(first) && slug.length === 1) {
    return first;
  }

  return "inicio";
}

export function pathFromScreen(screen: ScreenId): string {
  return SCREENS[screen].path;
}
