// ============================================================
// BoomSolver — reconocimiento de capturas
// ============================================================
// Canalización por etapas separadas y auditables:
//   1. detectBoardRegion   → área del tablero y perspectiva
//   2. buildGrid           → filas, columnas y límites de cada casilla
//   3. normalize           → brillo/contraste y recorte
//   4. classifyCell        → varias señales (color, silueta, textura, detalles)
//   5. readTimer           → número del géiser restringido a su casilla
//   6. readTray            → inventario de bombas por separado
//   7. reconstructLinks    → cables detonador ↔ dinamita, parejas de portal
//   8. buildBoardState     → estado revisable por el usuario
//
// Principio: NUNCA forzar una clasificación dudosa. Cada casilla devuelve
// clase + confianza + alternativas + evidencia + estado
// (confirmed | needs_review | unknown).
//
// El detector es puro: recibe un TypedArray RGBA y devuelve datos. No toca el
// DOM ni depende del motor, así que se puede probar con imágenes sintéticas.

import { OBJECTS, getObject } from '../core/catalog.js';

export const REVIEW = { CONFIRMED: 'confirmed', NEEDS_REVIEW: 'needs_review', UNKNOWN: 'unknown' };

// ------------------------------------------------------------
// Utilidades de imagen
// ------------------------------------------------------------
function rgbAt(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function toHsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** 1. Detecta el marco del tablero (región con textura de casillas). */
export function detectBoardRegion(data, w, h) {
  // Histograma de "pixel de suelo": colores tierra/verde, no UI oscura.
  const rowScore = new Float64Array(h);
  const colScore = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = rgbAt(data, w, x, y);
      const [hh, s, v] = toHsv(r, g, b);
      const isFloor = v > 0.25 && v < 0.95 && s > 0.12 && s < 0.85
        && ((hh > 15 && hh < 45) || (hh > 70 && hh < 160) || (hh > 190 && hh < 260));
      if (isFloor) { rowScore[y]++; colScore[x]++; }
    }
  }
  const rowThresh = w * 0.18;
  const colThresh = h * 0.18;
  const anyRow = Array.from(rowScore).some((v) => v > rowThresh);
  const anyCol = Array.from(colScore).some((v) => v > colThresh);
  if (!anyRow || !anyCol) {
    return { x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0, aspect: 0, confidence: 0,
      warnings: ['No se ha encontrado el área del tablero: la imagen no parece contener un tablero de este juego.'] };
  }
  let y0 = 0, y1 = h - 1, x0 = 0, x1 = w - 1;
  for (let y = 0; y < h; y++) if (rowScore[y] > rowThresh) { y0 = y; break; }
  for (let y = h - 1; y >= 0; y--) if (rowScore[y] > rowThresh) { y1 = y; break; }
  for (let x = 0; x < w; x++) if (colScore[x] > colThresh) { x0 = x; break; }
  for (let x = w - 1; x >= 0; x--) if (colScore[x] > colThresh) { x1 = x; break; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const confidence = clamp01(((bw * bh) / (w * h) - 0.05) * 3);
  return {
    x0, y0, x1, y1, width: bw, height: bh,
    aspect: bh / Math.max(1, bw),
    confidence,
    warnings: bw < w * 0.4 ? ['La región del tablero es pequeña: podría estar recortada.'] : [],
  };
}

/** 2. Estima filas y columnas a partir de la separación real entre bordes. */
export function buildGrid(data, w, gridRegion) {
  const { x0, y0, x1, y1 } = gridRegion;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const lum = new Float64Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const [r, g, b] = rgbAt(data, w, x0 + x, y0 + y);
      lum[y * bw + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  // Energía de borde vertical (entre columnas) y horizontal (entre filas).
  // Se mide en COLOR, no en luminancia: dos casillas distintas (p. ej. suelo y
  // gema) pueden tener brillo casi idéntico y aun así ser un borde evidente.
  const rgb = new Float64Array(bw * bh * 3);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const [r, g, b] = rgbAt(data, w, x0 + x, y0 + y);
      const o = (y * bw + x) * 3;
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    }
  }
  const colorDist = (i, j) => {
    const dr = rgb[i * 3] - rgb[j * 3];
    const dg = rgb[i * 3 + 1] - rgb[j * 3 + 1];
    const db = rgb[i * 3 + 2] - rgb[j * 3 + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  const colEdge = new Float64Array(bw);
  const rowEdge = new Float64Array(bh);
  for (let x = 1; x < bw; x++) {
    let s = 0;
    for (let y = 0; y < bh; y++) s += colorDist(y * bw + x, y * bw + x - 1);
    colEdge[x] = s / bh;
  }
  for (let y = 1; y < bh; y++) {
    let s = 0;
    for (let x = 0; x < bw; x++) s += colorDist(y * bw + x, (y - 1) * bw + x);
    rowEdge[y] = s / bw;
  }

  // Las casillas del juego son CUADRADAS: en lugar de estimar filas y columnas
  // por separado (donde un eje con poca señal se equivoca), se busca el lado de
  // casilla `s` que mejor explica los bordes en los dos ejes a la vez. Así una
  // fila llena de suelo liso no puede arrastrar la estimación.
  const fit = squareCellFit(colEdge, rowEdge, bw, bh);
  let cols = Math.max(1, Math.round(bw / fit.side));
  let rows = Math.max(1, Math.round(bh / fit.side));
  // Si los dos ejes dan un tamaño de casilla muy distinto, se respeta el eje
  // fiable y se deriva el otro: sigue siendo rejilla cuadrada.
  if (cols > 30 || rows > 30) {
    const side = Math.min(bw, bh) / 6;
    cols = Math.max(1, Math.round(bw / side));
    rows = Math.max(1, Math.round(bh / side));
  }
  const cellW = bw / cols, cellH = bh / rows;
  const squareness = Math.abs(cellW - cellH) / Math.max(cellW, cellH);

  const warnings = [];
  let confidence = 0.8;
  if (!fit.reliable) {
    confidence = 0.35;
    warnings.push('No se detectaron bordes de casilla con claridad: se asumió un tamaño aproximado. Confirma filas y columnas.');
  }
  if (squareness > 0.18) {
    confidence = Math.min(confidence, 0.4);
    warnings.push('Las casillas no son cuadradas: posible perspectiva, zoom o recorte.');
  }
  if (cellW < 12 || cellH < 12) {
    confidence = Math.min(confidence, 0.3);
    warnings.push('Casillas demasiado pequeñas: aumenta el zoom de la captura.');
  }
  if (cols < 2 || rows < 2) {
    confidence = Math.min(confidence, 0.3);
    warnings.push('Se detectó una sola fila o columna.');
  }

  return {
    cols, rows, cellW, cellH, squareness: round2(squareness),
    cells: { x0, y0, x1, y1 }, confidence, warnings,
    cellSide: fit.side,
    gridFit: {
      ratio: round2(fit.ratio),
      reliable: fit.reliable,
      coverage: round2(fit.coverage || 0),
      peaksExplained: fit.coverage >= 0.995 ? fit.totalPeaks : Math.round(fit.coverage * fit.totalPeaks),
      peaksFound: fit.totalPeaks || 0,
      peaksSeen: fit.totalPeaksAll || fit.totalPeaks || 0,
    },
  };
}

/**
 * Lado de casilla cuadrado que mejor explica los bordes de los DOS ejes.
 *
 * Para cada lado candidato s se mide:
 *   borde  = energía media en los múltiplos de s (debería ser alta)
 *   centro = energía media en los puntos medios (debería ser baja)
 * y se puntúa `borde - 0.6·centro`. No se premia un s pequeño por tener menos
 * cortes que acertar: un s que no es el real cae mal en sus propios centros
 * (los centros de casilla no son bordes) y se queda atrás. Se exige además que
 * la ventaja sobre la mediana sea clara para declarar la rejilla fiable.
 */
function squareCellFit(colEdge, rowEdge, bw, bh) {
  // La casilla es un PERIODO. Método, en tres pasos y sin umbrales mágicos:
  //
  //  1. Bordes candidatos: máximos locales de la energía de borde en cada eje.
  //     Se conservan todos, pero con su intensidad.
  //  2. Bordes FUERTES: los que superan el 45 % del más intenso. Un borde débil
  //     suele ser el contorno de un objeto DENTRO de su casilla, no una junta.
  //  3. Lado de casilla: el MAYOR que explica TODOS los bordes fuertes con
  //     residuo <= 2 px. Se recorre de mayor a menor y se acepta el primero que
  //     encaja: el lado real también explica sus múltiplos, pero un divisor
  //     (20 px cuando las casillas son 40) introduce casillas que no existen.
  const strongPeaks = (signal) => {
    const n = signal.length;
    if (n < 12) return [];
    // Suavizado de 3 px (sólo quita ruido de compresión).
    const smooth = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let a = 0, c = 0;
      for (let d = -1; d <= 1; d++) {
        const j = i + d;
        if (j >= 0 && j < n) { a += signal[j]; c++; }
      }
      smooth[i] = c ? a / c : 0;
    }
    let max = 0;
    for (let i = 0; i < n; i++) max = Math.max(max, smooth[i]);
    if (max <= 0) return [];
    // PROMINENCIA, no altura: se mide cuánto sobresale el máximo frente al fondo
    // local. Es lo que distingue una junta de casilla de una textura repetida
    // (el moteado de la imagen produce un rizo periódico de energía constante
    // que, medido sólo en altura, parecería un borde en cada píxel).
    const prominence = (i) => {
      let lo = Infinity;
      for (let d = -5; d <= 5; d++) {
        const j = i + d;
        if (j >= 0 && j < n) lo = Math.min(lo, smooth[j]);
      }
      return smooth[i] - lo;
    };
    const out = [];
    for (let i = 1; i < n - 1; i++) {
      if (smooth[i] < max * 0.3) continue;
      if (smooth[i] < smooth[i - 1] || smooth[i] < smooth[i + 1]) continue;
      // Se ignoran los bordes del propio recorte (marco exterior).
      if (i < 6 || i > n - 7) continue;
      const w = prominence(i);
      if (out.length && i - out[out.length - 1].pos <= 3) {
        if (w > out[out.length - 1].w) out[out.length - 1] = { pos: i, w };
        continue;
      }
      out.push({ pos: i, w });
    }
    return out.filter((p) => p.w > 0);
  };

  const all = [...strongPeaks(colEdge), ...strongPeaks(rowEdge)];
  const empty = {
    side: Math.max(8, Math.min(bw, bh) / 6), ratio: 0, reliable: false,
    coverage: 0, totalPeaks: all.length,
  };
  if (!all.length) return empty;
  const maxW = Math.max(...all.map((p) => p.w));
  const strong = all.filter((p) => p.w >= maxW * 0.45);
  const totalWeight = strong.reduce((a, p) => a + p.w, 0) || 1;

  const maxSide = Math.min(bw, bh);
  const maxCells = Math.max(bw, bh);
  const sides = [];
  for (let side = 10; side <= maxSide; side++) {
    let covered = 0;
    for (const p of strong) {
      const k = Math.round(p.pos / side);
      if (k >= 1 && Math.abs(p.pos - k * side) <= 2) covered += p.w;
    }
    sides.push({
      side,
      score: covered / totalWeight,
      cols: Math.round(bw / side),
      rows: Math.round(bh / side),
    });
  }
  if (!sides.length) return empty;

  // Rejilla plausible: ni casillas diminutas ni un tablero de más de 30 casillas.
  const plausible = sides.filter((c) => c.cols >= 1 && c.rows >= 1 && maxCells / c.side <= 30);
  const exact = plausible.filter((c) => c.score >= 0.995);
  let best;
  if (exact.length) {
    best = exact[exact.length - 1]; // recorrido de menor a mayor lado
  } else {
    const ranked = plausible.slice().sort((a, b) => (Math.abs(b.score - a.score) > 0.02 ? b.score - a.score : b.side - a.side));
    best = ranked[0] || plausible[plausible.length - 1];
  }
  const others = plausible.filter((c) => Math.abs(c.side - best.side) > 3);
  const baseline = others.length ? others.reduce((a, c) => a + c.score, 0) / others.length : 0;
  const ratio = baseline > 0 ? (best.score + 1) / (baseline + 1) : (best.score > 0 ? 99 : 0);
  return {
    side: best.side,
    score: best.score,
    coverage: best.score,
    totalPeaks: strong.length,
    totalPeaksAll: all.length,
    ratio,
    // Fiable si hay al menos dos juntas fuertes y TODAS encajan en la rejilla.
    reliable: strong.length >= 2 && best.score >= 0.995,
  };
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function clampInt(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** 3. Normalización: corrección de brillo/contraste por casilla. */
export function normalizeCell(data, w, x0, y0, x1, y1) {
  const pixels = [];
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) { pixels.push(rgbAt(data, w, x, y)); n++; }
  }
  if (!n) return { pixels: [], stats: null };
  const mean = [0, 0, 0];
  for (const p of pixels) { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; }
  mean[0] /= n; mean[1] /= n; mean[2] /= n;
  let variance = 0;
  for (const p of pixels) variance += (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2;
  const std = Math.sqrt(variance / (n * 3));
  return { pixels, stats: { mean, std, n } };
}

// ------------------------------------------------------------
// 4. Clasificación con múltiples señales
// ------------------------------------------------------------
// Cada clase define rasgos esperados. Este perfil es una PROPUESTA de partida
// para temas claros (pradera/mina); el usuario debe calibrarlo con capturas
// reales (ver tools/calibrate). No es una verdad del juego.
export const FEATURE_PROFILES = {
  empty: { hue: [25, 45], sat: [0.15, 0.45], val: [0.45, 0.85], texture: [0.02, 0.12] },
  wall: { hue: [15, 35], sat: [0.1, 0.4], val: [0.2, 0.45], texture: [0.05, 0.3] },
  gem: { hue: [190, 215], sat: [0.5, 0.95], val: [0.6, 1.0], texture: [0.1, 0.5] },
  crystal: { hue: [320, 345], sat: [0.35, 0.9], val: [0.55, 1.0], texture: [0.1, 0.5] },
  chest_wood: { hue: [20, 35], sat: [0.5, 0.95], val: [0.4, 0.85], texture: [0.1, 0.45] },
  chest_iron: { hue: [20, 35], sat: [0.3, 0.85], val: [0.3, 0.7], texture: [0.12, 0.5] },
  switch: { hue: [0, 12], sat: [0.6, 1.0], val: [0.5, 1.0], texture: [0.1, 0.5] },
  dynamite: { hue: [0, 10], sat: [0.6, 1.0], val: [0.4, 0.9], texture: [0.15, 0.6] },
  detonator: { hue: [25, 40], sat: [0.4, 0.9], val: [0.3, 0.7], texture: [0.15, 0.6] },
  magma_rock: { hue: [10, 30], sat: [0.5, 1.0], val: [0.25, 0.6], texture: [0.2, 0.7] },
  rock_soft: { hue: [0, 360], sat: [0.0, 0.2], val: [0.5, 0.8], texture: [0.1, 0.4] },
  rock_hard: { hue: [0, 360], sat: [0.0, 0.25], val: [0.2, 0.45], texture: [0.1, 0.45] },
  cat: { hue: [25, 40], sat: [0.6, 1.0], val: [0.7, 1.0], texture: [0.1, 0.5] },
  mirror_slash: { hue: [185, 205], sat: [0.2, 0.7], val: [0.6, 1.0], texture: [0.2, 0.7] },
  mirror_backslash: { hue: [185, 205], sat: [0.2, 0.7], val: [0.6, 1.0], texture: [0.2, 0.7] },
  portal: { hue: [200, 290], sat: [0.4, 1.0], val: [0.4, 1.0], texture: [0.05, 0.4] },
  geyser: { hue: [180, 210], sat: [0.1, 0.6], val: [0.5, 0.95], texture: [0.1, 0.5] },
};

function cellFeatures(cell) {
  const { pixels } = cell;
  if (!pixels.length) return null;
  const hs = [], ss = [], vs = [];
  let gold = 0, silver = 0, cyan = 0, pink = 0, dark = 0, blue = 0, purple = 0, orange = 0, white = 0;
  const lumGrid = [];
  for (const [r, g, b] of pixels) {
    const [h, s, v] = toHsv(r, g, b);
    hs.push(h); ss.push(s); vs.push(v);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lumGrid.push(lum);
    if (r > 170 && g > 120 && b < 90) gold++;
    if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && v > 0.45 && v < 0.85) silver++;
    if (b > 170 && g > 140 && r < 120) cyan++;
    if (r > 180 && b > 140 && g < 140) pink++;
    if (v < 0.28) dark++;
    if (b > 150 && r < 110) blue++;
    if (b > 130 && r > 110 && g < 110) purple++;
    if (r > 200 && g > 110 && g < 190 && b < 100) orange++;
    if (v > 0.92) white++;
  }
  const n = pixels.length;
  // Textura: desviación media de la luminancia frente a suavizado 3x3 aproximado.
  const meanLum = lumGrid.reduce((a, b) => a + b, 0) / n;
  let texture = 0;
  for (let i = 0; i < n; i++) texture += Math.abs(lumGrid[i] - meanLum);
  texture = texture / n / 255;
  // Firma diagonal (para espejos): compara las dos diagonales del recorte.
  const side = Math.round(Math.sqrt(n));
  let diagA = 0, diagB = 0;
  if (side >= 4) {
    for (let i = 0; i < side; i++) {
      diagA += lumGrid[Math.min(n - 1, i * side + i)] || 0;
      diagB += lumGrid[Math.min(n - 1, i * side + (side - 1 - i))] || 0;
    }
    diagA /= side; diagB /= side;
  }
  const median = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1] || 0;
  return {
    hue: median(hs), sat: median(ss), val: median(vs),
    texture,
    gold: gold / n, silver: silver / n, cyan: cyan / n, pink: pink / n, dark: dark / n,
    blue: blue / n, purple: purple / n, orange: orange / n, white: white / n,
    diagA, diagB,
    meanLum,
  };
}

function inRange(v, [lo, hi]) { return v >= lo && v <= hi; }

/** Puntúa cada clase contra los rasgos de la casilla. Devuelve ordenado. */
export function scoreClasses(f) {
  const scores = [];
  for (const [type, p] of Object.entries(FEATURE_PROFILES)) {
    const def = getObject(type);
    if (!def) continue;
    let s = 0;
    let evidence = [];
    let baseMatches = 0;
    if (inRange(f.hue, p.hue)) { s += 0.25; baseMatches++; } else evidence.push(`${type}: tono ${f.hue.toFixed(0)}° fuera de ${p.hue}`);
    if (inRange(f.sat, p.sat)) { s += 0.2; baseMatches++; } else evidence.push(`${type}: saturación ${f.sat.toFixed(2)} fuera`);
    if (inRange(f.val, p.val)) { s += 0.2; baseMatches++; } else evidence.push(`${type}: brillo ${f.val.toFixed(2)} fuera`);
    if (inRange(f.texture, p.texture)) { s += 0.15; baseMatches++; } else evidence.push(`${type}: textura ${f.texture.toFixed(2)} fuera`);
    // Si los rasgos base no encajan, no se puede "confirmar" aunque los
    // matices extra sumen: la clasificación queda en revisión.
    const baseOk = baseMatches >= 4;

    // Señales específicas por objeto (más fiables que el color solo).
    if (type === 'gem' && f.cyan > 0.12) { s += 0.35; evidence.push('zona cian dominante'); }
    if (type === 'crystal' && f.pink > 0.05) { s += 0.3; evidence.push('cristal rosa'); }
    if ((type === 'chest_wood' || type === 'chest_iron') && f.gold > 0.03) { s += 0.2; evidence.push('cerradura dorada'); }
    if (type === 'chest_iron' && f.silver > 0.05) { s += 0.15; evidence.push('refuerzos plateados'); }
    if (type === 'chest_wood' && f.silver > 0.12) { s -= 0.15; }
    if (type === 'detonator' && f.gold < 0.02 && f.dark > 0.1) { s += 0.1; }
    if (type === 'magma_rock' && f.orange > 0.05) { s += 0.25; evidence.push('vetas naranjas de lava'); }
    if (type === 'switch' && f.white > 0.02 && f.pink < 0.02) { s += 0.1; }
    if (type === 'dynamite' && f.orange + f.pink > 0.2) { s += 0.1; }
    if (type === 'cat' && f.orange > 0.18 && f.white > 0.03) { s += 0.25; evidence.push('silueta naranja con hocico claro'); }
    if (type === 'geyser' && f.white > 0.01 && f.blue > 0.05) { s += 0.1; }
    if (type === 'portal' && f.purple > 0.15) { s += 0.25; evidence.push('relleno morado'); }
    if (type === 'portal' && f.blue > 0.15) { s += 0.2; evidence.push('relleno azul'); }
    if ((type === 'mirror_slash' || type === 'mirror_backslash') && Math.abs(f.diagA - f.diagB) < 18) {
      s -= 0.25; evidence.push('sin asimetría diagonal clara');
    }
    if (type === 'mirror_slash' && f.diagA > f.diagB + 22) { s += 0.3; evidence.push('diagonal principal brillante'); }
    if (type === 'mirror_backslash' && f.diagB > f.diagA + 22) { s += 0.3; evidence.push('diagonal secundaria brillante'); }
    if (type === 'empty' && f.texture < 0.05 && f.dark < 0.02) { s += 0.1; evidence.push('superficie uniforme'); }
    if (type === 'wall' && f.texture > 0.12 && f.val < 0.5) { s += 0.1; }

    const finalScore = baseOk ? clamp01(s) : Math.min(clamp01(s), 0.55);
    scores.push({ type, score: finalScore, evidence, baseOk });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

/** Decide el resultado de una casilla con umbrales de incertidumbre explícitos. */
export function classifyCell(cell, { minConfidence = 0.62, minMargin = 0.12 } = {}) {
  const f = cellFeatures(cell);
  if (!f) return { type: 'empty', confidence: 0, alternatives: [], evidence: ['casilla sin píxeles'], status: REVIEW.UNKNOWN, features: null };
  const ranked = scoreClasses(f);
  const top = ranked[0];
  const second = ranked[1];
  const margin = top.score - (second ? second.score : 0);
  let status;
  if (top.score >= minConfidence && margin >= minMargin) status = REVIEW.CONFIRMED;
  else if (top.score >= 0.35) status = REVIEW.NEEDS_REVIEW;
  else status = REVIEW.UNKNOWN;
  return {
    type: status === REVIEW.UNKNOWN ? null : top.type,
    confidence: round2(top.score),
    alternatives: ranked.slice(1, 3).filter((r) => r.score > 0.3).map((r) => ({ type: r.type, confidence: round2(r.score) })),
    evidence: top.evidence.slice(0, 4),
    status,
    margin: round2(margin),
    features: f,
  };
}

// ------------------------------------------------------------
// 5. Temporizadores
// ------------------------------------------------------------
/**
 * Lee el número de un géiser SIEMPRE dentro de los límites de su casilla.
 * `ocrDigits` es una función inyectable para poder probar sin OCR real.
 */
export function readTimer(cell, ocrDigits) {
  if (typeof ocrDigits !== 'function') return { value: null, confidence: 0, status: REVIEW.UNKNOWN, evidence: ['sin OCR disponible'] };
  const raw = ocrDigits(cell);
  const cleaned = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  if (!cleaned) return { value: null, confidence: 0, status: REVIEW.UNKNOWN, evidence: ['sin dígitos en la casilla'] };
  const value = Number(cleaned);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return { value: null, confidence: 0.2, status: REVIEW.NEEDS_REVIEW, evidence: [`dígitos "${cleaned}" fuera de 1..5`] };
  }
  return { value, confidence: 0.8, status: REVIEW.CONFIRMED, evidence: [`OCR acotado: ${value}`] };
}

// ------------------------------------------------------------
// 6. Bandeja
// ------------------------------------------------------------
/** Clasifica las ranuras de la bandeja por color dominante (no por forma). */
export function readTray(slots) {
  const levels = [];
  const details = [];
  for (const slot of slots) {
    const f = slot.features || cellFeatures(slot);
    if (!f) { details.push({ level: null, confidence: 0, status: REVIEW.UNKNOWN }); continue; }
    // N1 azul, N2 naranja, N3 morado, N4 rojo (colores observados en las capturas).
    const candidates = [
      { level: 1, score: f.blue * 1.6 + (inRange(f.hue, [200, 230]) ? 0.3 : 0) },
      { level: 2, score: f.orange * 1.6 + (inRange(f.hue, [25, 40]) ? 0.3 : 0) },
      { level: 3, score: f.purple * 1.6 + (inRange(f.hue, [265, 290]) ? 0.3 : 0) },
      { level: 4, score: (f.pink + f.dark) * 1.6 + ((f.pink > 0.05 || f.dark > 0.15) && (inRange(f.hue, [350, 360]) || inRange(f.hue, [0, 8])) ? 0.3 : 0) },
    ].sort((a, b) => b.score - a.score);
    const top = candidates[0];
    const status = top.score > 0.5 ? REVIEW.CONFIRMED : top.score > 0.25 ? REVIEW.NEEDS_REVIEW : REVIEW.UNKNOWN;
    if (status !== REVIEW.UNKNOWN) levels.push(top.level);
    details.push({ level: status === REVIEW.UNKNOWN ? null : top.level, confidence: round2(clamp01(top.score)), status, alternatives: candidates.slice(1, 3).map((c) => ({ level: c.level, confidence: round2(clamp01(c.score)) })) });
  }
  return { levels, details, confidence: details.length ? details.reduce((a, d) => a + d.confidence, 0) / details.length : 0 };
}

// ------------------------------------------------------------
// 7. Conexiones
// ------------------------------------------------------------
/** Empareja portales por color en orden de lectura y avisa de grupos ambiguos. */
export function reconstructPortals(cells) {
  const byColor = new Map();
  const portals = [];
  cells.forEach((cell, idx) => {
    if (!cell || cell.type !== 'portal' || cell.status === REVIEW.UNKNOWN) return;
    const color = cell.portalColor || (cell.features && cell.features.purple > cell.features.blue ? 'purple' : 'blue');
    portals.push({ idx, color, confidence: cell.confidence });
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(idx);
  });
  const pairs = [];
  const warnings = [];
  for (const [color, list] of byColor) {
    if (list.length % 2 === 1) warnings.push(`Hay ${list.length} portales ${color}: uno queda sin pareja.`);
    if (list.length > 2) warnings.push(`Hay ${list.length} portales ${color}: se emparejan por orden de lectura (no confirmado).`);
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push({ color, a: list[i], b: list[i + 1] });
  }
  return { portals, pairs, warnings };
}

// ------------------------------------------------------------
// Canalización completa
// ------------------------------------------------------------
/**
 * @param {{data:Uint8ClampedArray, width:number, height:number, ocrDigits?:Function, traySlots?:Array}} input
 * @param {object} options {cols, rows} permite fijar dimensiones conocidas
 */
export function detectBoard(input, options = {}) {
  const { data, width, height } = input;
  if (!data || !width || !height) throw new Error('Imagen inválida');
  const region = options.region || detectBoardRegion(data, width, height);
  if (region.width < 8 || region.height < 8) {
    return { ok: false, reason: 'No se ha encontrado el área del tablero. Recorta la captura al tablero.', region, warnings: region.warnings };
  }
  const grid = options.cols && options.rows
    ? { cols: options.cols, rows: options.rows, cellW: region.width / options.cols, cellH: region.height / options.rows, confidence: 1, warnings: [] }
    : buildGrid(data, width, region);

  // Una rejilla medida (capturas reales) trae origen y paso propios: las casillas
  // no empiezan en el borde de la región, porque la región incluye el marco.
  // Sin esto, recortar con la rejilla medida pero dividir la región entera movería
  // todas las casillas media casilla y el clasificador fallaría por el recorte,
  // no por el reconocimiento.
  const explicit = options.cellGrid && options.cellGrid.length ? options.cellGrid : null;
  const cellW = explicit ? 0 : region.width / grid.cols;
  const cellH = explicit ? 0 : region.height / grid.rows;
  const cells = [];
  const gridOut = [];
  const warnings = [...(region.warnings || []), ...(grid.warnings || [])];
  let reviewCount = 0;

  for (let r = 0; r < grid.rows; r++) {
    const row = [];
    for (let c = 0; c < grid.cols; c++) {
      const box = explicit ? explicit[r][c] : null;
      const x0 = box ? box.x0 : Math.round(region.x0 + c * cellW + cellW * 0.12);
      const x1 = box ? box.x1 : Math.round(region.x0 + (c + 1) * cellW - cellW * 0.12);
      const y0 = box ? box.y0 : Math.round(region.y0 + r * cellH + cellH * 0.12);
      const y1 = box ? box.y1 : Math.round(region.y0 + (r + 1) * cellH - cellH * 0.12);
      const norm = normalizeCell(data, width, Math.max(0, x0), Math.max(0, y0), Math.min(width, x1), Math.min(height, y1));
      const result = classifyCell(norm);
      const cell = {
        x: c, y: r,
        type: result.type,
        confidence: result.confidence,
        alternatives: result.alternatives,
        evidence: result.evidence,
        status: result.status,
        bounds: { x0, y0, x1, y1 },
        features: result.features,
      };
      // Un géiser necesita su temporizador: si no se puede leer con seguridad,
      // la casilla queda en revisión en lugar de asumir un valor inventado.
      if (cell.type === 'geyser' || (result.status !== REVIEW.UNKNOWN && result.features
          && result.features.white > 0.004 && result.features.blue > 0.08 && result.features.texture < 0.2)) {
        const timer = readTimer({ pixels: norm.pixels }, input.ocrDigits);
        cell.timer = timer.value;
        cell.timerStatus = timer.status;
        cell.timerConfidence = timer.confidence;
        if (cell.type === 'geyser' && timer.status !== REVIEW.CONFIRMED) {
          cell.status = REVIEW.NEEDS_REVIEW;
          cell.evidence = [...cell.evidence, 'temporizador ilegible'];
        }
      }
      if (cell.status !== REVIEW.CONFIRMED) reviewCount++;
      row.push(cell);
      cells.push(cell);
    }
    gridOut.push(row);
  }

  const portals = reconstructPortals(cells);
  warnings.push(...portals.warnings);

  const tray = input.traySlots ? readTray(input.traySlots) : { levels: [], details: [], confidence: 0 };
  if (!tray.levels.length) warnings.push('No se detectó inventario: el usuario debe introducirlo a mano.');
  if (tray.details.some((d) => d.status !== REVIEW.CONFIRMED)) warnings.push('Alguna ranura de la bandeja es dudosa.');

  const status = reviewCount === 0 ? 'confirmed' : 'needs_review';
  return {
    ok: true,
    region,
    grid: { cols: grid.cols, rows: grid.rows, cellW, cellH, confidence: grid.confidence },
    cells: gridOut,
    flatCells: cells,
    portals: portals.pairs,
    tray: tray.levels,
    trayDetails: tray.details,
    reviewCount,
    status,
    warnings,
    confidence: round2(clamp01(
      (grid.confidence * 0.3)
      + (cells.length ? (cells.reduce((a, c) => a + c.confidence, 0) / cells.length) * 0.7 : 0),
    )),
  };
}

/** Convierte una detección en un nivel utilizable por el motor. */
export function toLevel(board, { name = 'Nivel detectado', rules = {} } = {}) {
  if (!board || !board.ok) throw new Error('Detección no válida');
  const cells = board.cells.map((row) => row.map((cell) => {
    if (!cell || cell.status === REVIEW.UNKNOWN || !cell.type) return 'wall'; // incógnita = bloqueante
    if (cell.type === 'portal') return { type: 'portal', color: cell.portalColor || 'blue' };
    if (cell.type === 'geyser') return { type: 'geyser', timer: cell.timer || 3 };
    return cell.type;
  }));
  return {
    cols: board.grid.cols,
    rows: board.grid.rows,
    cells,
    tray: board.tray.slice(),
    rules,
    name,
    projectedOnly: true,
  };
}

/** Resuelve varias hipótesis cuando hay casillas dudosas (modo avanzado). */
export function hypotheses(board, { maxHypotheses = 8 } = {}) {
  const doubtful = board.flatCells.filter((c) => c.status !== REVIEW.CONFIRMED && c.alternatives.length);
  if (!doubtful.length) return [{ board, changes: [], score: 0 }];
  const out = [];
  // Hipótesis 1: alternativas mejores de cada casilla dudosa.
  const variants = doubtful.slice(0, 6).map((cell) => ({
    cell,
    options: [{ type: cell.type, confidence: cell.confidence }, ...cell.alternatives].filter((o) => o.type),
  }));
  const combos = [];
  const rec = (i, chosen) => {
    if (combos.length >= maxHypotheses) return;
    if (i === variants.length) { combos.push(chosen.slice()); return; }
    for (const opt of variants[i].options.slice(0, 2)) { chosen.push({ cell: variants[i].cell, type: opt.type }); rec(i + 1, chosen); chosen.pop(); }
  };
  rec(0, []);
  for (const combo of combos) {
    out.push({ board, changes: combo, score: combo.reduce((a, c) => a + (c.cell.confidence || 0), 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, maxHypotheses);
}

function clamp01(v) { return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); }
function round2(v) { return Math.round(v * 100) / 100; }

export { cellFeatures, toHsv };
