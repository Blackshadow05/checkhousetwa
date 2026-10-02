import { ARTICULOS_CLASES, sumarConteos } from "@/lib/articulos-model";
import { valorDetectado } from "@/lib/inventario-casitas";
import type { RevisionDraft, RevisionPhotoScan, RevisionScan } from "@/lib/revision-form";

function escaneoAgregado(resultados: readonly [string, RevisionPhotoScan][]): RevisionScan | null {
  if (!resultados.length) return null;
  const ultimo = resultados.reduce((latest, [, item]) => item.at > latest.at ? item : latest, resultados[0][1]);
  return {
    detectados: sumarConteos(resultados.map(([, item]) => item.counts)),
    photoIds: resultados.map(([id]) => id),
    at: ultimo.at,
    model: ultimo.model,
    cajas: resultados.map(([, item]) => item.cajas),
  };
}

export function conEscaneo(draft: RevisionDraft): RevisionDraft {
  if (draft.mode !== "reconocimiento") return draft;
  const resultados = draft.photos.flatMap((photo) => {
    const item = draft.escaneos?.[photo.id];
    return item ? [[photo.id, item] as [string, RevisionPhotoScan]] : [];
  });
  const scan = escaneoAgregado(resultados);
  const values = { ...draft.values };
  for (const key of ARTICULOS_CLASES) {
    const anterior = draft.scan?.detectados[key];
    const editado = values[key] !== "" && (typeof anterior !== "number" || values[key] !== valorDetectado(key, anterior));
    if (editado) continue;
    values[key] = scan ? valorDetectado(key, scan.detectados[key] ?? 0) : "";
  }
  return { ...draft, values, scan, escaneos: Object.fromEntries(resultados) };
}

export function articulosEnFoto(item: RevisionPhotoScan) {
  return item.counts.reduce((total, count) => total + count, 0);
}
