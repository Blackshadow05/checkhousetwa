export const PHOTO_MAX_SIDE = 1200;

export const ANDROID_PHOTO_MAX_SIDE = 1600;

export function revisionPhotoEncoding(userAgent: string) {
  return /Android/i.test(userAgent)
    ? { type: "image/webp" as const, quality: 0.7, maxSide: ANDROID_PHOTO_MAX_SIDE }
    : { type: "image/jpeg" as const, quality: 0.75, maxSide: PHOTO_MAX_SIDE };
}

export function revisionPhotoDimensions(width: number, height: number, maxSide = PHOTO_MAX_SIDE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error("La foto no tiene dimensiones válidas.");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function revisionPhotoExtension(type: string) {
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  throw new Error("No pudimos reconocer el formato de la foto. Vuelve a seleccionarla.");
}

export function isRevisionPhotoFilename(filename: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|webp)$/i.test(filename);
}
