const ZONA = "America/Costa_Rica";

const HORA = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function fechaTexto(day: string, anio: boolean | string = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const mes = match ? MESES[Number(match[2]) - 1] : undefined;
  if (!match || !mes) return day;
  const texto = `${Number(match[3])} de ${mes}`;
  const mostrarAnio = typeof anio === "string" ? match[1] !== anio.slice(0, 4) : anio;
  return mostrarAnio ? `${texto} del ${match[1]}` : texto;
}

export function fechaAbreviada(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const mes = match ? MESES[Number(match[2]) - 1] : undefined;
  return match && mes ? `${Number(match[3])} ${mes.slice(0, 3)}` : day;
}

export function horaCorta(value: string): string {
  const match = /[T ](\d{2}):(\d{2})/.exec(value);
  return match ? `${Number(match[1])}:${match[2]}` : "Sin hora";
}

export function fechaHoraRegistro(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const hora = horaCorta(value);
  return hora === "Sin hora" ? fechaTexto(value) : `${fechaTexto(value)}, ${hora}`;
}

export function fechaHora(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return `${fechaTexto(DIA.format(date))}, ${HORA.format(date)}`;
}

// "3 oct" o "3 oct 2025" si es de otro año. created_at ya viene en hora de Costa Rica, así que basta el día.
export function fechaCorta(day: string, hoy: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const mes = match ? MESES[Number(match[2]) - 1] : undefined;
  if (!match || !mes) return day;
  const texto = `${Number(match[3])} ${mes.slice(0, 3).toLowerCase()}`;
  return match[1] === hoy.slice(0, 4) ? texto : `${texto} ${match[1]}`;
}
