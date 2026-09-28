import type * as OpenCV from "@techstark/opencv-js";

export type PuntoFeatures = {
  circularity: number;
  axisRatio: number;
  contrastPeak: number;
  edgeSharpness: number;
  radialFalloff: number;
  relativeDiameter: number;
};
export type PuntoPantalla = { x: number; y: number; radius: number; confidence: "seguro" | "dudoso"; features?: PuntoFeatures };
export type PantallaDetection = { points: PuntoPantalla[]; screenFound: boolean; noScreen: boolean; screen?: { x: number; y: number }[] };
type CV = typeof OpenCV;
type Point = { x: number; y: number };
type Line = { nx: number; ny: number; c: number; weight: number; virtual: boolean };
type LineProfile = { px: number; py: number; dx: number; dy: number; span: number; hits: Int32Array; inside: Int32Array };
type Keep = <T extends { delete(): void }>(value: T) => T;
type Spot = {
  x: number; y: number; halfRadius: number; contrast: number; roundness: number; symmetry: number; texture: number;
  ringNoise: number; monotonic: number; blueness: number; falloff: number; steepness: number; axisRatio: number;
  onBorder: boolean; quality: number; aligned: number; sizeMatch: number;
};

export function detectPantallaPoints(cv: CV, image: ImageData): PantallaDetection {
  const allocated: { delete(): void }[] = [];
  const keep: Keep = value => { allocated.push(value); return value; };
  try {
    const { width, height } = image;
    const src = keep(cv.matFromImageData(image));
    const gray = keep(new cv.Mat());
    const smooth = keep(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, smooth, new cv.Size(5, 5), 0);
    const screen = findScreen(cv, smooth, image.data, width, height, keep);
    const scale = screen ? Math.sqrt(polygonArea(screen)) : Math.sqrt(width * height) * 0.8;

    const background = keep(new cv.Mat());
    const contrast = keep(new cv.Mat());
    cv.GaussianBlur(smooth, background, new cv.Size(0, 0), Math.max(7, scale * 0.022));
    cv.subtract(smooth, background, contrast);
    const levels = [6, 14].map(level => { const binary = keep(new cv.Mat()); cv.threshold(contrast, binary, level, 255, cv.THRESH_BINARY); return binary; });
    const contours = keep(new cv.MatVector());
    const hierarchy = keep(new cv.Mat());
    const spots: Spot[] = [];
    for (const binary of levels) {
      cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        try {
          const area = cv.contourArea(contour);
          const rect = cv.boundingRect(contour);
          const diameter = Math.max(rect.width, rect.height);
          if (diameter < scale * 0.012 || diameter > scale * 0.16 || area < 12) continue;
          if (Math.min(rect.width, rect.height) / diameter < 0.35) continue;
          const perimeter = cv.arcLength(contour, true);
          const circularity = 4 * Math.PI * area / (perimeter * perimeter);
          const moments = cv.moments(contour);
          const trace = moments.mu20 + moments.mu02;
          const spread = Math.hypot(moments.mu20 - moments.mu02, 2 * moments.mu11);
          const axisRatio = Math.sqrt(Math.max(0, (trace - spread) / (trace + spread)));
          if (!Number.isFinite(axisRatio) || axisRatio < 0.35 || circularity < 0.35) continue;
          let sx = 0; let sy = 0; let sw = 0;
          for (let py = rect.y; py < rect.y + rect.height; py++) for (let px = rect.x; px < rect.x + rect.width; px++) {
            const w = contrast.data[py * width + px] ** 2;
            sx += w * px; sy += w * py; sw += w;
          }
          if (!sw) continue;
          const x = sx / sw; const y = sy / sw;
          let onBorder = false;
          if (screen) {
            if (!insideScreen(x, y, screen, scale * 0.01)) {
              if (!insideScreen(x, y, screen, -scale * 0.02)) continue;
              onBorder = true;
            }
          } else if (x < width * 0.04 || x > width * 0.96 || y < height * 0.04 || y > height * 0.96) continue;
          const spot = describeSpot(smooth.data, image.data, width, height, x, y, diameter / 2);
          if (!spot) continue;
          spots.push({ ...spot, x, y, axisRatio, onBorder, quality: 0, aligned: 0, sizeMatch: 0 });
        } finally { contour.delete(); }
      }
    }
    for (const spot of spots) spot.quality = spotQuality(spot, scale);
    const axes = screen ? screenAxes(screen) : null;
    const reliable = spots.filter(spot => spot.quality >= 0.5);
    const typical = reliable.length >= 2 ? median(reliable.map(spot => spot.halfRadius)) : 0;
    const tone = reliable.length >= 2 ? median(reliable.map(spot => spot.blueness)) : 0;
    for (const spot of spots) {
      const ratio = typical ? spot.halfRadius / typical : 1;
      spot.sizeMatch = typical ? ramp(ratio, 0.45, 0.7) * (1 - ramp(ratio, 1.45, 2.2)) : 0.5;
      spot.aligned = spots.filter(other => other !== spot && other.quality >= 0.35 && alignedWith(spot, other, axes, scale)).length;
    }
    if (typical) for (const spot of spots) spot.quality *= (0.4 + 0.6 * spot.sizeMatch) * (tone > 0.3 ? 0.6 + 0.4 * ramp(spot.blueness, tone - 0.7, tone - 0.35) : 1);
    const accepted: Spot[] = [];
    for (const spot of [...spots].sort((a, b) => b.quality - a.quality)) {
      if (accepted.some(other => Math.hypot(other.x - spot.x, other.y - spot.y) < Math.max(other.halfRadius, spot.halfRadius) * 1.6)) continue;
      const support = spot.aligned > 0 && spot.sizeMatch >= 0.8;
      if (spot.quality >= 0.25 || (support && spot.quality >= 0.15)) accepted.push(spot);
    }
    const confident = (spot: Spot) => !spot.onBorder && (screen
      ? spot.quality >= 0.6 || (spot.quality >= 0.4 && spot.aligned > 0 && spot.sizeMatch >= 0.8)
      : spot.quality >= 0.7 && spot.aligned > 0);
    const points = accepted.slice(0, 30).map<PuntoPantalla>(spot => ({
      x: spot.x / width,
      y: spot.y / height,
      radius: spot.halfRadius * 1.6 / Math.max(width, height),
      confidence: confident(spot) ? "seguro" : "dudoso",
      features: {
        circularity: clamp(spot.roundness, 0, 1),
        axisRatio: clamp(spot.axisRatio, 0, 1),
        contrastPeak: clamp(spot.contrast, 0, 255),
        edgeSharpness: clamp(spot.texture, 0, 255),
        radialFalloff: clamp(spot.falloff, -255, 255),
        relativeDiameter: clamp(spot.halfRadius * 3.2 / Math.min(width, height), 0, 1),
      },
    }));
    const evidence = points.some(point => point.confidence === "seguro") || accepted.filter(spot => spot.quality >= 0.5).length >= 2;
    const noScreen = !screen && !evidence && !looksLikeCloseUp(cv, src, keep);
    return { points: points.sort((a, b) => a.y - b.y || a.x - b.x), screenFound: Boolean(screen), noScreen, screen: screen?.map(p => ({ x: p.x / width, y: p.y / height })) };
  } finally {
    for (const value of allocated.reverse()) value.delete();
  }
}

function describeSpot(gray: Uint8Array, rgba: Uint8ClampedArray, width: number, height: number, x: number, y: number, footprint: number) {
  const directions = 16;
  const steps = 24;
  const reach = footprint * 2.8;
  const values: number[][] = [];
  for (let k = 0; k < directions; k++) {
    const angle = k * 2 * Math.PI / directions;
    const row: number[] = [];
    for (let j = 0; j <= steps; j++) {
      const r = reach * j / steps;
      const v = sample(gray, width, height, x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      if (v === null) return null;
      row.push(v);
    }
    values.push(row);
  }
  const ringStart = Math.ceil(steps * 1.8 / 2.8);
  const center = values.reduce((sum, row) => sum + row[0] + row[1], 0) / (directions * 2);
  const ring = values.map(row => average(row.slice(ringStart)));
  const drops = ring.map(value => center - value);
  const halfRadii = values.map((row, k) => {
    if (drops[k] <= 0) return 0;
    const level = ring[k] + drops[k] / 2;
    for (let j = 1; j <= steps; j++) if (row[j] < level) {
      const t = (row[j - 1] - level) / Math.max(1e-6, row[j - 1] - row[j]);
      return reach * (j - 1 + t) / steps;
    }
    return reach;
  });
  const sortedRadii = [...halfRadii].sort((a, b) => a - b);
  const sortedDrops = [...drops].sort((a, b) => a - b);
  const halfRadius = sortedRadii[directions / 2];
  const drop = sortedDrops[directions / 2];
  const roundness = sortedRadii[3] / Math.max(1e-6, sortedRadii[12]);
  const symmetry = drop > 0 ? Math.max(0, sortedDrops[3]) / Math.max(1e-6, sortedDrops[12]) : 0;
  let residual = 0; let residualCount = 0; let violations = 0; let checks = 0;
  const limit = Math.min(steps, Math.ceil(halfRadius * 1.5 / reach * steps));
  for (let j = 0; j <= limit; j++) {
    let mean = 0; let a = 0; let b = 0;
    for (let k = 0; k < directions; k++) {
      const angle = k * 2 * Math.PI / directions;
      mean += values[k][j]; a += values[k][j] * Math.cos(angle); b += values[k][j] * Math.sin(angle);
    }
    mean /= directions; a *= 2 / directions; b *= 2 / directions;
    for (let k = 0; k < directions; k++) {
      const angle = k * 2 * Math.PI / directions;
      residual += (values[k][j] - mean - a * Math.cos(angle) - b * Math.sin(angle)) ** 2;
      residualCount++;
    }
  }
  const noise = Math.max(1.5, Math.abs(drop) * 0.06);
  const monotonicLimit = Math.min(steps, Math.ceil(halfRadius * 2 / reach * steps));
  for (let k = 0; k < directions; k++) for (let j = 1; j <= monotonicLimit; j++) {
    checks++;
    if (values[k][j] > values[k][j - 1] + noise) violations++;
  }
  const slopes = values.map(row => {
    let slope = 0;
    for (let j = 1; j <= steps; j++) slope = Math.max(slope, row[j - 1] - row[j]);
    return slope;
  }).sort((a, b) => a - b);
  const steepness = drop > 0 ? slopes[directions / 2] / (reach / steps) * halfRadius / drop : 0;
  let ringMean = 0; let ra = 0; let rb = 0;
  for (let k = 0; k < directions; k++) { const angle = k * 2 * Math.PI / directions; ringMean += ring[k]; ra += ring[k] * Math.cos(angle); rb += ring[k] * Math.sin(angle); }
  ringMean /= directions; ra *= 2 / directions; rb *= 2 / directions;
  let ringResidual = 0;
  for (let k = 0; k < directions; k++) { const angle = k * 2 * Math.PI / directions; ringResidual += (ring[k] - ringMean - ra * Math.cos(angle) - rb * Math.sin(angle)) ** 2; }
  const core = colorMean(rgba, width, height, x, y, 0, Math.max(1.5, halfRadius * 0.6));
  const outer = colorMean(rgba, width, height, x, y, reach * 0.65, reach);
  const dr = core[0] - outer[0]; const dg = core[1] - outer[1]; const db = core[2] - outer[2];
  const lift = Math.max(4, (dr + dg + db) / 3);
  return {
    halfRadius,
    contrast: drop,
    roundness,
    symmetry,
    texture: Math.sqrt(residual / Math.max(1, residualCount)),
    ringNoise: Math.sqrt(ringResidual / directions),
    monotonic: checks ? 1 - violations / checks : 0,
    blueness: (db - dr) / lift,
    falloff: sortedDrops[3],
    steepness,
  };
}

function colorMean(rgba: Uint8ClampedArray, width: number, height: number, x: number, y: number, inner: number, outer: number) {
  const sum = [0, 0, 0]; let count = 0;
  for (let py = Math.max(0, Math.floor(y - outer)); py <= Math.min(height - 1, Math.ceil(y + outer)); py++) for (let px = Math.max(0, Math.floor(x - outer)); px <= Math.min(width - 1, Math.ceil(x + outer)); px++) {
    const d = Math.hypot(px - x, py - y);
    if (d < inner || d > outer) continue;
    const offset = (py * width + px) * 4;
    sum[0] += rgba[offset]; sum[1] += rgba[offset + 1]; sum[2] += rgba[offset + 2]; count++;
  }
  return sum.map(value => value / Math.max(1, count));
}

function sample(data: Uint8Array, width: number, height: number, x: number, y: number) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return null;
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1); const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0; const fy = y - y0;
  const top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx;
  const bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function median(values: number[]) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findScreen(cv: CV, smooth: OpenCV.Mat, rgba: Uint8ClampedArray, width: number, height: number, keep: Keep) {
  const shortSide = Math.min(width, height);
  const edges = keep(new cv.Mat());
  const support = keep(new cv.Mat());
  const segments = keep(new cv.Mat());
  cv.Canny(smooth, edges, 20, 60);
  cv.dilate(edges, support, keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))));
  cv.HoughLinesP(edges, segments, 1, Math.PI / 180, 40, shortSide * 0.12, shortSide * 0.02);
  const tolerance = Math.max(3, shortSide * 0.005);
  const horizontal = [...groupLines(segments.data32S, segments.rows, true, tolerance), { nx: 0, ny: 1, c: 0, weight: 0, virtual: true }, { nx: 0, ny: 1, c: height - 1, weight: 0, virtual: true }];
  const vertical = [...groupLines(segments.data32S, segments.rows, false, tolerance), { nx: 1, ny: 0, c: 0, weight: 0, virtual: true }, { nx: 1, ny: 0, c: width - 1, weight: 0, virtual: true }];
  const profiles = new Map<Line, LineProfile>();
  const coverage = (line: Line, a: Point, b: Point) => {
    if (line.virtual) return 0.7;
    let profile = profiles.get(line);
    if (!profile) { profile = profileLine(line, support.data, width, height); profiles.set(line, profile); }
    const ta = Math.round((a.x - profile.px) * profile.dx + (a.y - profile.py) * profile.dy);
    const tb = Math.round((b.x - profile.px) * profile.dx + (b.y - profile.py) * profile.dy);
    const from = Math.max(0, Math.min(ta, tb) + profile.span);
    const to = Math.min(profile.span * 2, Math.max(ta, tb) + profile.span);
    const inside = profile.inside[to + 1] - profile.inside[from];
    if (inside < Math.abs(tb - ta) * 0.4 || inside < 10) return 0;
    return (profile.hits[to + 1] - profile.hits[from]) / inside;
  };
  let best: { corners: Point[]; score: number } | null = null;
  for (const top of horizontal) for (const bottom of horizontal) {
    if (top === bottom) continue;
    if ((bottom.c - bottom.nx * width / 2) / bottom.ny - (top.c - top.nx * width / 2) / top.ny < height * 0.2) continue;
    for (const left of vertical) for (const right of vertical) {
      if (left === right || Number(top.virtual) + Number(bottom.virtual) + Number(left.virtual) + Number(right.virtual) > 1) continue;
      if ((right.c - right.ny * height / 2) / right.nx - (left.c - left.ny * height / 2) / left.nx < width * 0.2) continue;
      const corners = [intersect(top, left), intersect(top, right), intersect(bottom, right), intersect(bottom, left)];
      if (corners.some(p => !p || p.x < -width * 0.25 || p.x > width * 1.25 || p.y < -height * 0.25 || p.y > height * 1.25)) continue;
      const [tl, tr, br, bl] = corners as Point[];
      if (!isConvex([tl, tr, br, bl])) continue;
      const topLength = Math.hypot(tr.x - tl.x, tr.y - tl.y);
      const bottomLength = Math.hypot(br.x - bl.x, br.y - bl.y);
      const leftLength = Math.hypot(bl.x - tl.x, bl.y - tl.y);
      const rightLength = Math.hypot(br.x - tr.x, br.y - tr.y);
      if (Math.min(topLength, bottomLength) / Math.max(topLength, bottomLength) < 0.6 || Math.min(leftLength, rightLength) / Math.max(leftLength, rightLength) < 0.6) continue;
      const aspect = (topLength + bottomLength) / (leftLength + rightLength);
      if (Math.max(aspect, 1 / aspect) < 1.05 || Math.max(aspect, 1 / aspect) > 3) continue;
      const sides = [coverage(top, tl, tr), coverage(right, tr, br), coverage(bottom, br, bl), coverage(left, bl, tl)];
      if (Math.min(...sides) < 0.5 || sides.reduce((product, side) => product * side, 1) < 0.35) continue;
      const visible = clippedArea([tl, tr, br, bl], width, height) / (width * height);
      if (visible < 0.1) continue;
      const score = visible * sides.reduce((product, side) => product * side, 1);
      if (best && score <= best.score) continue;
      const interior = interiorLook([tl, tr, br, bl], rgba, support.data, width, height);
      if (interior.warmth > 12 || interior.light > 200 || interior.clutter > 0.2) continue;
      best = { corners: [tl, tr, br, bl], score };
    }
  }
  return best?.corners ?? null;
}

function groupLines(data: Int32Array, count: number, horizontal: boolean, tolerance: number): Line[] {
  const items: (Line & { mx: number; my: number })[] = [];
  for (let i = 0; i < count; i++) {
    const x1 = data[i * 4]; const y1 = data[i * 4 + 1]; const x2 = data[i * 4 + 2]; const y2 = data[i * 4 + 3];
    const length = Math.hypot(x2 - x1, y2 - y1);
    const tilt = Math.abs(y2 - y1) / length;
    if (horizontal ? tilt > 0.5 : tilt < 0.866) continue;
    let nx = -(y2 - y1) / length; let ny = (x2 - x1) / length;
    if (horizontal ? ny < 0 : nx < 0) { nx = -nx; ny = -ny; }
    items.push({ nx, ny, c: nx * x1 + ny * y1, weight: length, virtual: false, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 });
  }
  items.sort((a, b) => b.weight - a.weight);
  const lines: Line[] = [];
  for (const item of items) {
    const match = lines.find(line => line.nx * item.nx + line.ny * item.ny > 0.9986 && Math.abs(line.nx * item.mx + line.ny * item.my - line.c) < tolerance);
    if (match) match.weight += item.weight;
    else lines.push({ nx: item.nx, ny: item.ny, c: item.c, weight: item.weight, virtual: false });
  }
  return lines.sort((a, b) => b.weight - a.weight).slice(0, 10);
}

function profileLine(line: Line, support: Uint8Array, width: number, height: number): LineProfile {
  const px = line.nx * line.c; const py = line.ny * line.c;
  const dx = line.ny; const dy = -line.nx;
  const span = Math.ceil(Math.hypot(width, height) * 1.5);
  const hits = new Int32Array(span * 2 + 2);
  const inside = new Int32Array(span * 2 + 2);
  for (let t = -span; t <= span; t++) {
    const x = Math.round(px + dx * t); const y = Math.round(py + dy * t);
    const within = x >= 0 && y >= 0 && x < width && y < height;
    inside[t + span + 1] = inside[t + span] + Number(within);
    hits[t + span + 1] = hits[t + span] + Number(within && support[y * width + x] > 0);
  }
  return { px, py, dx, dy, span, hits, inside };
}

function intersect(a: Line, b: Line): Point | null {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (a.c * b.ny - b.c * a.ny) / det, y: (a.nx * b.c - b.nx * a.c) / det };
}

function isConvex(polygon: Point[]) {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length]; const c = polygon[(i + 2) % polygon.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (!cross || (sign && Math.sign(cross) !== sign)) return false;
    sign = Math.sign(cross);
  }
  return true;
}

function polygonArea(polygon: Point[]) {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function clippedArea(polygon: Point[], width: number, height: number) {
  let result = polygon;
  const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [p => p.x >= 0, (a, b) => ({ x: 0, y: a.y + (b.y - a.y) * (0 - a.x) / (b.x - a.x) })],
    [p => p.x <= width, (a, b) => ({ x: width, y: a.y + (b.y - a.y) * (width - a.x) / (b.x - a.x) })],
    [p => p.y >= 0, (a, b) => ({ x: a.x + (b.x - a.x) * (0 - a.y) / (b.y - a.y), y: 0 })],
    [p => p.y <= height, (a, b) => ({ x: a.x + (b.x - a.x) * (height - a.y) / (b.y - a.y), y: height })],
  ];
  for (const [inside, cut] of edges) {
    const next: Point[] = [];
    for (let i = 0; i < result.length; i++) {
      const current = result[i]; const previous = result[(i + result.length - 1) % result.length];
      if (inside(current)) {
        if (!inside(previous)) next.push(cut(previous, current));
        next.push(current);
      } else if (inside(previous)) next.push(cut(previous, current));
    }
    result = next;
    if (!result.length) return 0;
  }
  return polygonArea(result);
}

function insideScreen(x: number, y: number, polygon: Point[], margin: number) {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) { const a = polygon[i]; const b = polygon[(i + 1) % polygon.length]; area += a.x * b.y - b.x * a.y; }
  const orientation = Math.sign(area);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (orientation * cross / Math.hypot(b.x - a.x, b.y - a.y) < margin) return false;
  }
  return true;
}

function ramp(value: number, low: number, high: number) {
  return clamp((value - low) / (high - low), 0, 1);
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function spotQuality(spot: Spot, scale: number) {
  const contrast = Math.max(1, spot.contrast);
  const size = spot.halfRadius / scale;
  const shape = ramp(spot.roundness, 0.45, 0.8) * ramp(spot.symmetry, 0.08, 0.4);
  const smoothness = (1 - ramp(spot.texture / contrast, 0.05, 0.11)) * (1 - ramp(spot.ringNoise / contrast, 0.12, 0.28)) * ramp(spot.monotonic, 0.85, 0.97) * (1 - ramp(spot.steepness, 1.6, 3));
  const extent = ramp(size, 0.006, 0.01) * (1 - ramp(size, 0.05, 0.08));
  const tint = 0.65 + 0.35 * ramp(spot.blueness, -0.15, 0.25);
  return Math.sqrt(shape) * smoothness * ramp(spot.contrast, 8, 25) * extent * tint;
}

function screenAxes(corners: Point[]) {
  const [tl, tr, br, bl] = corners;
  const unit = (x: number, y: number) => { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; };
  return {
    origin: tl,
    width: Math.hypot(tr.x - tl.x, tr.y - tl.y),
    height: Math.hypot(bl.x - tl.x, bl.y - tl.y),
    top: unit(tr.x - tl.x, tr.y - tl.y), bottom: unit(br.x - bl.x, br.y - bl.y),
    left: unit(bl.x - tl.x, bl.y - tl.y), right: unit(br.x - tr.x, br.y - tr.y),
  };
}

type Axes = ReturnType<typeof screenAxes> | null;

function alignedWith(a: Spot, b: Spot, axes: Axes, scale: number) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const radius = Math.max(a.halfRadius, b.halfRadius);
  const ratio = a.halfRadius / Math.max(1e-6, b.halfRadius);
  const distance = Math.hypot(dx, dy);
  if (distance < radius * 3 || distance > scale * 0.6 || ratio < 0.6 || ratio > 1.65) return false;
  let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };
  if (axes) {
    const mx = (a.x + b.x) / 2 - axes.origin.x; const my = (a.y + b.y) / 2 - axes.origin.y;
    const s = clamp((mx * axes.top.x + my * axes.top.y) / axes.width, 0, 1);
    const t = clamp((mx * axes.left.x + my * axes.left.y) / axes.height, 0, 1);
    u = { x: axes.top.x * (1 - t) + axes.bottom.x * t, y: axes.top.y * (1 - t) + axes.bottom.y * t };
    v = { x: axes.left.x * (1 - s) + axes.right.x * s, y: axes.left.y * (1 - s) + axes.right.y * s };
  }
  const det = u.x * v.y - u.y * v.x;
  if (Math.abs(det) < 1e-6) return false;
  const along = (dx * v.y - dy * v.x) / det;
  const across = (u.x * dy - u.y * dx) / det;
  return Math.abs(along) < radius * 0.6 || Math.abs(across) < radius * 0.6;
}

function looksLikeCloseUp(cv: CV, src: OpenCV.Mat, keep: Keep) {
  const columns = 64;
  const rows = Math.max(8, Math.round(columns * src.rows / src.cols));
  const small = keep(new cv.Mat());
  cv.resize(src, small, new cv.Size(columns, rows), 0, 0, cv.INTER_AREA);
  const data = small.data;
  const light = (x: number, y: number) => { const o = (y * columns + x) * 4; return (data[o] + data[o + 1] + data[o + 2]) / 3; };
  const flat = new Uint8Array(columns * rows);
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < columns - 1; x++) {
    const o = (y * columns + x) * 4;
    const r = data[o]; const g = data[o + 1]; const b = data[o + 2];
    const value = light(x, y);
    const gradient = Math.max(Math.abs(value - light(x - 1, y)), Math.abs(value - light(x + 1, y)), Math.abs(value - light(x, y - 1)), Math.abs(value - light(x, y + 1)));
    flat[y * columns + x] = Number(gradient < 6 && Math.max(r, g, b) - Math.min(r, g, b) < 45 && r - b < 15 && value < 170);
  }
  let largest = 0;
  const stack: number[] = [];
  for (let start = 0; start < flat.length; start++) {
    if (flat[start] !== 1) continue;
    let size = 0;
    flat[start] = 2; stack.push(start);
    while (stack.length) {
      const index = stack.pop()!; size++;
      const x = index % columns; const y = (index - x) / columns;
      for (const next of [x > 0 ? index - 1 : -1, x < columns - 1 ? index + 1 : -1, y > 0 ? index - columns : -1, y < rows - 1 ? index + columns : -1]) {
        if (next >= 0 && flat[next] === 1) { flat[next] = 2; stack.push(next); }
      }
    }
    largest = Math.max(largest, size);
  }
  return largest / (columns * rows) >= 0.4;
}

function interiorLook(corners: Point[], rgba: Uint8ClampedArray, support: Uint8Array, width: number, height: number) {
  const [tl, tr, br, bl] = corners;
  let count = 0; let warmth = 0; let light = 0; let clutter = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 30; j++) {
    const s = 0.06 + 0.88 * (i + 0.5) / 40; const t = 0.06 + 0.88 * (j + 0.5) / 30;
    const topX = tl.x + (tr.x - tl.x) * s; const topY = tl.y + (tr.y - tl.y) * s;
    const x = Math.round(topX + (bl.x + (br.x - bl.x) * s - topX) * t);
    const y = Math.round(topY + (bl.y + (br.y - bl.y) * s - topY) * t);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const offset = (y * width + x) * 4;
    count++;
    warmth += rgba[offset] - rgba[offset + 2];
    light += (rgba[offset] + rgba[offset + 1] + rgba[offset + 2]) / 3;
    if (support[y * width + x]) clutter++;
  }
  return { warmth: warmth / Math.max(1, count), light: light / Math.max(1, count), clutter: clutter / Math.max(1, count) };
}
