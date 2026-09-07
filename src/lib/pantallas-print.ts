import { pantallaTime, type PantallaReport } from "@/lib/pantallas";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const printStyles = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font: 8.5pt/1.35 Arial, sans-serif; color: #18382b; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .sheet { width: 190mm; height: 276mm; break-after: page; page-break-after: always; }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .sheet-header { height: 16mm; }
  h1 { margin: 0 0 1mm; font-size: 17pt; line-height: 1.2; }
  .sheet-header p { margin: 0; color: #53685d; }
  .sheet-content { height: 252mm; }
  .sheet-footer { height: 8mm; display: flex; align-items: end; justify-content: space-between; color: #53685d; font-size: 8pt; }
  .report-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; break-inside: avoid; }
  .report-row + .report-row { margin-top: 4mm; }
  .report-card { min-width: 0; min-height: 78mm; padding: 3mm; border: 0.25mm solid #c8d5ce; border-radius: 2mm; overflow-wrap: anywhere; }
  h2 { margin: 0 0 1mm; font-size: 12pt; line-height: 1.2; }
  .metadata { margin: 0 0 2mm; font-size: 8pt; color: #53685d; }
  .metadata span { display: block; }
  .photos { display: flex; gap: 2mm; }
  figure { flex: 1; min-width: 0; margin: 0; }
  img { display: block; width: 100%; height: 32mm; object-fit: contain; background: #f4f7f5; border-radius: 1mm; }
  figcaption { margin-top: 1mm; font-size: 8pt; line-height: 1.25; }
  figcaption strong, figcaption span { display: block; }
  .notes-label { margin: 2mm 0 0; font-weight: bold; }
  .notes { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .measure { position: absolute; left: -10000px; top: 0; width: 93mm; }
  .height-guide { height: 252mm; }
  .gap-guide { height: 4mm; }
`;

function reportCard(doc: Document, report: PantallaReport, continuation = false) {
  const article = doc.createElement("article");
  article.className = "report-card";
  article.dataset.reportId = String(report.id);
  article.innerHTML = `<h2>Casita ${escape(String(report.numero_casita ?? ""))}${continuation ? " (continuación)" : ""}</h2>
    <p class="metadata"><span>${escape(pantallaTime(report.fecha_hora))}</span><span>${escape(report.nombre_usuario)}</span></p>
    ${continuation ? "" : `<section class="photos">${report.fotos.map(f => `<figure><img src="${escape(f.url)}" alt="${escape(f.ubicacion)}"><figcaption><strong>${escape(f.ubicacion)}</strong><span>${escape(f.estado)}</span></figcaption></figure>`).join("")}</section>`}
    ${report.notas ? `<p class="notes-label">${continuation ? "Notas (continuación)" : "Notas"}</p><p class="notes"></p>` : ""}`;
  return article;
}

async function waitForImages(doc: Document) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([...doc.images].map(img => img.decode())),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("No se pudieron cargar todas las fotos para el PDF.")), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Build the same measured A4 layout used by the browser's PDF/print dialog. */
export async function buildPantallasPrintDocument(doc: Document, reports: PantallaReport[]) {
  const rows = reports.filter(report => report.tipo !== "movimiento" && report.fotos?.length);
  if (!rows.length) throw new Error("No hay reportes con fotos para exportar.");

  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de pantallas</title><style>${printStyles}</style></head><body></body></html>`);
  doc.close();

  const measure = doc.createElement("div");
  measure.className = "measure";
  measure.innerHTML = '<div class="height-guide"></div><div class="gap-guide"></div>';
  doc.body.appendChild(measure);
  // Use the browser's physical-unit measurements so screen and print match.
  const maxHeight = measure.querySelector(".height-guide")!.getBoundingClientRect().height - 1;
  const gap = measure.querySelector(".gap-guide")!.getBoundingClientRect().height;
  const cards: { element: HTMLElement; height: number }[] = [];

  for (const report of rows) {
    let remaining = Array.from(report.notas ?? "");
    let continuation = false;
    do {
      const card = reportCard(doc, report, continuation);
      measure.appendChild(card);
      const notes = card.querySelector<HTMLElement>(".notes");
      if (notes) {
        notes.textContent = remaining.join("");
        if (card.getBoundingClientRect().height > maxHeight) {
          // Split only oversized notes; never hide, clamp, or discard their text.
          let low = 0;
          let high = remaining.length;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            notes.textContent = remaining.slice(0, middle).join("");
            if (card.getBoundingClientRect().height <= maxHeight) low = middle;
            else high = middle - 1;
          }
          if (!low) throw new Error("No se pudo acomodar un reporte en la hoja. Revisa sus datos e intenta de nuevo.");
          // Prefer a word boundary while preserving every original character.
          const prefix = remaining.slice(0, low).join("");
          const boundary = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf("\n"));
          const count = boundary > prefix.length * 0.8 ? Array.from(prefix.slice(0, boundary + 1)).length : low;
          notes.textContent = remaining.slice(0, count).join("");
          remaining = remaining.slice(count);
        } else remaining = [];
      } else remaining = [];
      cards.push({ element: card, height: card.getBoundingClientRect().height });
      continuation = true;
    } while (remaining.length);
  }

  await waitForImages(doc);
  const pages: HTMLElement[] = [];
  let content: HTMLElement | undefined;
  let usedHeight = 0;
  let rowCount = 0;

  for (let index = 0; index < cards.length; index += 2) {
    const pair = cards.slice(index, index + 2);
    const height = Math.max(...pair.map(card => card.height));
    if (!content || rowCount === 3 || usedHeight + gap + height > maxHeight) {
      const page = doc.createElement("section");
      page.className = "sheet";
      page.innerHTML = `<header class="sheet-header"><h1>Reporte de pantallas</h1><p>${rows.length} reportes · Hora de Costa Rica</p></header><main class="sheet-content"></main><footer class="sheet-footer"><span>Reporte de pantallas</span><span class="page-number"></span></footer>`;
      doc.body.appendChild(page);
      pages.push(page);
      content = page.querySelector<HTMLElement>(".sheet-content")!;
      usedHeight = 0;
      rowCount = 0;
    }
    const row = doc.createElement("div");
    row.className = "report-row";
    row.append(...pair.map(card => card.element));
    content.appendChild(row);
    usedHeight += height + (rowCount ? gap : 0);
    rowCount++;
  }
  measure.remove();
  pages.forEach((page, index) => {
    page.querySelector(".page-number")!.textContent = `Página ${index + 1} de ${pages.length}`;
  });
}

export async function printPantallas(reports: PantallaReport[]) {
  const frame = document.createElement("iframe");
  frame.title = "Reporte de pantallas para imprimir";
  frame.style.cssText = "position:fixed;left:-10000px;width:800px;height:1100px;border:0";
  document.body.appendChild(frame);
  try {
    await buildPantallasPrintDocument(frame.contentDocument!, reports);
    frame.contentWindow!.addEventListener("afterprint", () => frame.remove(), { once: true });
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 120000);
  } catch (error) {
    frame.remove();
    if (error instanceof Error && error.message === "No hay reportes con fotos para exportar.") throw error;
    throw new Error("No se pudo preparar el PDF. Revisa la conexión y vuelve a exportar.");
  }
}
