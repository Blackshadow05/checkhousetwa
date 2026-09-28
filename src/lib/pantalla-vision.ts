import type { PuntoPantalla } from "./pantalla-detection";

export type PuntoVerificado = PuntoPantalla & { confidence: "seguro" | "dudoso"; aiVerdict?: "defecto" | "reflejo" };
export type PantallaVisionResult = {
  points: PuntoVerificado[];
  /** Human-readable defect count after Luna discards reflections. */
  defectCount: number;
};

/** Draws numbered markers at the exact candidate centers so Luna can match
 * each verdict to a spot without estimating coordinates herself. */
async function drawMarkers(blob: Blob, points: PuntoPantalla[], signal?: AbortSignal): Promise<string> {
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    signal?.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pudimos preparar la foto para la revisión con IA.");
    context.drawImage(image, 0, 0);
    const unit = Math.max(canvas.width, canvas.height);
    context.font = `700 ${Math.round(unit * 0.028)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    points.forEach((point, index) => {
      const cx = point.x * canvas.width;
      const cy = point.y * canvas.height;
      const radius = Math.max(point.radius * unit, unit * 0.018);
      context.lineWidth = Math.max(2, unit * 0.004);
      context.strokeStyle = point.confidence === "dudoso" ? "#f59e0b" : "#22c55e";
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.stroke();
      const badge = radius * 0.9;
      context.fillStyle = context.strokeStyle;
      context.beginPath();
      context.arc(cx, cy - radius - badge, badge, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#0b0f14";
      context.fillText(String(index + 1), cx, cy - radius - badge);
    });
    const annotated = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    canvas.width = 0;
    canvas.height = 0;
    if (!annotated) throw new Error("No pudimos preparar la foto para la revisión con IA.");
    const bytes = new Uint8Array(await annotated.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  } finally {
    URL.revokeObjectURL(source);
  }
}

/** Sends the borderline OpenCV candidates to gpt-5.6-luna for a second
 * opinion. Reflections are excluded from the defect count but kept in the
 * overlay so the user can see what was reviewed. Throws on any failure so the
 * caller can keep the local result untouched. */
export async function verifyPuntosConIA(blob: Blob, points: PuntoPantalla[], signal?: AbortSignal): Promise<PantallaVisionResult> {
  const image = await drawMarkers(blob, points, signal);
  signal?.throwIfAborted();
  const response = await fetch("/api/pantallas/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      image,
      candidates: points.map((point, index) => ({ id: index + 1, x: point.x, y: point.y, kind: point.confidence })),
    }),
  });
  if (!response.ok) throw new Error("No se pudo completar la revisión con IA. Se conserva el conteo local.");
  const payload = (await response.json()) as { veredictos?: { id?: unknown; verdict?: unknown }[] };
  if (!Array.isArray(payload.veredictos)) throw new Error("La IA devolvió una respuesta incompleta. Se conserva el conteo local.");
  const verdicts = new Map<number, "defecto" | "reflejo">();
  for (const item of payload.veredictos) {
    if (typeof item?.id === "number" && (item.verdict === "defecto" || item.verdict === "reflejo")) verdicts.set(item.id, item.verdict);
  }
  const verified = points.map<PuntoVerificado>((point, index) => ({ ...point, aiVerdict: verdicts.get(index + 1) }));
  return { points: verified, defectCount: verified.filter(point => point.aiVerdict !== "reflejo").length };
}
