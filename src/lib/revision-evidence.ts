export const EVIDENCE_FIELDS = ["evidencia_01", "evidencia_02", "evidencia_03"] as const;
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number];

export const EVIDENCE_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

const EVIDENCE_PATH =
  /^Evidencias\/(?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}\/evidencia_0[123]_\d{10,16}$/;

export function getMonthFolder(now = new Date()) {
  return `${EVIDENCE_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

export function evidenceStoragePath(field: EvidenceField, timestamp = Date.now(), now = new Date()) {
  const folderPath = `Evidencias/${getMonthFolder(now)}`;
  const publicId = `evidencia_${field.slice(-2)}_${timestamp}`;
  return { folderPath, publicId, path: `${folderPath}/${publicId}` };
}

export function isEvidenceCloudinaryPath(path: string) {
  return EVIDENCE_PATH.test(path);
}
