export const EVIDENCE_FIELDS = ["evidencia_01", "evidencia_02", "evidencia_03"] as const;
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number];

export const EVIDENCE_EDIT_LABELS: Record<EvidenceField, string> = {
  evidencia_01: "Evidencia 1",
  evidencia_02: "Evidencia 2",
  evidencia_03: "Evidencia 3",
};

export const EVIDENCE_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

const EVIDENCE_PATH =
  /^Evidencias\/(?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}\/evidencia_0[123]_\d{10,16}$/;

export function getMonthFolder(now = new Date()) {
  return `${EVIDENCE_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

let lastEvidenceStamp = 0;

export function nextEvidenceStamp(nowMs = Date.now()): number {
  const randomOffset =
    typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
      ? crypto.getRandomValues(new Uint16Array(1))[0] % 1000
      : Math.floor(Math.random() * 1000);
  const candidate = nowMs * 1000 + randomOffset;
  const next = candidate > lastEvidenceStamp ? candidate : lastEvidenceStamp + 1;
  lastEvidenceStamp = next;
  return next;
}

export function evidenceStoragePath(field: EvidenceField, timestamp = nextEvidenceStamp(), now = new Date()) {
  const folderPath = `Evidencias/${getMonthFolder(now)}`;
  const publicId = `evidencia_${field.slice(-2)}_${timestamp}`;
  return { folderPath, publicId, path: `${folderPath}/${publicId}` };
}

export function isEvidenceCloudinaryPath(path: string) {
  return EVIDENCE_PATH.test(path);
}

const FILE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Costa_Rica",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function evidenceDateMark(date = new Date()) {
  const parts = Object.fromEntries(FILE_DATE.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

export function evidencePathMark(path: string) {
  const segment = (path.split("?")[0] ?? "").split("/").filter(Boolean).pop() ?? "";
  const base = segment.replace(/\.[a-z0-9]+$/i, "");
  const digits = /_(\d{10}|\d{13}|\d{16})$/.exec(base)?.[1];
  if (digits) {
    const value = Number(digits);
    const millis = digits.length === 10 ? value * 1000 : digits.length === 16 ? Math.floor(value / 1000) : value;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return evidenceDateMark(date);
  }
  return base.replace(/[^a-z0-9_-]/gi, "").slice(-12);
}

export function evidenceFileName(casita: string, index: number, extension: string, mark: string) {
  const name = casita.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return [`casita-${name || "sin-numero"}`, mark, `evidencia-${index + 1}`].filter(Boolean).join("-") + `.${extension}`;
}
