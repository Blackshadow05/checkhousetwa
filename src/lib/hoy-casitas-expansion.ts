import type { HoyBoardChip, HoyBoardGroup } from "@/lib/revisiones-display";

export const HOY_GRUPO_CHIP_LIMITE = 12;

export function conteoEncabezadoGrupo(group: Pick<HoyBoardGroup, "rows">): number {
  return group.rows.length;
}

export function grupoMuestraExpansion(filasDirectas: number): boolean {
  return filasDirectas > HOY_GRUPO_CHIP_LIMITE;
}

export function chipsVisiblesGrupo<T>(filas: readonly T[], expandido: boolean): readonly T[] {
  if (expandido || filas.length <= HOY_GRUPO_CHIP_LIMITE) return filas;
  return filas.slice(0, HOY_GRUPO_CHIP_LIMITE);
}

export function etiquetaExpansionGrupo(expandido: boolean): "Ver todas" | "Ver menos" {
  return expandido ? "Ver menos" : "Ver todas";
}

export type VistaExpansionGrupo = {
  id: string;
  encabezado: number;
  muestraControl: boolean;
  etiquetaControl: "Ver todas" | "Ver menos" | null;
  filasVisibles: readonly HoyBoardChip[];
};

export function vistaExpansionGrupo(group: HoyBoardGroup, expandido: boolean): VistaExpansionGrupo {
  const muestraControl = grupoMuestraExpansion(group.rows.length);
  const expandidoEfectivo = muestraControl && expandido;
  return {
    id: group.id,
    encabezado: conteoEncabezadoGrupo(group),
    muestraControl,
    etiquetaControl: muestraControl ? etiquetaExpansionGrupo(expandidoEfectivo) : null,
    filasVisibles: chipsVisiblesGrupo(group.rows, expandidoEfectivo),
  };
}

export function alternarExpansionGrupo(
  expandidoPorId: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(expandidoPorId);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function recorrerGruposHoy(
  groups: readonly HoyBoardGroup[],
  visit: (group: HoyBoardGroup) => void,
) {
  for (const group of groups) {
    visit(group);
    if (group.sections) recorrerGruposHoy(group.sections, visit);
  }
}

export function vistasTableroHoy(
  groups: readonly HoyBoardGroup[],
  expandidoPorId: ReadonlySet<string>,
): VistaExpansionGrupo[] {
  const vistas: VistaExpansionGrupo[] = [];
  recorrerGruposHoy(groups, (group) => {
    vistas.push(vistaExpansionGrupo(group, expandidoPorId.has(group.id)));
  });
  return vistas;
}

export function casitasAlcanzablesHoy(
  groups: readonly HoyBoardGroup[],
  expandidoPorId: ReadonlySet<string>,
): string[] {
  return vistasTableroHoy(groups, expandidoPorId).flatMap((vista) =>
    vista.filasVisibles.map((chip) => chip.casita),
  );
}
