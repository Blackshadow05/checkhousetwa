import { CLOUDINARY_API_UPLOAD_URL, CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_UPLOAD_TIMEOUT_MS, CLOUDINARY_CLOUD_NAME } from "@/lib/constants";
export function isPantallaUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && url.pathname.startsWith(`/${CLOUDINARY_CLOUD_NAME}/image/upload/`) && url.pathname.includes("/reporte_pantallas/"); } catch { return false; }
}
export async function uploadPantalla(blob: Blob, casita: string, index: number) {
  if (!CLOUDINARY_UPLOAD_PRESET) throw new Error("No está configurada la carga de fotografías.");
  const data = new FormData();
  data.append("file", blob, `pantalla.${blob.type === "image/webp" ? "webp" : "jpg"}`);
  data.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  data.append("folder", "reporte_pantallas");
  data.append("public_id", `pantalla_${casita}_${index}_${Date.now()}`);
  const response = await fetch(CLOUDINARY_API_UPLOAD_URL, { method: "POST", body: data, signal: AbortSignal.timeout(CLOUDINARY_UPLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error("No se pudo subir una foto. Puedes volver a guardar.");
  const payload = await response.json();
  if (typeof payload.secure_url !== "string" || !isPantallaUrl(payload.secure_url)) throw new Error("No se pudo confirmar la fotografía subida.");
  return payload.secure_url as string;
}
