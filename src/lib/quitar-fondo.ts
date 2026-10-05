export const TOLERANCIA_INICIAL = 30;
export const TOLERANCIA_MIN = 5;
export const TOLERANCIA_MAX = 90;

const SUAVIZADO = 2.2;
const ANILLO = 2;
const ALFA_VACIO = 16;

function mediana(histograma: Uint32Array, total: number) {
  let acumulado = 0;
  for (let valor = 0; valor < 256; valor++) {
    acumulado += histograma[valor];
    if (acumulado * 2 >= total) return valor;
  }
  return 255;
}

function colorDelBorde(data: Uint8ClampedArray, width: number, height: number) {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  let total = 0;
  const sumar = (index: number) => {
    const p = index * 4;
    if (data[p + 3] < ALFA_VACIO) return;
    r[data[p]]++; g[data[p + 1]]++; b[data[p + 2]]++; total++;
  };
  for (let x = 0; x < width; x++) { sumar(x); sumar((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { sumar(y * width); sumar(y * width + width - 1); }
  if (!total) return [255, 255, 255];
  return [mediana(r, total), mediana(g, total), mediana(b, total)];
}

export function quitarFondoLocal(source: ImageData, tolerancia: number): ImageData {
  const { width, height } = source;
  const src = source.data;
  const total = width * height;
  const [rr, rg, rb] = colorDelBorde(src, width, height);
  const distancia = new Float32Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (src[p + 3] < ALFA_VACIO) { distancia[i] = -1; continue; }
    const dr = src[p] - rr, dg = src[p + 1] - rg, db = src[p + 2] - rb;
    distancia[i] = Math.sqrt(dr * dr + dg * dg + db * db);
  }

  const fondo = new Uint8Array(total);
  const cola = new Int32Array(total);
  let cabeza = 0, fin = 0;
  const sembrar = (i: number) => {
    if (fondo[i] || distancia[i] >= tolerancia) return;
    fondo[i] = 1; cola[fin++] = i;
  };
  for (let x = 0; x < width; x++) { sembrar(x); sembrar((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { sembrar(y * width); sembrar(y * width + width - 1); }
  while (cabeza < fin) {
    const i = cola[cabeza++];
    const x = i % width;
    if (x > 0) sembrar(i - 1);
    if (x < width - 1) sembrar(i + 1);
    if (i >= width) sembrar(i - width);
    if (i < total - width) sembrar(i + width);
  }

  const anillo = new Uint8Array(total);
  cabeza = 0; fin = 0;
  for (let i = 0; i < total; i++) if (fondo[i]) cola[fin++] = i;
  for (let paso = 1; paso <= ANILLO; paso++) {
    const limite = fin;
    while (cabeza < limite) {
      const i = cola[cabeza++];
      const x = i % width, y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (fondo[n] || anillo[n]) continue;
          anillo[n] = paso; cola[fin++] = n;
        }
      }
    }
  }

  const salida = new ImageData(width, height);
  const out = salida.data;
  const alto = tolerancia * SUAVIZADO;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (fondo[i]) continue;
    const alfaOriginal = src[p + 3] / 255;
    if (!anillo[i]) {
      out[p] = src[p]; out[p + 1] = src[p + 1]; out[p + 2] = src[p + 2]; out[p + 3] = src[p + 3];
      continue;
    }
    const a = Math.min(1, Math.max(0, (distancia[i] - tolerancia) / (alto - tolerancia)));
    if (a < 0.02) continue;
    out[p] = (src[p] - (1 - a) * rr) / a;
    out[p + 1] = (src[p + 1] - (1 - a) * rg) / a;
    out[p + 2] = (src[p + 2] - (1 - a) * rb) / a;
    out[p + 3] = a * alfaOriginal * 255;
  }
  return salida;
}
