// ============================================================
// BoomSolver — reconocimiento de objetos en capturas REALES (Fase 2.1)
// ============================================================
// POR QUÉ HAY UN CLASIFICADOR APARTE
// ----------------------------------
// El clasificador de `detector.js` se construyó sobre `FEATURE_PROFILES`
// derivados de imágenes SINTÉTICAS: casillas de color plano con un emblema
// dibujado. Sus rasgos principales son la mediana de tono/saturación/brillo de
// TODA la casilla, que en el arte real mide el SUELO y no el objeto. Medido
// sobre el corpus real eso da 100 % de abstención: no es que el detector sea
// prudente, es que mira la señal equivocada.
//
// QUÉ MIDE ESTE MÓDULO
// --------------------
//   1. SUELO de la casilla: mediana del anillo perimetral (el suelo de una
//      casilla del juego es casi uniforme).
//   2. MÁSCARA: píxeles que se apartan del suelo más de `FLOOR_DISTANCE`.
//      Se queda la COMPONENTE CONEXA más plausible (grande, cerca del centro),
//      no todos los píxeles: así el arte de la casilla vecina, que se cuela por
//      el borde cuando el recorte está desplazado, no contamina los rasgos.
//   3. RASGOS de esa componente: área, caja, relleno, simetría, orientación
//      diagonal (espejos), textura, y reparto de color.
//   4. CLASIFICACIÓN por prototipos: cada clase es un punto medio en el espacio
//      de rasgos normalizado, calculado SÓLO con las capturas de desarrollo.
//      Si la casilla no está cerca de ningún prototipo, o está casi igual de
//      cerca de dos, se ABSTIENE. Nunca se inventa una clase.
//
// QUÉ NO HACE
// -----------
// · No aprende `*` (objetos fuera del catálogo): se declaran desconocidos.
// · No separa `chest_wood` de `chest_iron`: medido sobre el corpus real son
//   indistinguibles (mismo tono, mismo dorado, mismo tamaño). Ver
//   `VISION_REAL_INFORME.md` §"Clases que el arte no separa".

import { REVIEW } from './detector.js';

/** Distancia de color a partir de la cual un píxel no es suelo. */
export const FLOOR_DISTANCE = 34;

/** Color de suelo del anillo perimetral, en [0,1]; por debajo de esto no hay suelo fiable. */
export const MIN_GROUND_FRACTION = 0.55;

function hsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), df = mx - mn;
  let h = 0;
  if (df) {
    if (mx === rn) h = ((gn - bn) / df) % 6;
    else if (mx === gn) h = (bn - rn) / df + 2;
    else h = (rn - gn) / df + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? df / mx : 0, mx];
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Máscara de "no suelo" dentro de una casilla.
 *
 * El suelo se estima con la mediana del anillo perimetral de la casilla. Un
 * píxel es objeto si su color dista más de `distance` de ese suelo.
 *
 * @param {Uint8ClampedArray} data RGBA de la imagen completa
 * @param {number} W ancho de la imagen
 * @param {{x0:number,y0:number,x1:number,y1:number}} box casilla (esquinas incluidas)
 */
export function objectMask(data, W, box, { ring = 0.18, distance = FLOOR_DISTANCE, ringBox = null } = {}) {
  const { x0, y0, x1, y1 } = box;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // Anillo de donde se estima el suelo: la casilla nominal (si se pasa) o la
  // ventana entera. Estimar el suelo en la ventana AMPLIADA incluiría arte del
  // objeto en el anillo y el suelo saldría contaminado.
  const rb = ringBox || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const bw = rb.x1 - rb.x0 + 1, bh = rb.y1 - rb.y0 + 1;
  const inset = Math.max(1, Math.round(Math.min(bw, bh) * ring));
  const ringR = [], ringG = [], ringB = [];
  for (let y = rb.y0; y <= rb.y1; y++) {
    for (let x = rb.x0; x <= rb.x1; x++) {
      const onRing = x - rb.x0 < inset || rb.x1 - x < inset || y - rb.y0 < inset || rb.y1 - y < inset;
      if (!onRing) continue;
      const i = ((y0 + y) * W + (x0 + x)) * 4;
      ringR.push(data[i]); ringG.push(data[i + 1]); ringB.push(data[i + 2]);
    }
  }
  const floor = [median(ringR), median(ringG), median(ringB)];
  const mask = new Uint8Array(w * h);
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * W + (x0 + x)) * 4;
      const d = Math.sqrt((data[i] - floor[0]) ** 2 + (data[i + 1] - floor[1]) ** 2 + (data[i + 2] - floor[2]) ** 2);
      if (d <= distance) continue;
      mask[y * w + x] = 1;
      n++;
    }
  }
  // fracción del anillo que quedó como suelo: mide si el suelo estaba limpio
  let ground = 0, total = 0;
  for (let y = rb.y0; y <= rb.y1; y++) {
    for (let x = rb.x0; x <= rb.x1; x++) {
      const onRing = x - rb.x0 < inset || rb.x1 - x < inset || y - rb.y0 < inset || rb.y1 - y < inset;
      if (!onRing) continue;
      total++;
      if (!mask[y * w + x]) ground++;
    }
  }
  return { mask, w, h, n, floor, groundFraction: total ? ground / total : 0 };
}

/**
 * Componentes conexas de la máscara (4-vecindad).
 * Devuelve sus estadísticas: área, caja, centro y el índice de sus píxeles.
 */
export function maskComponents(mask, w, h, { minArea = 8 } = {}) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (seen[p] || !mask[p]) continue;
      const stack = [p];
      seen[p] = 1;
      const px = [];
      let minx = x, maxx = x, miny = y, maxy = y, sx = 0, sy = 0;
      while (stack.length) {
        const q = stack.pop();
        const qx = q % w, qy = (q - qx) / w;
        px.push(q);
        sx += qx; sy += qy;
        if (qx < minx) minx = qx;
        if (qx > maxx) maxx = qx;
        if (qy < miny) miny = qy;
        if (qy > maxy) maxy = qy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = ny * w + nx;
          if (seen[r] || !mask[r]) continue;
          seen[r] = 1;
          stack.push(r);
        }
      }
      if (px.length < minArea) continue;
      comps.push({
        n: px.length,
        px,
        cx: sx / px.length,
        cy: sy / px.length,
        bbox: { minx, miny, maxx, maxy, w: maxx - minx + 1, h: maxy - miny + 1 },
      });
    }
  }
  comps.sort((a, b) => b.n - a.n);
  return comps;
}

/**
 * Elige la componente que es "el objeto" de la casilla.
 *
 * Criterio: la más cercana al centro de la casilla, penalizando las que tocan
 * el borde (arte del vecino) y las diminutas. No exige que el objeto esté
 * perfectamente centrado: el recorte de las capturas puede estar desplazado
 * hasta ~1/3 de casilla y el objeto sigue siendo el correcto.
 */
export function pickObject(comps, w, h, nominal = null) {
  if (!comps.length) return null;
  const box = nominal || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const cx0 = (box.x0 + box.x1) / 2, cy0 = (box.y0 + box.y1) / 2;
  let best = null, bestScore = -Infinity;
  for (const c of comps) {
    const inside = c.cx >= box.x0 && c.cx <= box.x1 && c.cy >= box.y0 && c.cy <= box.y1;
    const dist = Math.hypot(c.cx - cx0, c.cy - cy0) / Math.max(w, h);
    // Tocar el borde de la VENTANA (no de la casilla) delata arte del vecino.
    const touches = c.bbox.minx <= 0 || c.bbox.miny <= 0 || c.bbox.maxx >= w - 1 || c.bbox.maxy >= h - 1;
    const score = Math.log(c.n) - 2.5 * dist - (touches ? 0.5 : 0) + (inside ? 1.2 : 0);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Rasgos del objeto de una casilla del arte real. */
export function realCellFeatures(data, W, box, opts = {}) {
  const m = objectMask(data, W, box, opts);
  const comps = maskComponents(m.mask, m.w, m.h, { minArea: Math.max(8, Math.round(m.w * m.h * 0.004)) });
  const obj = pickObject(comps, m.w, m.h);
  if (!obj) {
    return {
      empty: true, frac: 0, hue: null, sat: 0, val: 0, colors: {},
      bboxW: 0, bboxH: 0, fill: 0, symmetry: 0, diagonal: 0,
      texture: 0, edges: 0, groundFraction: Number(m.groundFraction.toFixed(3)),
      components: comps.length, floor: m.floor,
    };
  }
  const { w, h } = m;
  const hs = [], ss = [], vs = [];
  const colors = { blue: 0, purple: 0, pink: 0, cyan: 0, red: 0, orange: 0, gold: 0, white: 0, gray: 0, dark: 0, green: 0 };
  const lum = new Float64Array(w * h);
  let lumSum = 0;
  for (const p of obj.px) {
    const x = p % w, y = (p - x) / w;
    const i = ((box.y0 + y) * W + (box.x0 + x)) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [H, S, V] = hsv(r, g, b);
    hs.push(H); ss.push(S); vs.push(V);
    lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    lumSum += lum[p];
    if (b > 150 && r < 140 && g < 180) colors.blue++;
    else if (b > 120 && r > 100 && r < 205 && g < 120) colors.purple++;
    else if (r > 175 && b > 130 && g < 155) colors.pink++;
    else if (b > 165 && g > 135 && r < 140) colors.cyan++;
    else if (r > 135 && g < 95 && b < 95) colors.red++;
    else if (r > 200 && g > 100 && g < 195 && b < 95) colors.orange++;
    else if (r > 165 && g > 115 && b < 105) colors.gold++;
    else if (V > 0.85 && S < 0.28) colors.white++;
    else if (S < 0.2 && V > 0.3) colors.gray++;
    else if (V < 0.25) colors.dark++;
    else if (g > r && g > b) colors.green++;
  }
  const meanLum = lumSum / obj.n;
  let texture = 0, edges = 0;
  const inObj = new Uint8Array(w * h);
  for (const p of obj.px) inObj[p] = 1;
  for (const p of obj.px) {
    const x = p % w, y = (p - x) / w;
    texture += Math.abs(lum[p] - meanLum);
    if (x + 1 < w && inObj[p + 1] && Math.abs(lum[p] - lum[p + 1]) > 40) edges++;
    if (y + 1 < h && inObj[p + w] && Math.abs(lum[p] - lum[p + w]) > 40) edges++;
  }
  // Simetría especular de la SILUETA alrededor del centro de su propia caja.
  const bb = obj.bbox;
  let same = 0, tot = 0;
  for (let y = bb.miny; y <= bb.maxy; y++) {
    for (let x = bb.minx; x <= Math.floor((bb.minx + bb.maxx) / 2); x++) {
      const mx = bb.minx + bb.maxx - x;
      tot++;
      if (inObj[y * w + x] === inObj[y * w + mx]) same++;
    }
  }
  // Orientación diagonal: para un espejo "/" o "\" la máscara se concentra en
  // una de las dos diagonales de la caja.
  let diagMain = 0, diagAnti = 0;
  for (let i = 0; i <= bb.w; i++) {
    const x = Math.round(bb.minx + (i / Math.max(1, bb.w)) * (bb.w - 1));
    const y = Math.round(bb.miny + (i / Math.max(1, bb.w)) * (bb.h - 1));
    if (x <= bb.maxx && y <= bb.maxy && inObj[y * w + x]) diagMain++;
    if (x <= bb.maxx && y <= bb.maxy && inObj[(bb.miny + bb.maxy - (y - bb.miny)) * w + x]) diagAnti++;
  }
  return {
    empty: false,
    frac: obj.n / (w * h),
    hue: Math.round(median(hs)),
    sat: Number(median(ss).toFixed(3)),
    val: Number(median(vs).toFixed(3)),
    colors: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, Number((v / obj.n).toFixed(3))])),
    bboxW: Number((bb.w / w).toFixed(3)),
    bboxH: Number((bb.h / h).toFixed(3)),
    fill: Number((obj.n / (bb.w * bb.h)).toFixed(3)),
    symmetry: Number((same / Math.max(1, tot)).toFixed(3)),
    diagonal: Number(((diagMain - diagAnti) / Math.max(1, bb.w + bb.h)).toFixed(3)),
    texture: Number((texture / obj.n / 255).toFixed(3)),
    edges: Number((edges / obj.n).toFixed(3)),
    groundFraction: Number(m.groundFraction.toFixed(3)),
    components: comps.length,
    floor: m.floor,
  };
}

// ------------------------------------------------------------
// Modelo de prototipos
// ------------------------------------------------------------

export const COLOR_NAMES = ['blue', 'purple', 'pink', 'cyan', 'red', 'orange', 'gold', 'white', 'gray', 'dark', 'green'];

/** Nombres de los rasgos que usa el modelo, en el orden del vector. */
export const FEATURE_NAMES = [
  'frac', 'sat', 'val', 'fill', 'symmetry', 'texture', 'edges', 'bboxW', 'bboxH',
  'hcos', 'hsin', ...COLOR_NAMES.map((c) => `c_${c}`),
];

/** Vector de rasgos; el tono se parte en dos componentes para no tener corte en 0/360. */
export function featureVector(f) {
  const h = ((f.hue ?? 0) * Math.PI) / 180;
  const v = [
    f.frac, f.sat, f.val, f.fill, f.symmetry, f.texture, f.edges, f.bboxW, f.bboxH,
    Math.cos(h), Math.sin(h),
  ];
  for (const c of COLOR_NAMES) v.push(f.colors[c] ?? 0);
  return v;
}

/**
 * Entrena el modelo: media y desviación de cada rasgo, y un prototipo por
 * clase. Sólo debe llamarse con las capturas de DESARROLLO.
 *
 * @param {{type:string, features:object}[]} samples
 */
export function trainModel(samples) {
  if (!samples.length) throw new Error('trainModel: no hay muestras');
  const mu = [], sd = [];
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    const a = samples.map((s) => featureVector(s.features)[i]);
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    const s = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) || 1;
    mu.push(m); sd.push(s);
  }
  const norm = (v) => v.map((x, i) => (x - mu[i]) / sd[i]);
  const classes = [...new Set(samples.map((s) => s.type))].sort();
  const prototypes = {};
  const spread = {};
  for (const c of classes) {
    const vs = samples.filter((s) => s.type === c).map((s) => norm(featureVector(s.features)));
    const proto = vs[0].map((_, i) => vs.reduce((x, y) => x + y[i], 0) / vs.length);
    prototypes[c] = proto;
    // dispersión intra-clase: hasta dónde llega lo visto en desarrollo
    spread[c] = Math.max(...vs.map((v) => distance(v, proto)));
  }
  return { mu, sd, prototypes, spread, classes, n: samples.length };
}

/**
 * Clases que el arte NO separa.
 *
 * `chest_wood` y `chest_iron` salen del juego con el mismo dibujo (caja castaña,
 * cerradura dorada, mismo tamaño) en todas las capturas del corpus. Afirmar una
 * de las dos es adivinar, así que cuando el modelo duda sólo entre hermanas se
 * abstiene y lo dice. Es una decisión de producto, no un defecto: si algún día
 * aparece un cofre de hierro que se distinga, basta con quitar el par de aquí.
 */
export const CLASSES_UNSEPARABLE = [
  ['chest_wood', 'chest_iron'],
];

function sibling(a, b) {
  return CLASSES_UNSEPARABLE.some((fam) => fam.includes(a) && fam.includes(b));
}

export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/**
 * Clasifica una casilla con un modelo entrenado.
 *
 * Reglas de abstención (las tres son deliberadas):
 *  · distancia al prototipo más cercano > `maxDistance`  → `unknown`
 *  · la segunda clase está a menos de `minMargin` de la primera → `needs_review`
 *  · la casilla no tiene objeto (el anillo es suelo y no hay componente) → `empty`
 *
 * @returns {{type:string|null,status:string,confidence:number,alternatives:string[],evidence:string[],features:object}}
 */
export function classifyRealCell(data, W, box, model, { maxDistance = 3.4, minMargin = 0.45, siblingMargin = 1.6 } = {}) {
  const f = realCellFeatures(data, W, box);
  if (f.empty || f.frac < 0.03) {
    return { type: 'empty', status: REVIEW.CONFIRMED, confidence: 0.75, alternatives: [], evidence: ['casilla sin objeto'], features: f };
  }
  // PARCHE DE TERRENO, NO OBJETO. Fuera del tablero el juego pinta una banda de
  // otro tono que ocupa la casilla entera. Su "máscara" es un rectángulo que
  // llena la casilla y toca los cuatro bordes: eso no es arte, es terreno.
  if (f.bboxW >= 0.92 && f.bboxH >= 0.92 && f.fill >= 0.9) {
    return {
      type: 'empty', status: REVIEW.CONFIRMED, confidence: 0.6, alternatives: [],
      evidence: [`parche de terreno: la silueta llena la casilla (${f.bboxW}x${f.bboxH}, relleno ${f.fill})`],
      features: f,
    };
  }
  if (f.groundFraction < MIN_GROUND_FRACTION) {
    return {
      type: null, status: REVIEW.NEEDS_REVIEW, confidence: 0.2, alternatives: [],
      evidence: [`el anillo de la casilla no es suelo uniforme (${(f.groundFraction * 100).toFixed(0)} %): el recorte no cuadra`],
      features: f,
    };
  }
  const v = featureVector(f).map((x, i) => (x - model.mu[i]) / model.sd[i]);
  const ds = model.classes
    .map((c) => ({ c, d: distance(v, model.prototypes[c]), spread: model.spread[c] }))
    .sort((a, b) => a.d - b.d);
  const [first, second] = ds;
  if (first.d > maxDistance) {
    return {
      type: null, status: REVIEW.UNKNOWN, confidence: 0.15, alternatives: [],
      evidence: [`ningún prototipo cerca (d=${first.d.toFixed(2)} > ${maxDistance})`], features: f,
    };
  }
  if (second && sibling(first.c, second.c) && second.d - first.d < siblingMargin) {
    return {
      type: null, status: REVIEW.NEEDS_REVIEW, confidence: 0.3,
      alternatives: [first.c, second.c],
      evidence: [`clases que el arte no separa (${first.c} vs ${second.c}, d=${first.d.toFixed(2)}/${second.d.toFixed(2)})`],
      features: f,
    };
  }
  if (second && second.d - first.d < minMargin) {
    return {
      type: null, status: REVIEW.NEEDS_REVIEW, confidence: 0.35,
      alternatives: [first.c, second.c],
      evidence: [`dos clases casi igual de cerca (${first.d.toFixed(2)} vs ${second.d.toFixed(2)})`], features: f,
    };
  }
  const conf = Math.max(0.4, Math.min(0.95, 1 - first.d / (maxDistance * 2)));
  return {
    type: first.c, status: REVIEW.CONFIRMED, confidence: Number(conf.toFixed(2)),
    alternatives: [], evidence: [`d=${first.d.toFixed(2)} a ${first.c} (dispersión en desarrollo ${first.spread.toFixed(2)})`],
    features: f,
  };
}

/** Alias histórico: el nombre antiguo de `CLASSES_UNSEPARABLE`. */
export const CONFUSABLE_FAMILIES = CLASSES_UNSEPARABLE;
