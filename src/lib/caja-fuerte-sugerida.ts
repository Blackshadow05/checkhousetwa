import { costaRicaDateTime } from "@/lib/revision-form";
import { isUpsellStatus, normalizeText } from "@/lib/revisiones-display";

type Registro = { casita: string; caja_fuerte: string; created_at: string };

export function cajaFuerteSugerida(registros: readonly Registro[], casita: string, ahora = new Date()): string {
  if (!casita) return "";
  const numero = Number(casita);
  const ultimo = registros
    .filter((row) => Number(row.casita) === numero && /^\d{4}-\d{2}-\d{2}/.test(row.created_at))
    .reduce<Registro | null>((latest, row) => !latest || row.created_at > latest.created_at ? row : latest, null);
  if (!ultimo) return "";
  const mismoDia = ultimo.created_at.slice(0, 10) === costaRicaDateTime(ahora).slice(0, 10);
  const estado = normalizeText(ultimo.caja_fuerte);
  if (estado === "check in" || estado === "check inn") return mismoDia ? "Guardar Upsell" : "Check out";
  if (isUpsellStatus(ultimo.caja_fuerte) && mismoDia) return "Guardar Upsell";
  return "";
}
