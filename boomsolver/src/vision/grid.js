// ============================================================
// BoomSolver — rejilla de CAPTURAS REALES (Fase 2.1)
// ============================================================
// El estimador de `detector.js` (buildGrid) busca líneas de rejilla: funciona en
// las imágenes sintéticas, que las dibujan, y falla en el juego real, que NO las
// tiene. En el juego real la cuadrícula se ve sólo como un **damero** de dos
// tonos de suelo muy próximos (p. ej. 250,235,194 y 236,213,158: distancia 44) y
// a veces ni eso, porque el tema es oscuro y el contraste cae a ~15.
//
// Este módulo mide tres cosas y sólo acepta la rejilla si las tres coinciden:
//
//   1. TONOS: la pareja de colores dominantes DENTRO de la región del tablero
//      que forma un damero (dos tonos claros y próximos entre sí).
//   2. PASO: la distancia entre JUNTAS consecutivas del damero. Una junta es el
//      borde entre dos casillas de paridad distinta; se detecta porque dos tramos
//      de suelo de tono distinto se tocan. Este criterio no depende del brillo ni
//      del contraste y, a diferencia de medir "rachas", un objeto que tapa una
//      casilla no inventa juntas (los tramos a ambos lados tienen el mismo tono).
//   3. EXTENSIÓN: la zona jugable alrededor de esas juntas, medida con un umbral
//      bajo de cobertura para que un tablero con huecos vacíos siga contando.
//
// Si algo no cuadra se devuelve `null`: es preferible no dar rejilla que dar una
// rejilla inventada. El módulo es puro (recibe RGBA + región) y no toca el DOM.

function px(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function dist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function luminance(p) {
  return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
}

/** Tonos dominantes dentro de una región, cuantizados a 3 bits por canal. */
export function dominantTones(data, w, region, { minShare = 0.02 } = {}) {
  const { x0, y0, x1, y1 } = region;
  const hist = new Map();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = px(data, w, x, y);
      const k = `${p[0] >> 3},${p[1] >> 3},${p[2] >> 3}`;
      const e = hist.get(k) || [0, 0, 0, 0];
      e[0] += p[0]; e[1] += p[1]; e[2] += p[2]; e[3]++;
      hist.set(k, e);
    }
  }
  const total = (x1 - x0 + 1) * (y1 - y0 + 1);
  return [...hist.values()]
    .filter((e) => e[3] > total * minShare)
    .map((e) => ({
      color: [Math.round(e[0] / e[3]), Math.round(e[1] / e[3]), Math.round(e[2] / e[3])],
      share: e[3] / total,
    }))
    .sort((a, b) => b.share - a.share);
}

/**
 * Banda más larga donde la cobertura supera `minCov`, tolerando huecos de hasta
 * `maxGap` índices. Los objetos y los cables tapan franjas enteras del tablero,
 * así que exigir una banda sin interrupciones dejaba fuera los tableros densos.
 */
export function longestBand(cov, offset, { minCov = 0.5, maxGap = 42 } = {}) {
  const spans = [];
  let start = -1;
  let lastOk = -1;
  for (let i = 0; i < cov.length; i++) {
    if (cov[i] >= minCov) {
      if (start < 0) start = i;
      lastOk = i;
    } else if (start >= 0 && i - lastOk > maxGap) {
      spans.push({ start, end: lastOk });
      start = -1;
    }
  }
  if (start >= 0) spans.push({ start, end: lastOk });
  if (!spans.length) return null;
  const best = spans.reduce((a, b) => ((b.end - b.start) > (a.end - a.start) ? b : a));
  return { start: offset + best.start, end: offset + best.end, len: best.end - best.start + 1 };
}

/**
 * Posiciones de las juntas del damero.
 *
 * Una junta es el borde entre dos casillas de PARIDAD DISTINTA. La regla que se
 * usa aquí no depende del brillo ni del contraste, sólo de que el damero existe:
 *
 *   una junta está donde dos tramos de suelo de tonos DISTINTOS se tocan, con un
 *   hueco de pocos píxeles como mucho.
 *
 * Al recorrer una fila, las casillas contiguas siempre tienen paridad distinta,
 * así que cada borde de columna produce exactamente un salto de tono. Si un
 * objeto tapa una casilla, el tramo se rompe: los tramos que quedan a los lados
 * del objeto tienen el MISMO tono, y por tanto no se confunden con una junta.
 * Esa es la diferencia con medir "rachas": aquí un objeto no inventa juntas.
 */
export function seamPositions(data, w, box, toneA, toneB, { tol, mode, step = 3, maxGap = 18 } = {}) {
  const { x0, y0, x1, y1 } = box;
  const horizontal = mode === 'row';
  const outerStart = horizontal ? x0 : y0;
  const outerEnd = horizontal ? x1 : y1;
  const innerStart = (horizontal ? y0 : x0) + 4;
  const innerEnd = (horizontal ? y1 : x1) - 3;
  const classify = (p) => {
    const da = dist(p, toneA);
    const db = dist(p, toneB);
    if (da <= tol && da < db) return 1;
    if (db <= tol) return -1;
    return 0;
  };
  const histogram = new Map();
  let lines = 0;
  for (let k = innerStart; k < innerEnd; k += step) {
    lines++;
    const runs = [];
    let cur = 0;
    let from = 0;
    for (let i = outerStart; i <= outerEnd + 1; i++) {
      const v = i <= outerEnd
        ? classify(horizontal ? px(data, w, i, k) : px(data, w, k, i))
        : 0;
      if (v !== cur) {
        if (cur !== 0) runs.push({ v: cur, from, to: i - 1 });
        cur = v;
        from = i;
      }
    }
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1];
      const b = runs[i];
      if (a.v === b.v) continue;
      if (b.from - a.to - 1 > maxGap) continue;
      const pos = Math.round((a.to + b.from) / 2);
      histogram.set(pos, (histogram.get(pos) || 0) + 1);
    }
  }
  // Máximos locales del histograma de juntas (ventana ±2 px) por encima del ruido.
  const positions = [...histogram.keys()].sort((a, b) => a - b);
  const threshold = Math.max(2, Math.round(lines * 0.06));
  const seams = [];
  for (const pos of positions) {
    const here = histogram.get(pos);
    if (here < threshold) continue;
    let isMax = true;
    for (let d = -2; d <= 2 && isMax; d++) {
      if (d !== 0 && (histogram.get(pos + d) || 0) > here) isMax = false;
    }
    if (isMax) seams.push({ pos, weight: here });
  }
  // Supresión de no-máximos: dos picos a menos de 6 px son la misma junta.
  seams.sort((a, b) => b.weight - a.weight);
  const kept = [];
  for (const s of seams) {
    if (kept.some((k) => Math.abs(k.pos - s.pos) < 6)) continue;
    kept.push(s);
  }
  return kept.sort((a, b) => a.pos - b.pos);
}

/**
 * Retícula de un eje: paso por la mediana de los huecos entre juntas y origen
 * por mínimos cuadrados (posición de junta = origen + k·paso). Devuelve también
 * el tramo contiguo de juntas que encaja, que es el que sostiene el resultado.
 */
export function latticeFromSeams(seams) {
  if (seams.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < seams.length; i++) gaps.push(seams[i].pos - seams[i - 1].pos);
  const pitch = median(gaps);
  if (!(pitch > 30)) return null;
  const tolGap = Math.max(5, pitch * 0.12);
  // Se queda con la cadena de juntas consecutivas más larga con huecos ≈ paso.
  let bestChain = null;
  let chain = [seams[0]];
  for (let i = 1; i < seams.length; i++) {
    const gap = seams[i].pos - seams[i - 1].pos;
    if (Math.abs(gap - pitch) <= tolGap) chain.push(seams[i]);
    else {
      if (!bestChain || chain.length > bestChain.length) bestChain = chain;
      chain = [seams[i]];
    }
  }
  if (!bestChain || chain.length > bestChain.length) bestChain = chain;
  if (bestChain.length < 2) return null;
  // Ajuste lineal posición = a + b·k (k = índice de junta relativo).
  const k0 = 0;
  let sk = 0, sx = 0, skk = 0, skx = 0;
  bestChain.forEach((s, i) => {
    sk += i; sx += s.pos; skk += i * i; skx += i * s.pos;
  });
  const m = bestChain.length;
  const den = m * skk - sk * sk;
  const slope = den ? (m * skx - sk * sx) / den : pitch;
  const intercept = (sx - slope * sk) / m;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept) || slope <= 0) return null;
  const fitted = bestChain.map((s, i) => Math.abs(intercept + slope * i - s.pos));
  const maxErr = Math.max(...fitted);
  return {
    pitch: slope,
    origin: intercept - slope * k0,
    firstSeam: intercept,
    lastSeam: intercept + slope * (m - 1),
    seams: m,
    maxErr: Number(maxErr.toFixed(1)),
    weight: bestChain.reduce((a, s) => a + s.weight, 0),
  };
}

/** Cobertura de la pareja de tonos por columna (mode 'col') o por fila. */
function coverageProfile(data, w, region, toneA, toneB, tol, mode) {
  const { x0, y0, x1, y1 } = region;
  const horizontal = mode === 'row';
  const len = horizontal ? x1 - x0 + 1 : y1 - y0 + 1;
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    let n = 0;
    for (let j = horizontal ? y0 : x0; j <= (horizontal ? y1 : x1); j++) {
      const p = horizontal ? px(data, w, x0 + i, j) : px(data, w, j, y0 + i);
      if (dist(p, toneA) <= tol || dist(p, toneB) <= tol) n++;
    }
    out[i] = n / (horizontal ? y1 - y0 + 1 : x1 - x0 + 1);
  }
  return out;
}

/**
 * Cobertura del damero por casilla de un eje.
 *
 * Con la retícula ya ajustada (origen y paso), cada casilla de la zona jugable
 * tiene que estar MAYORITARIAMENTE cubierta por los dos tonos del suelo. Un
 * objeto tapa parte de una casilla, no toda; una casilla que se sale del tablero
 * (marco, zona sombreada) pierde casi toda la cobertura. Por eso el criterio es
 * "sigue habiendo suelo", con un umbral bajo, y no "está limpia".
 */
function cellCoverage(profile, offset, origin, pitch, count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const a = Math.max(0, Math.round(origin + k * pitch) - offset);
    const b = Math.min(profile.length - 1, Math.round(origin + (k + 1) * pitch) - offset - 1);
    if (b < a) { out.push(0); continue; }
    let sum = 0;
    for (let i = a; i <= b; i++) sum += profile[i];
    out.push(sum / (b - a + 1));
  }
  return out;
}

/**
 * Número de casillas de un eje. Dos criterios tienen que coincidir:
 *   · la cobertura del damero en cada casilla (se corta al salir del tablero),
 *   · el tamaño del recorte (la captura se hizo con ese número de casillas).
 * Si no coinciden, se devuelve `null`: mejor no dar rejilla que inventarla.
 */
function countCells(profile, offset, origin, pitch, { minCover = 0.12, maxCells = 14, limit, expected }) {
  const cov = cellCoverage(profile, offset, origin, pitch, maxCells);
  let byCover = 0;
  for (let k = 0; k < maxCells; k++) {
    const cellStart = origin + k * pitch;
    if (cellStart + pitch > limit + 2) break;
    if (cov[k] < minCover) break;
    byCover++;
  }
  if (byCover < 3) return null;
  if (expected && byCover !== expected) return null;
  return byCover;
}

/**
 * Rejilla de una captura real.
 *
 * Pasos: elegir la pareja de tonos que forma damero → medir juntas en los dos
 * ejes → ajustar retícula (paso + origen) → delimitar la zona jugable y contar
 * casillas. Devuelve `null` si las piezas no encajan: es preferible no dar
 * rejilla a inventarla.
 */
export function estimateRealGrid(data, w, region) {
  if (region === undefined) {
    region = w;
    w = region.width || (region.x1 - region.x0 + 1);
  }
  const tones = dominantTones(data, w, region);
  let best = null;
  for (let a = 0; a < tones.length; a++) {
    for (let b = a + 1; b < tones.length; b++) {
      const A = tones[a].color;
      const B = tones[b].color;
      const dd = dist(A, B);
      if (dd < 12 || dd > 70) continue;
      const tol = Math.max(8, dd * 0.3);
      const seamsX = seamPositions(data, w, region, A, B, { tol, mode: 'row' });
      const seamsY = seamPositions(data, w, region, A, B, { tol, mode: 'col' });
      const latX = latticeFromSeams(seamsX);
      const latY = latticeFromSeams(seamsY);
      if (!latX || !latY) continue;
      if (latX.seams < 3 || latY.seams < 3) continue;
      const squareness = Math.abs(latX.pitch - latY.pitch) / Math.max(latX.pitch, latY.pitch);
      if (squareness > 0.12) continue;
      const colCov = coverageProfile(data, w, region, A, B, tol, 'col');
      const rowCov = coverageProfile(data, w, region, A, B, tol, 'row');
      const originX = latX.firstSeam - latX.pitch;
      const originY = latY.firstSeam - latY.pitch;
      // El recorte se hizo casilla a casilla: si el tablero no empieza en el
      // borde de la imagen, esa diferencia también es información.
      const expectedCols = region.cols || Math.round((region.x1 - region.x0 + 1) / latX.pitch);
      const expectedRows = region.rows || Math.round((region.y1 - region.y0 + 1) / latY.pitch);
      const cols = countCells(colCov, region.x0, originX, latX.pitch, {
        limit: region.x1, expected: region.cols ? expectedCols : null,
      });
      const rows = countCells(rowCov, region.y0, originY, latY.pitch, {
        limit: region.y1, expected: region.rows ? expectedRows : null,
      });
      if (!cols || !rows) continue;
      const share = tones[a].share + tones[b].share;
      const score = share * 2 + (latX.seams + latY.seams) / 40 - squareness * 3
        - (latX.maxErr + latY.maxErr) / 200;
      if (!best || score > best.score) {
        best = {
          score, tones: [A, B], dd, squareness, share, cols, rows, latX, latY, originX, originY,
          confidence: Number(Math.max(0.3, Math.min(1, 0.34 + score * 0.3)).toFixed(2)),
        };
      }
    }
  }
  if (!best) return null;
  const boxX1 = Math.min(w - 1, Math.round(best.originX + best.cols * best.latX.pitch) - 1);
  return {
    cols: best.cols,
    rows: best.rows,
    cell: Number(((best.latX.pitch + best.latY.pitch) / 2).toFixed(1)),
    box: {
      x0: Math.round(best.originX), y0: Math.round(best.originY), x1: boxX1,
      y1: Math.round(best.originY + best.rows * best.latY.pitch) - 1,
    },
    origin: { x: Number(best.originX.toFixed(1)), y: Number(best.originY.toFixed(1)) },
    pitch: { x: Number(best.latX.pitch.toFixed(2)), y: Number(best.latY.pitch.toFixed(2)) },
    squareness: Number(best.squareness.toFixed(3)),
    tone: { colors: best.tones, distance: Math.round(best.dd), share: Number(best.share.toFixed(3)) },
    seams: { x: best.latX.seams, y: best.latY.seams },
    maxError: Number(Math.max(best.latX.maxErr, best.latY.maxErr).toFixed(1)),
    confidence: best.confidence,
  };
}

/** Limites de cada casilla a partir de una rejilla estimada. */
export function gridCellBoxes(grid) {
  const { origin, pitch, cols, rows } = grid;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        x0: Math.round(origin.x + c * pitch.x),
        y0: Math.round(origin.y + r * pitch.y),
        x1: Math.round(origin.x + (c + 1) * pitch.x) - 1,
        y1: Math.round(origin.y + (r + 1) * pitch.y) - 1,
      });
    }
    out.push(row);
  }
  return out;
}
