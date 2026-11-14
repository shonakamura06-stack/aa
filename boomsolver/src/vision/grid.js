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

// ============================================================
// Estimador por DAMERO (v2)
// ============================================================
// POR QUÉ OTRA VEZ
// ---------------
// `estimateRealGrid` de arriba busca juntas entre dos tonos elegidos por
// cobertura y luego cuenta casillas con un perfil de cobertura. Sobre las 13
// capturas reales eso da 2 aciertos de 13: mide bien el paso pero cuenta mal, y
// a veces elige como "tono de suelo" una franja del marco.
//
// Lo que sí es cierto en TODAS las capturas del juego:
//   · el suelo es un damero de DOS tonos planos, y son los dos colores más
//     frecuentes de la imagen (35-95 % de los píxeles entre los dos);
//   · entre dos casillas contiguas SIEMPRE hay un cambio de tono: si el damero
//     es A/B alternando, cruzar una frontera cambia de tono, y cruzar una
//     casilla entera vuelve al mismo. Eso hace que la señal de "transiciones"
//     tenga exactamente UN pico por casilla;
//   · todo lo que no es uno de esos dos tonos es objeto, marco o terreno, y se
//     descarta. No hace falta estimar el suelo por saturación (en p11 el suelo
//     es verde saturado y en p03 beige pálido: un umbral de saturación no vale
//     para los dos).
//
// MÉTODO
// ------
//   1. Dos tonos dominantes (cuantizando a 3 bits) que disten entre sí.
//   2. Etiqueta por píxel: 0 = tono A, 1 = tono B, 2 = otra cosa.
//   3. Perfil de transiciones 0↔1 a lo largo de cada eje.
//   4. Paso = período de ese perfil por autocorrelación, quedándose con el
//      período MÁS PEQUEÑO que alcanza el 90 % del máximo (el armónico doble
//      puntúa igual de bien y es el error clásico).
//   5. Fase = mediana circular de (posición de cada pico mod paso).
//
// Devuelve `null` si la señal es demasiado débil: mejor no dar rejilla que
// inventarla.
export function estimateGridFromFloor(data, width, height, { minPitch = 40, maxPitch = 120 } = {}) {
  const n = width * height;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
  }

  // 1. Dos tonos dominantes, cuantizando a 3 bits por canal.
  const hist = new Map();
  for (let i = 0; i < n; i++) {
    const key = (rgb[i * 3] >> 3) * 1024 + (rgb[i * 3 + 1] >> 3) * 32 + (rgb[i * 3 + 2] >> 3);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  // No vale con «los dos colores más frecuentes»: en p09 el color más frecuente
  // es el MARCO (29 %) y los dos tonos del suelo son el 2.º y el 3.º (15 % y
  // 12 %). Así que se prueban las parejas de los N colores más frecuentes y se
  // elige la que produce un perfil de transiciones más limpio (ver más abajo).
  const ranked = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const candidatos = [];
  for (const [key, count] of ranked) {
    const r = ((key / 1024) | 0) * 8 + 4;
    const g = (((key / 32) | 0) % 32) * 8 + 4;
    const b = (key % 32) * 8 + 4;
    if (candidatos.every((t) => Math.abs(t.r - r) + Math.abs(t.g - g) + Math.abs(t.b - b) > 14)) {
      candidatos.push({ r, g, b, count });
    }
    if (candidatos.length === 6) break;
  }
  if (candidatos.length < 2) return null;
  let tones = null;

  // 2. Etiqueta por píxel para una pareja de tonos dada.
  const etiquetar = (par) => {
    const lab = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let best = 2, bestD = 26;
      for (let k = 0; k < 2; k++) {
        const t = par[k];
        const d = Math.abs(rgb[i * 3] - t.r) + Math.abs(rgb[i * 3 + 1] - t.g) + Math.abs(rgb[i * 3 + 2] - t.b);
        if (d < bestD) { bestD = d; best = k; }
      }
      lab[i] = best;
    }
    return lab;
  };

  // 3. Perfil de transiciones por eje (para una etiqueta dada).
  //    Además del perfil se devuelve la COBERTURA de cada columna/fila: qué
  //    fracción de sus píxeles es suelo. Hace falta porque una columna que
  //    cruza un objeto tiene 2 píxeles de suelo y uno de ellos cambia de tono,
  //    y eso puntúa 0,5 como si fuera una frontera de casilla. Sin cobertura,
  //    la fase se llena de picos falsos dentro del arte.
  const profileDe = (label) => (axis) => {
    const N = axis === 'x' ? width : height;
    const M = axis === 'x' ? height : width;
    const prof = new Float32Array(N);
    const cov = new Float32Array(N);
    for (let t = 1; t < N; t++) {
      let changes = 0, total = 0;
      for (let q = 0; q < M; q++) {
        const cur = axis === 'x' ? label[q * width + t] : label[t * width + q];
        const prev = axis === 'x' ? label[q * width + (t - 1)] : label[(t - 1) * width + q];
        if (cur === 2 || prev === 2) continue;
        if (cur !== prev) changes++;
        total++;
      }
      prof[t] = total ? changes / total : 0;
      cov[t] = total / M;
    }
    return { prof, cov };
  };

  // 4. Paso por autocorrelación, prefiriendo el período fundamental.
  const period = (prof) => {
    const lags = [];
    for (let p = minPitch; p <= maxPitch; p += 0.5) {
      let s = 0;
      for (let i = 0; i + Math.round(p) < prof.length; i++) s += prof[i] * prof[i + Math.round(p)];
      lags.push({ p, s });
    }
    if (!lags.length) return null;
    const best = Math.max(...lags.map((l) => l.s));
    if (best <= 0) return null;
    const first = lags.find((l) => l.s >= best * 0.9);
    return first ? first.p : null;
  };

  // 5. Fase: media circular de los residuos, PONDERADA por cuánta evidencia
  //    aporta cada pico (contraste × cobertura) y descartando los que caen en
  //    columnas casi tapadas por objetos.
  const phase = ({ prof, cov }, pitch, minCov = 0.35) => {
    const sorted = [...prof].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const peaks = [];
    for (let t = 1; t < prof.length - 1; t++) {
      if (cov[t] < minCov) continue;
      if (prof[t] > med * 2.5 && prof[t] >= prof[t - 1] && prof[t] >= prof[t + 1]) {
        peaks.push({ t, w: prof[t] * cov[t] });
      }
    }
    if (peaks.length < 3) return null;
    const wrap = (v) => ((v % pitch) + pitch) % pitch;
    const ref = wrap(peaks[0].t);
    const deltas = peaks
      .map(({ t, w }) => {
        let d = wrap(t) - ref;
        d = ((d + pitch / 2) % pitch + pitch) % pitch - pitch / 2;
        return { d, w };
      })
      .sort((a, b) => a.d - b.d);
    // Media circular: se recorre acumulando peso hasta la mitad del total.
    const totalW = deltas.reduce((a, x) => a + x.w, 0);
    let acc = 0, mediana = deltas[0].d;
    for (const x of deltas) {
      acc += x.w;
      if (acc >= totalW / 2) { mediana = x.d; break; }
    }
    // Residuo: cuánto se apartan los picos del ajuste (mediana de |δ - mediana|).
    const residuo = deltas
      .map((x) => Math.abs(x.d - mediana))
      .sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
    return { x: wrap(ref + mediana), peaks: peaks.length, residuo };
  };

  // 5b. Ajuste fino de la retícula por mínimos cuadrados sobre los picos:
  //     t_k ≈ o + k·L. La autocorrelación da un período con la resolución de su
  //     rejilla de lags (0,5 px) y ese error se ACUMULA: con 8 casillas, medio
  //     píxel por casilla son 4 px en el borde. Los picos, en cambio, están en
  //     las fronteras de verdad, así que una recta ajustada a ellos es mucho más
  //     fina. Se pondera por contraste × cobertura y se exige que el ajuste no
  //     se aleje más de un 8 % del período medido por autocorrelación: si se
  //     aleja, ha enganchado un armónico y se descarta.
  const latticeFit = (pr, pitch0, minCov = 0.35) => {
    const { prof, cov } = pr;
    const sorted = [...prof].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const peaks = [];
    for (let t = 1; t < prof.length - 1; t++) {
      if (cov[t] < minCov) continue;
      if (prof[t] > med * 2.5 && prof[t] >= prof[t - 1] && prof[t] >= prof[t + 1]) {
        peaks.push({ t, w: prof[t] * cov[t] });
      }
    }
    if (peaks.length < 3) return null;
    const wrap = (v, L) => ((v % L) + L) % L;
    // Fase de partida: media circular ponderada respecto de un pico de ancla.
    const ref = peaks[0].t;
    const ds = peaks
      .map(({ t, w }) => {
        let d = wrap(t, pitch0) - wrap(ref, pitch0);
        d = ((d + pitch0 / 2) % pitch0 + pitch0) % pitch0 - pitch0 / 2;
        return { t, w, d };
      })
      .sort((a, b) => a.d - b.d);
    const totalW = ds.reduce((a, x) => a + x.w, 0);
    let acc = 0, md = ds[0].d;
    for (const x of ds) { acc += x.w; if (acc >= totalW / 2) { md = x.d; break; } }
    let o = ref + md, L = pitch0;
    const asignar = (oo, LL) => peaks
      .map((p) => ({ ...p, k: Math.round((p.t - oo) / LL) }))
      .filter((p) => Math.abs(p.t - (oo + p.k * LL)) < LL * 0.3);
    for (let it = 0; it < 4; it++) {
      const pts = asignar(o, L);
      if (pts.length < 3) break;
      const sw = pts.reduce((a, p) => a + p.w, 0);
      const kbar = pts.reduce((a, p) => a + p.w * p.k, 0) / sw;
      const tbar = pts.reduce((a, p) => a + p.w * p.t, 0) / sw;
      let num = 0, den = 0;
      for (const p of pts) { num += p.w * (p.k - kbar) * (p.t - tbar); den += p.w * (p.k - kbar) ** 2; }
      if (den <= 0) break;
      L = num / den;
      o = tbar - kbar * L;
    }
    if (!Number.isFinite(L) || L <= 0) return null;
    if (Math.abs(L - pitch0) > pitch0 * 0.08) return null;
    return { o, L, peaks: asignar(o, L).length };
  };

  // 2b. Elegir la pareja de tonos puntuando LA REJILLA QUE PRODUCE, no la forma
  // del perfil. Una pareja mala (suelo + marco, o suelo + objeto) también da
  // picos, pero en posiciones que no se repiten con un período limpio: lo que
  // distingue es que el período explique TODAS las casillas y que el número de
  // picos cuadre con el tamaño de la imagen.
  let mejor = null;
  for (let a = 0; a < candidatos.length; a++) {
    for (let b = a + 1; b < candidatos.length; b++) {
      const par = [candidatos[a], candidatos[b]];
      const share = (par[0].count + par[1].count) / n;
      if (share < 0.20) continue;
      const pr = profileDe(etiquetar(par));
      const fx = pr('x'), fy = pr('y');
      const px = period(fx.prof), py = period(fy.prof);
      if (!px || !py) continue;
      if (Math.abs(px - py) > Math.max(px, py) * 0.08) continue;
      const cellA = (px + py) / 2;
      const phaseX = phase(fx, cellA), phaseY = phase(fy, cellA);
      if (!phaseX || !phaseY) continue;
      // El tablero puede acabar ANTES del borde de la captura (p05 tiene una
      // fila de suelo negro al pie, fuera del tablero): no se redondea
      // height/paso, se prueban las alturas enteras que caben y se queda la que
      // mejor puntúa. El ancho sí suele llegar al borde, pero se prueba igual.
      const alturas = [Math.floor(height / cellA), Math.ceil(height / cellA)].filter((v) => v >= 2 && v <= 30);
      const anchos = [Math.floor(width / cellA), Math.ceil(width / cellA)].filter((v) => v >= 2 && v <= 30);
      let colsA = 0, rowsA = 0, mejorCoherencia = -1;
      for (const cc of anchos) {
        for (const rr of alturas) {
          const cohX = 1 - Math.min(1, Math.abs(phaseX.peaks - (cc + 1)) / (cc + 1));
          const cohY = 1 - Math.min(1, Math.abs(phaseY.peaks - (rr + 1)) / (rr + 1));
          if ((cohX + cohY) / 2 > mejorCoherencia) { mejorCoherencia = (cohX + cohY) / 2; colsA = cc; rowsA = rr; }
        }
      }
      if (colsA < 2 || rowsA < 2) continue;
      // Calidad: ¿los picos están donde dice el período?
      //   · nº de picos ≈ nº de fronteras esperadas (±25 %)
      //   · residuo del ajuste de fase, en fracción de casilla
      const esperadosX = colsA + 1, esperadosY = rowsA + 1;
      const coherenciaX = 1 - Math.min(1, Math.abs(phaseX.peaks - esperadosX) / esperadosX);
      const coherenciaY = 1 - Math.min(1, Math.abs(phaseY.peaks - esperadosY) / esperadosY);
      const coherencia = (coherenciaX + coherenciaY) / 2;
      const ajuste = 1 - Math.min(1, (phaseX.residuo + phaseY.residuo) / (cellA * 0.6));
      const score = coherencia * ajuste;
      if (!mejor || score > mejor.score) mejor = { score, par, share, fx, fy, px, py, cellA, phaseX, phaseY, colsA, rowsA };
    }
  }
  if (!mejor) return null;
  tones = mejor.par;
  const share = mejor.share;
  const profX = mejor.fx;
  const profY = mejor.fy;
  const pitchX = mejor.px;
  const pitchY = mejor.py;
  if (!pitchX || !pitchY) return null;
  // El tablero del juego es de casillas cuadradas: si los dos ejes no coinciden
  // es que uno de los dos ha enganchado un armónico, y entonces no se inventa.
  if (Math.abs(pitchX - pitchY) > Math.max(pitchX, pitchY) * 0.08) return null;
  let cell = (pitchX + pitchY) / 2;
  let phaseX = phase(profX, cell);
  let phaseY = phase(profY, cell);
  if (!phaseX || !phaseY) return null;
  // Ajuste fino con los picos. Sólo se acepta si los DOS ejes lo consiguen y el
  // resultado sigue siendo un damero de casillas cuadradas; si no, se queda el
  // período de la autocorrelación, que ya valida por sí solo.
  const fitX = latticeFit(profX, cell);
  const fitY = latticeFit(profY, cell);
  const ajuste = fitX && fitY && Math.abs(fitX.L - fitY.L) <= Math.max(fitX.L, fitY.L) * 0.06
    ? { x: fitX, y: fitY, L: (fitX.L + fitY.L) / 2 }
    : null;
  // La fase se recalcula con el paso afinado: es el que se va a usar.
  if (ajuste) {
    cell = ajuste.L;
    phaseX = phase(profX, cell);
    phaseY = phase(profY, cell);
    if (!phaseX || !phaseY) return null;
  }

  const cols = Math.round(width / cell);
  const rows = Math.round(height / cell);
  if (cols < 2 || rows < 2) return null;
  // Cuánto sobra a los lados: si no cabe un número entero de casillas, la
  // captura incluye parte del marco y la fase absorbe el resto.
  const residX = Math.abs(width - cols * cell);
  const residY = Math.abs(height - rows * cell);
  const confidence = Math.max(0, Math.min(1,
    (share - 0.2) * 1.2
    * (1 - residX / cell * 0.5)
    * (1 - residY / cell * 0.5)
    * Math.min(1, Math.min(phaseX.peaks, phaseY.peaks) / 10),
  ));

  // La fase es modular: `o` y `o - L` describen la MISMA rejilla. Se
  // canonicaliza a (-L/2, L/2] para que el origen sea el borde de casilla más
  // cercano al (0,0) de la captura. Sin esto, un origen de 74 con lado 74,5 se
  // leería como "una casilla desplazada" y todas las casillas caerían fuera.
  const canon = (o) => {
    let v = ((o % cell) + cell) % cell;
    if (v > cell / 2) v -= cell;
    return v;
  };
  // Con ajuste, el origen sale de la recta t ≈ o + k·L (mucho más exacto que la
  // media de residuos cuando el paso medido tenía deriva).
  const originX = ajuste ? ajuste.x.o : phaseX.x;
  const originY = ajuste ? ajuste.y.o : phaseY.x;
  return {
    origin: { x: canon(originX), y: canon(originY) },
    pitch: { x: cell, y: cell },
    cols,
    rows,
    cell,
    afinado: Boolean(ajuste),
    confidence: Number(confidence.toFixed(3)),
    floorShare: Number(share.toFixed(3)),
    tones: tones.map((t) => [t.r, t.g, t.b]),
    peaks: { x: phaseX.peaks, y: phaseY.peaks },
    warnings: residX > cell * 0.35 || residY > cell * 0.35
      ? ['la captura incluye parte del marco: sobran píxeles a los lados']
      : [],
  };
}
