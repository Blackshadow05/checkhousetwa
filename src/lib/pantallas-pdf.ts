import { PDFDocument, PageSizes, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { latestPantallaReports, type PantallaReport } from "@/lib/pantallas";

type PdfOptions = { signal?: AbortSignal; onProgress?: (message: string) => void };
const MARGIN = 28;
const TOP = 762;
const BOTTOM = 48;
const GAP = 8;
const ROW_HEIGHT = (TOP - BOTTOM - GAP * 4) / 5;
const INK = rgb(0.09, 0.22, 0.17);
const MUTED = rgb(0.32, 0.4, 0.36);
const BORDER = rgb(0.79, 0.84, 0.81);

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Exportación cancelada.", "AbortError");
}

async function fetchBytes(url: string, signal?: AbortSignal) {
  checkAbort(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("No se pudo descargar el archivo.");
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

// PDF JPEG streams do not interpret EXIF rotation. Preserve the original bytes
// except when a camera orientation needs to be applied without losing pixels.
function needsOrientation(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && length >= 16 && view.getUint32(offset + 4) === 0x45786966) {
      const start = offset + 10;
      const little = view.getUint16(start) === 0x4949;
      const directory = start + view.getUint32(start + 4, little);
      if (directory + 2 > offset + length + 2) break;
      const count = view.getUint16(directory, little);
      for (let i = 0; i < count; i++) {
        const entry = directory + 2 + i * 12;
        if (entry + 12 > offset + length + 2) break;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little) !== 1;
      }
    }
    offset += length + 2;
  }
  return false;
}

async function losslessPng(bytes: Uint8Array, signal?: AbortSignal) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    await image.decode();
    checkAbort(signal);
    // Change only the physical size on the page, never the source resolution.
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("No se pudo leer la foto.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo convertir la foto.")), "image/png");
    });
    checkAbort(signal);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
    image.src = "";
    canvas.width = canvas.height = 0;
  }
}

async function embedPhoto(pdf: PDFDocument, url: string, signal?: AbortSignal): Promise<PDFImage> {
  const bytes = await fetchBytes(url, signal);
  checkAbort(signal);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && !needsOrientation(bytes)) return pdf.embedJpg(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return pdf.embedPng(bytes);
  // WebP (including Android uploads) is decoded at full size and stored as PNG.
  return pdf.embedPng(await losslessPng(bytes, signal));
}

function safeText(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "    "))
    .map(char => char === "\n" || supported.has(char.codePointAt(0)!) ? char : `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safeText(text, font).split("\n")) {
    let line = "";
    // Keep whitespace/newlines and split overlong words without dropping text.
    for (const word of paragraph.match(/\S+\s*|\s+/g) || [""]) {
      if (line && font.widthOfTextAtSize(line + word, size) > width) {
        lines.push(line); line = "";
      }
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) {
          lines.push(line); line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawLines(page: PDFPage, lines: string[], x: number, y: number, font: PDFFont, size: number, leading: number, color = INK) {
  lines.forEach((text, i) => page.drawText(text, { x, y: y - i * leading, font, size, color }));
}

/** A real, client-generated A4 PDF: one report per row, five rows per page. */
export async function createPantallasPdf(reports: PantallaReport[], { signal, onProgress }: PdfOptions = {}): Promise<File> {
  const rows = latestPantallaReports(reports);
  if (!rows.length) throw new Error("Selecciona al menos un reporte con fotos.");
  checkAbort(signal);
  onProgress?.("Preparando el documento…");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  let regular: PDFFont;
  let bold: PDFFont;
  try {
    const bytes = await Promise.all([
      fetchBytes("/fonts/noto-sans-latin-400-normal.woff", signal),
      fetchBytes("/fonts/noto-sans-latin-600-normal.woff", signal),
    ]);
    [regular, bold] = await Promise.all(bytes.map(data => pdf.embedFont(data, { subset: true })));
  } catch {
    checkAbort(signal);
    throw new Error("No se pudo preparar el PDF. Conéctate e inténtalo de nuevo.");
  }
  pdf.setTitle("Reporte de pantallas");
  pdf.setSubject(`${rows.length} reportes de pantallas seleccionados`);
  pdf.setCreator("Revisión de casitas");
  pdf.setLanguage("es-CR");
  const [width] = PageSizes.A4;
  const contentWidth = width - MARGIN * 2;
  const metadataWidth = 128;
  const photoStart = MARGIN + metadataWidth + 20;
  const photoAreaWidth = width - MARGIN - 8 - photoStart;
  const annex: { report: PantallaReport; page: PDFPage; x: number; y: number }[] = [];
  const photoCount = rows.reduce((sum, row) => sum + row.fotos.length, 0);
  let photoIndex = 0;
  function addPage(title: string) {
    const page = pdf.addPage(PageSizes.A4);
    page.drawText(title, { x: MARGIN, y: 802, font: bold, size: 18, color: INK });
    return page;
  }
  let page: PDFPage;
  for (const [index, report] of rows.entries()) {
    checkAbort(signal);
    if (index % 5 === 0) page = addPage("Reporte de pantallas");
    const top = TOP - (index % 5) * (ROW_HEIGHT + GAP);
    page!.drawRectangle({ x: MARGIN, y: top - ROW_HEIGHT, width: contentWidth, height: ROW_HEIGHT, borderColor: BORDER, borderWidth: 0.6 });
    const x = MARGIN + 8;
    page!.drawText(`Casita ${report.numero_casita ?? ""}`, { x, y: top - 19, font: bold, size: 12, color: INK });
    const noteY = top - 38;
    const notes = report.notas ? wrap(`Notas: ${report.notas}`, regular, 9, metadataWidth) : [];
    const availableLines = Math.max(0, Math.floor((noteY - (top - ROW_HEIGHT + 9)) / 11) + 1);
    if (notes.length > availableLines) {
      annex.push({ report, page: page!, x, y: noteY });
    } else drawLines(page!, notes, x, noteY, regular, 9, 11, MUTED);

    const photoWidth = (photoAreaWidth - GAP * (report.fotos.length - 1)) / report.fotos.length;
    for (const [photoNumber, photo] of report.fotos.entries()) {
      checkAbort(signal);
      onProgress?.(`Preparando foto ${++photoIndex} de ${photoCount}…`);
      let embedded: PDFImage;
      try {
        embedded = await embedPhoto(pdf, photo.url, signal);
      } catch {
        checkAbort(signal);
        throw new Error(`No se pudo cargar la foto de Casita ${report.numero_casita}, ${photo.ubicacion}. Revisa la conexión y vuelve a crear el PDF.`);
      }
      const px = photoStart + photoNumber * (photoWidth + GAP);
      const state = wrap(photo.estado, regular, 8, photoWidth);
      const imageHeight = ROW_HEIGHT - 24 - state.length * 10;
      const imageTop = top - 8;
      page!.drawRectangle({ x: px, y: imageTop - imageHeight, width: photoWidth, height: imageHeight, color: rgb(0.96, 0.97, 0.96) });
      const fit = embedded.scaleToFit(photoWidth, imageHeight);
      page!.drawImage(embedded, { x: px + (photoWidth - fit.width) / 2, y: imageTop - imageHeight + (imageHeight - fit.height) / 2, width: fit.width, height: fit.height });
      const captionY = imageTop - imageHeight - 12;
      drawLines(page!, state, px, captionY, regular, 8, 10, MUTED);
      // Release this photo's decoded pixels without finalizing font subsets.
      // Flushing the entire document here embeds fonts while text is still being added.
      await embedded.embed();
    }
  }

  let annexPage: PDFPage | undefined;
  let annexY = BOTTOM;
  for (const entry of annex) {
    checkAbort(signal);
    if (!annexPage || annexY < BOTTOM + 75) { annexPage = addPage("Notas de los reportes"); annexY = TOP - 4; }
    const pageNumber = pdf.getPageCount();
    const reference = `Notas completas en anexo · pág. ${pageNumber}`;
    drawLines(entry.page, wrap(reference, regular, 7.5, metadataWidth), entry.x, entry.y, regular, 7.5, 9, MUTED);
    const title = `Casita ${entry.report.numero_casita}`;
    annexPage.drawText(title, { x: MARGIN, y: annexY, font: bold, size: 11, color: INK });
    annexY -= 19;
    const text = entry.report.notas ?? "";
    for (const line of wrap(text, regular, 9, contentWidth)) {
      if (annexY < BOTTOM + 10) {
        annexPage = addPage("Notas de los reportes");
        annexY = TOP - 4;
        annexPage.drawText(`${title} (continuación)`, { x: MARGIN, y: annexY, font: bold, size: 11, color: INK });
        annexY -= 19;
      }
      annexPage.drawText(line, { x: MARGIN, y: annexY, font: regular, size: 9, color: INK });
      annexY -= 13;
    }
    annexY -= 22;
  }
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const label = `Página ${i + 1} de ${pages.length}`;
    page.drawText(label, { x: width - MARGIN - regular.widthOfTextAtSize(label, 8), y: 28, font: regular, size: 8, color: MUTED });
  });
  checkAbort(signal);
  onProgress?.("Terminando el PDF…");
  const bytes = await pdf.save();
  checkAbort(signal);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new File([new Uint8Array(bytes)], `reporte-pantallas-${date}.pdf`, { type: "application/pdf" });
}
