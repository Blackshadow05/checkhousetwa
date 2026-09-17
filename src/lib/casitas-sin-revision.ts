import { CASITAS } from "@/lib/pantallas";
import { shiftDay } from "@/lib/revisiones-archive";
import { casitaNumber } from "@/lib/revisiones-display";
import type { RevisionCasita } from "@/types/database";

export type RevisionActivity = Pick<RevisionCasita, "id" | "casita" | "created_at">;

function activityDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)?)?$/.test(value)) {
    return null;
  }
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
    ? day
    : null;
}

export function isRevisionActivityInWindow(
  row: RevisionActivity,
  today: string,
  days = 7,
) {
  const day = activityDay(row.created_at);
  return day !== null && day >= shiftDay(today, -days) && day <= today;
}

export function casitasSinRevision(
  rows: RevisionActivity[] | null,
  today: string,
  days = 7,
): string[] | null {
  if (rows === null || activityDay(today) !== today) return null;
  const reviewed = new Set(
    rows.filter((row) => isRevisionActivityInWindow(row, today, days))
      .map((row) => Number(casitaNumber(row.casita))),
  );
  return CASITAS.filter((casita) => !reviewed.has(Number(casita)));
}

export function applyRevisionActivityChange(
  rows: RevisionActivity[] | null,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  nextRecord: Partial<RevisionActivity> | null,
  previousRecord: Partial<RevisionActivity> | null,
  today: string,
  days = 7,
): RevisionActivity[] | null {
  if (rows === null) return null;
  const next = rows.filter((row) =>
    row.id !== nextRecord?.id && row.id !== previousRecord?.id &&
    isRevisionActivityInWindow(row, today, days),
  );
  if (eventType !== "DELETE" && nextRecord?.id &&
    typeof nextRecord.casita === "string" &&
    (typeof nextRecord.created_at === "string" || nextRecord.created_at === null)) {
    const row = {
      id: nextRecord.id,
      casita: nextRecord.casita,
      created_at: nextRecord.created_at,
    };
    if (isRevisionActivityInWindow(row, today, days)) next.push(row);
  }
  return next;
}
