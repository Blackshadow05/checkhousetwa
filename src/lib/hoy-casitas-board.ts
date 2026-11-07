import {
  casitasConLlegada,
  casitasConLlegadaHoy,
  casitasConLlegadaManana,
  casitasConSalidaHoy,
  casitasInHouseGuestsDelDia,
  estadiasEnCasa,
  type OperacionMemo,
} from "@/lib/operaciones-memo";
import { groupHoyCasitas, type HoyBoardGroup } from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";

// Misma entrada que Inicio: el tablero no recibe sets a mano, sale del memo.
export function groupHoyCasitasConMemo(
  rows: InicioRevisionRow[],
  today: string,
  upsells: InicioRevisionRow[] = [],
  memoRows: readonly OperacionMemo[] | null = null,
): HoyBoardGroup[] {
  if (!memoRows) return groupHoyCasitas(rows, today, upsells);
  return groupHoyCasitas(
    rows,
    today,
    upsells,
    casitasConLlegada(memoRows, today),
    estadiasEnCasa(memoRows, today),
    casitasInHouseGuestsDelDia(memoRows, today),
    casitasConLlegadaHoy(memoRows, today),
    casitasConSalidaHoy(memoRows, today),
    casitasConLlegadaManana(memoRows, today),
  );
}
