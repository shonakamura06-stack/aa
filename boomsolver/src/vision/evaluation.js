// ============================================================
// BoomSolver — evaluación de la VISIÓN (Fase 2, §5)
// ============================================================
// QUÉ HACE Y QUÉ NO HACE
// ----------------------
// Este módulo construye la INFRAESTRUCTURA de evaluación: carga capturas
// etiquetadas, las pasa por el detector, compara casilla a casilla contra la
// etiqueta humana y calcula métricas por categoría, matriz de confusión,
// abstención y confianza.
//
// NO contiene capturas reales ni métricas del juego real. Cualquier informe
// generado sin un corpus humano marcado debe decir CERO capturas reales.
// El corpus sintético incluido sirve sólo para comprobar que la infraestructura
// mide bien y para detectar regresiones del detector, nunca como validación.
//
// Requisitos del encargo que implementa:
//   · etiquetas con coordenadas, id real, tema, resolución y variaciones de tamaño
//   · casos ambiguos marcados como tales (la etiqueta puede ser dudosa)
//   · confianza por casilla y ABSTENCIÓN del detector
//   · separación train / eval (aquí sólo EVAL: no se entrena nada)
//   · matriz de confusión y métricas por categoría
//   · confusiones a vigilar declaradas explícitamente

import { detectBoard, REVIEW } from './detector.js';
import { decodePng } from './png.js';

// Pares de confusión que el encargo exige vigilar (§5).
export const WATCHED_CONFUSIONS = [
  ['chest_wood', 'chest_iron', 'madera / hierro'],
  ['crystal', 'gem', 'cristal / gema'],
  ['rock_soft', 'rock_hard', 'roca blanda / dura'],
  ['dynamite', 'detonator', 'dinamita / detonador'],
  ['switch', 'bomb', 'interruptor / bomba'],
  ['geyser', 'switch', 'géiser / interruptor circular'],
  ['portal', 'portal', 'portal azul / morado (misma clase, distinto color)'],
  ['mirror_slash', 'mirror_backslash', 'espejo / y espejo \\'],
  ['enemy_1', 'enemy_2', 'bomba enemiga N1 / N2'],
  ['enemy_3', 'enemy_4', 'bomba enemiga N3 / N4'],
];

/**
 * Un caso de evaluación:
 * {
 *   id, tema, resolucion: {width, height}, origen: 'humano' | 'sintetico',
 *   image: {data, width, height},
 *   etiqueta: [[{ type, ambiguous?: boolean, alternativas?: string[] }]],
 *   notas
 * }
 */
export function normalizeLabelGrid(etiqueta) {
  return etiqueta.map((row) => row.map((cell) => (typeof cell === 'string' ? { type: cell } : { ...cell })));
}

/** Pasa un caso por el detector y devuelve la comparación casilla a casilla. */
export function evaluateCase(caso, options = {}) {
  const { data, width, height } = caso.image;
  let det;
  try {
    det = detectBoard({ data, width, height }, options);
  } catch (err) {
    return {
      id: caso.id,
      ok: false,
      error: err.message,
      cells: [],
      confusion: {},
      abstentions: 0,
      correct: 0,
      total: 0,
    };
  }
  if (!det.ok) {
    return {
      portalColor: null,
      id: caso.id,
      ok: false,
      error: det.reason,
      cells: [],
      confusion: {},
      abstentions: 0,
      correct: 0,
      total: 0,
      mismatchDimensions: null,
    };
  }

  const etiqueta = normalizeLabelGrid(caso.etiqueta);
  const labRows = etiqueta.length;
  const labCols = etiqueta[0].length;
  const dimensionMismatch = det.grid.rows !== labRows || det.grid.cols !== labCols
    ? { detectado: `${det.grid.cols}x${det.grid.rows}`, etiqueta: `${labCols}x${labRows}` }
    : null;

  const comparisons = [];
  const confusion = new Map();
  let correct = 0;
  let abstentions = 0;
  let ambiguous = 0;

  for (let y = 0; y < labRows; y++) {
    for (let x = 0; x < labCols; x++) {
      const real = etiqueta[y][x];
      const got = (det.cells[y] || [])[x];
      const detectedType = got ? got.type : null;
      const status = got ? got.status : REVIEW.UNKNOWN;
      const abstained = status !== REVIEW.CONFIRMED || detectedType === null;
      if (abstained) abstentions++;
      if (real.ambiguous) ambiguous++;

      // Para un caso ambiguo, cualquiera de las alternativas declaradas cuenta
      // como acierto: no se puede penalizar al detector por una duda humana.
      const acceptable = real.ambiguous && real.alternativas
        ? [real.type, ...real.alternativas]
        : [real.type];
      const typeMatches = detectedType !== null && acceptable.includes(detectedType);
      // Un acierto exige que el detector RESPONDA y acierte. Acertar por casualidad
      // mientras se abstiene no es un acierto: inflaría la métrica sin aportar nada.
      const hit = typeMatches && !abstained;
      if (hit) correct++;

      // La matriz de confusión se cuenta SIEMPRE, también cuando el detector se
      // abstiene (columna ABSTENCIÓN). Si sólo se contaran los fallos, las filas
      // no sumarían el total de casillas y el informe mentiría.
      const predicted = detectedType === null ? 'ABSTENCIÓN' : detectedType;
      if (!confusion.has(real.type)) confusion.set(real.type, new Map());
      const m = confusion.get(real.type);
      m.set(predicted, (m.get(predicted) || 0) + 1);
      comparisons.push({
        x, y,
        real: real.type,
        detected: detectedType,
        status,
        confidence: got ? got.confidence : 0,
        margin: got ? got.margin : 0,
        abstained,
        ambiguous: !!real.ambiguous,
        hit,
        typeMatches,
        alternatives: got ? got.alternatives : [],
        key: `${real.type}→${predicted}`,
      });
    }
  }

  const portalColor = evaluatePortalColors(caso, det, options.portalColor || {});

  return {
    id: caso.id,
    ok: true,
    portalColor,
    theme: caso.tema || null,
    resolution: caso.resolucion ? `${caso.resolucion.width}x${caso.resolucion.height}` : `${width}x${height}`,
    origin: caso.origen || 'desconocido',
    dimensionMismatch,
    cells: comparisons,
    confusion: Object.fromEntries([...confusion.entries()].map(([k, m]) => [k, Object.fromEntries(m)])),
    correct,
    total: comparisons.length,
    abstentions,
    ambiguous,
    accuracyConfirmedOnly: (() => {
      const answered = comparisons.filter((c) => !c.abstained);
      const ok = answered.filter((c) => c.typeMatches).length;
      return answered.length ? ok / answered.length : null;
    })(),
  };
}

/**
 * Evalúa el COLOR de los portales (azul vs morado). La matriz de tipos no puede
 * distinguirlos porque son el mismo tipo: aquí se compara el tono medio de la
 * casilla contra el rango esperado. Devuelve aciertos, errores y abstención.
 */
export function evaluatePortalColors(caso, detection, options = {}) {
  const { blueRange = [200, 260], purpleRange = [260, 320], minSat = 0.25 } = options;
  const etiqueta = normalizeLabelGrid(caso.etiqueta);
  const out = [];
  for (let y = 0; y < etiqueta.length; y++) {
    for (let x = 0; x < etiqueta[y].length; x++) {
      const real = etiqueta[y][x];
      if (real.type !== 'portal') continue;
      const want = real.color || null;
      const cell = (detection.cells[y] || [])[x];
      if (!cell) { out.push({ x, y, real: want, detected: null, result: 'sin casilla' }); continue; }
      const f = cell.features;
      if (!f) { out.push({ x, y, real: want, detected: null, result: 'sin rasgos' }); continue; }
      let detected = null;
      if (f.hue >= blueRange[0] && f.hue < blueRange[1] && f.sat >= minSat) detected = 'blue';
      else if (f.hue >= purpleRange[0] && f.hue <= purpleRange[1] && f.sat >= minSat) detected = 'purple';
      out.push({
        x, y,
        real: want,
        detected,
        hue: +f.hue.toFixed(1),
        sat: +f.sat.toFixed(3),
        result: want === null ? 'sin etiqueta de color'
          : detected === null ? 'abstención'
            : detected === want ? 'acierto' : 'error',
      });
    }
  }
  const labeled = out.filter((o) => o.real !== null);
  return {
    cells: out,
    labeled: labeled.length,
    correct: labeled.filter((o) => o.result === 'acierto').length,
    wrong: labeled.filter((o) => o.result === 'error').length,
    abstained: labeled.filter((o) => o.result === 'abstención').length,
    confusion: labeled.reduce((acc, o) => {
      if (o.result === 'error') acc[`${o.real}→${o.detected}`] = (acc[`${o.real}→${o.detected}`] || 0) + 1;
      return acc;
    }, {}),
  };
}

/** Métricas globales del corpus. */
export function summarizeCorpus(results) {
  const cells = results.flatMap((r) => r.cells);
  const perClass = new Map();
  for (const c of cells) {
    if (!perClass.has(c.real)) perClass.set(c.real, { total: 0, hit: 0, abstained: 0, wrong: 0, confSum: 0 });
    const s = perClass.get(c.real);
    s.total++;
    s.confSum += c.confidence;
    if (c.hit) s.hit++;
    else if (c.abstained) s.abstained++;
    else s.wrong++;
  }
  const perClassOut = {};
  for (const [k, v] of perClass) {
    perClassOut[k] = {
      total: v.total,
      correct: v.hit,
      abstained: v.abstained,
      wrong: v.wrong,
      recall: v.total ? +(v.hit / v.total).toFixed(3) : 0,
      meanConfidence: v.total ? +(v.confSum / v.total).toFixed(3) : 0,
    };
  }

  // Matriz de confusión COMPLETA (real → predicho, incluidas las abstenciones).
  // Se construye desde las celdas, que ya traen la predicción exacta; así ninguna
  // fila puede quedarse sin sumar el total.
  const allReal = [...new Set(cells.map((c) => c.real))].sort();
  const allPred = [...new Set(cells.map((c) => (c.detected === null ? 'ABSTENCIÓN' : c.detected)))];
  const preds = [...new Set([...allReal, ...allPred])].sort();
  const matrix = {};
  for (const real of allReal) {
    matrix[real] = {};
    for (const pred of preds) matrix[real][pred] = 0;
    if (!preds.includes('ABSTENCIÓN')) matrix[real].ABSTENCIÓN = 0;
  }
  for (const c of cells) {
    // `detected` es la clase más probable aunque la casilla se abstenga; el estado
    // de abstención viaja aparte en `abstained`. Para la matriz, una casilla en
    // abstención se cuenta en la columna ABSTENCIÓN: es lo que el detector declara.
    const pred = c.abstained ? 'ABSTENCIÓN' : (c.detected === null ? 'ABSTENCIÓN' : c.detected);
    if (!matrix[c.real]) continue;
    matrix[c.real][pred] = (matrix[c.real][pred] || 0) + 1;
  }

  const answered = cells.filter((c) => !c.abstained);
  const answeredOk = answered.filter((c) => c.typeMatches).length;

  return {
    images: results.length,
    imagesFailed: results.filter((r) => !r.ok).length,
    cells: cells.length,
    correct: cells.filter((c) => c.hit).length,
    abstentions: cells.filter((c) => c.abstained).length,
    ambiguousCells: cells.filter((c) => c.ambiguous).length,
    coverage: cells.length ? +(answered.length / cells.length).toFixed(3) : 0,
    accuracyOverAnswered: answered.length ? +(answeredOk / answered.length).toFixed(3) : null,
    accuracyOverall: cells.length ? +(cells.filter((c) => c.hit).length / cells.length).toFixed(3) : null,
    perClass: perClassOut,
    matrix,
    dimensionMismatches: results.filter((r) => r.dimensionMismatch).map((r) => ({ id: r.id, ...r.dimensionMismatch })),
    portalColor: (() => {
      const all = results.flatMap((r) => (r.portalColor ? r.portalColor.cells : []))
        .filter((o) => o.real !== null);
      if (!all.length) return null;
      return {
        labeled: all.length,
        correct: all.filter((o) => o.result === 'acierto').length,
        wrong: all.filter((o) => o.result === 'error').length,
        abstained: all.filter((o) => o.result === 'abstención').length,
        confusion: all.reduce((acc, o) => {
          if (o.result === 'error') acc[`${o.real}→${o.detected}`] = (acc[`${o.real}→${o.detected}`] || 0) + 1;
          return acc;
        }, {}),
      };
    })(),
    byOrigin: (() => {
      const out = {};
      for (const o of ['humano', 'sintetico']) {
        const cs = results.filter((r) => r.origin === o).flatMap((r) => r.cells);
        if (!cs.length) continue;
        out[o] = {
          images: results.filter((r) => r.origin === o).length,
          cells: cs.length,
          correct: cs.filter((c) => c.hit).length,
          abstentions: cs.filter((c) => c.abstained).length,
        };
      }
      return out;
    })(),
  };
}

/** Pares de confusión observados que el encargo pide vigilar. */
export function watchedConfusionReport(summary) {
  return WATCHED_CONFUSIONS.map(([a, b, label]) => {
    const ab = (summary.matrix[a] && summary.matrix[a][b]) || 0;
    const ba = (summary.matrix[b] && summary.matrix[b][a]) || 0;
    // Los pares del mismo tipo (azul/morado) no pueden aparecer en la matriz de
    // tipos: se informan aparte, en el canal de color.
    const sameClass = a === b;
    return {
      pair: label,
      a, b,
      realA_asB: ab,
      realB_asA: ba,
      detectable: !sameClass,
      note: sameClass
        ? 'Mismo tipo, distinto color: la matriz de tipos no lo ve. Requiere evaluación de color por casilla.'
        : null,
    };
  });
}

/** Separa el corpus en train/eval. Aquí no se entrena: sólo se declara el corte. */
export function splitTrainEval(casos, { evalRatio = 0.4, seed = 1 } = {}) {
  if (!casos.length) return { train: [], eval: [], note: 'corpus vacío' };
  // Mezcla determinista por semilla (sin depender del orden del fichero).
  const scored = casos.map((c, i) => ({ c, k: (i * 2654435761 + seed * 40503) % 1000 }));
  scored.sort((a, b) => a.k - b.k);
  const evalCount = Math.max(1, Math.round(casos.length * evalRatio));
  const evalSet = scored.slice(0, evalCount).map((s) => s.c);
  const trainSet = scored.slice(evalCount).map((s) => s.c);
  return {
    train: trainSet,
    eval: evalSet,
    note: 'El detector actual no aprende: la separación se mantiene para que, si algún día '
      + 'se añaden perfiles ajustados, no se evalúen con las mismas imágenes.',
  };
}

/**
 * Dibuja un emblema geométrico simple dentro de una casilla sintética.
 *
 * Su único propósito es que la casilla tenga variación interna de luminancia,
 * como cualquier objeto real. NO imita el arte del juego: los colores salen de
 * las mismas constantes que usa `synthCase`, así que un acierto sobre estas
 * imágenes no dice nada sobre las capturas reales (ver `FASE_2_INFORME.md`).
 */
function drawEmblem(data, W, ox, oy, size, type) {
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const put = (x, y, rgb, alpha = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = ((oy + y) * W + (ox + x)) * 4;
    for (let k = 0; k < 3; k++) {
      data[i + k] = clamp(Math.round(data[i + k] * (1 - alpha) + rgb[k] * alpha));
    }
  };
  const c = (size - 1) / 2;
  const r = size * 0.3;
  const shapes = {
    gem: { color: [230, 250, 255], kind: 'diamond' },
    crystal: { color: [255, 235, 245], kind: 'spikes' },
    chest_wood: { color: [90, 55, 25], kind: 'box' },
    chest_iron: { color: [210, 210, 215], kind: 'box' },
    wall: { color: [30, 25, 22], kind: 'bricks' },
    portal: { color: [235, 235, 255], kind: 'ring' },
    cat: { color: [30, 20, 15], kind: 'face' },
    mirror_slash: { color: [255, 255, 255], kind: 'slash' },
    mirror_backslash: { color: [255, 255, 255], kind: 'backslash' },
    geyser: { color: [235, 245, 250], kind: 'ring' },
    dynamite: { color: [40, 30, 25], kind: 'box' },
    detonator: { color: [255, 215, 120], kind: 'box' },
    switch: { color: [255, 250, 240], kind: 'dot' },
    magma_rock: { color: [255, 130, 40], kind: 'spikes' },
    rock_soft: { color: [190, 185, 180], kind: 'dot' },
    rock_hard: { color: [60, 55, 55], kind: 'dot' },
    // Suelo: no es un objeto, pero tampoco es un plano perfecto. Una loseta real
    // tiene vetas; sin ellas el detector se abstiene (y hace bien).
    empty: { color: [172, 138, 92], kind: 'floor' },
  };
  const key = String(type).startsWith('portal:') ? 'portal' : type;
  const def = shapes[key];
  if (!def) return;
  const { color, kind } = def;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const dist = Math.hypot(dx, dy);
      let on = false;
      switch (kind) {
        case 'diamond': on = Math.abs(dx) + Math.abs(dy) <= r; break;
        case 'spikes': on = (Math.abs(dx) + Math.abs(dy) <= r) || (dist < r * 0.45); break;
        case 'box': on = Math.abs(dx) <= r * 0.8 && Math.abs(dy) <= r * 0.7; break;
        case 'bricks': on = (Math.abs(dy) <= r * 0.8) && ((y >> 2) % 2 === 0 ? (x % 8 < 4) : (x % 8 >= 4)); break;
        case 'ring': on = dist <= r && dist >= r * 0.55; break;
        case 'face': on = dist <= r * 0.75; break;
        case 'slash': on = Math.abs(dx - dy) <= size * 0.09; break;
        case 'backslash': on = Math.abs(dx + dy) <= size * 0.09; break;
        case 'dot': on = dist <= r * 0.5; break;
        case 'floor': on = (y % 5 === 0) || (x % 7 === 0); break;
        default: on = false;
      }
      if (on) put(x, y, color, kind === 'floor' ? 0.5 : 0.92);
    }
  }
}

/**
 * Corpus SINTÉTICO de comprobación de la infraestructura.
 * No son capturas del juego: son dibujos con los colores base que el propio
 * detector usa como perfiles. Sirven para verificar que las métricas se calculan
 * bien, no para afirmar nada sobre el juego real.
 */
export function synthCase({ id, layout, etiqueta = null, cellPx = 48, tema = 'sintético', seed = 0, noise = 0, iconos = true }) {
  // Colores base; los portales admiten azul y morado para poder evaluar el canal
  // de color por separado (el encargo pide vigilar justo esa confusión).
  const colors = {
    empty: [196, 160, 110], wall: [70, 60, 55], gem: [60, 170, 220], crystal: [235, 120, 170],
    chest_wood: [150, 90, 40], portal: [70, 110, 235], 'portal:blue': [70, 110, 235],
    'portal:purple': [160, 70, 210], mirror_slash: [150, 200, 215], cat: [240, 150, 60],
  };
  const colorOf = (t) => colors[t] || colors.empty;
  const rows = layout.length;
  const cols = layout[0].length;
  const W = cols * cellPx;
  const H = rows * cellPx;
  const data = new Uint8ClampedArray(W * H * 4);
  let s = seed || 12345;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = Math.min(cols - 1, Math.floor(x / cellPx));
      const cy = Math.min(rows - 1, Math.floor(y / cellPx));
      const shade = ((cx * 7 + cy * 13) % 9) - 4;
      const key = layout[cy][cx];
      const base = colorOf(key);
      const j = ((x * 37 + y * 17) % 11) - 5 + shade * 3 + (noise ? Math.round((rand() - 0.5) * noise) : 0);
      const i = (y * W + x) * 4;
      const clamp = (v) => Math.max(0, Math.min(255, v));
      data[i] = clamp(base[0] + j);
      data[i + 1] = clamp(base[1] + j);
      data[i + 2] = clamp(base[2] + j);
      data[i + 3] = 255;
    }
  }
  // Emblema dentro de la casilla.
  //
  // Sin él, cada casilla es un color plano: el detector mide `texture` (variación
  // interna de luminancia) y ninguna clase la confirma, así que todo el corpus
  // salía como abstención. Eso no era un fallo del evaluador, era el corpus
  // midiendo un caso que el juego no produce: en el juego cada objeto tiene una
  // forma. `iconos:false` sigue disponible para reproducir el caso plano.
  if (iconos) {
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        drawEmblem(data, W, cx * cellPx, cy * cellPx, cellPx, layout[cy][cx]);
      }
    }
  }
  return {
    id,
    tema,
    origen: 'sintetico',
    resolucion: { width: W, height: H },
    image: { data, width: W, height: H },
    etiqueta: (Array.isArray(etiqueta) ? etiqueta : layout.map((row) => row.map((t) => ({ type: t })))),
    notas: `Generado por synthCase con cellPx=${cellPx}, noise=${noise}. NO es una captura del juego.`,
  };
}

/** Carga una captura real etiquetada desde un descriptor JSON + datos RGBA. */
export function loadRealCase(descriptor, pixels) {
  if (descriptor.origen !== 'humano') {
    throw new Error('Un caso real debe declarar origen:"humano". No se aceptan capturas sin etiquetar.');
  }
  if (!descriptor.etiqueta || !descriptor.etiqueta.length) {
    throw new Error(`El caso ${descriptor.id} no tiene etiqueta: no se puede evaluar.`);
  }
  if (!descriptor.resolucion) {
    throw new Error(`El caso ${descriptor.id} no declara resolución.`);
  }
  return {
    id: descriptor.id,
    tema: descriptor.tema || null,
    origen: 'humano',
    resolucion: descriptor.resolucion,
    image: { data: pixels.data, width: pixels.width, height: pixels.height },
    etiqueta: descriptor.etiqueta,
    notas: descriptor.notas || '',
  };
}

/** Informe en texto, honesto sobre el origen del corpus. */
export function renderReport(summary, watched, { realImages = 0 } = {}) {
  const lines = [];
  lines.push('# Informe de evaluación de visión');
  lines.push('');
  lines.push(`Imágenes evaluadas: ${summary.images} (reales: ${realImages}, sintéticas: ${summary.images - realImages})`);
  if (realImages === 0) {
    lines.push('');
    lines.push('**Aviso:** no hay capturas reales etiquetadas en este corpus. Todas las métricas');
    lines.push('de esta ejecución son sobre dibujos sintéticos y NO validan el detector frente');
    lines.push('al juego. Para validarlo hace falta el PDF de capturas etiquetadas a mano.');
  }
  lines.push('');
  lines.push(`Casillas: ${summary.cells} · aciertos: ${summary.correct} · ab-based: `
    + `${summary.abstentions} · ambiguas: ${summary.ambiguousCells}`);
  lines.push(`Cobertura (responde): ${summary.coverage} · acierto sobre respondidas: ${summary.accuracyOverAnswered}`);
  lines.push('');
  lines.push('## Por clase');
  lines.push('| clase | total | aciertos | abstención | errores | recall | confianza media |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(summary.perClass)) {
    lines.push(`| ${k} | ${v.total} | ${v.correct} | ${v.abstained} | ${v.wrong} | ${v.recall} | ${v.meanConfidence} |`);
  }
  lines.push('');
  lines.push('## Pares de confusión vigilados');
  lines.push('| par | real A como B | real B como A |');
  lines.push('|---|---|---|');
  for (const w of watched) {
    if (!w.detectable) {
      lines.push(`| ${w.pair} | — | — |`);
      continue;
    }
    lines.push(`| ${w.pair} | ${w.realA_asB} | ${w.realB_asA} |`);
  }
  lines.push('');
  if (summary.portalColor) {
    const pc = summary.portalColor;
    lines.push('');
    lines.push(`## Color de portal (canal aparte) — ${pc.labeled} portales etiquetados`);
    lines.push(`aciertos: ${pc.correct} · errores: ${pc.wrong} · abstención: ${pc.abstained}`);
    const conf = Object.entries(pc.confusion);
    lines.push(conf.length ? `confusiones: ${conf.map(([k, v]) => `${k} (${v})`).join(', ')}` : 'sin confusiones de color');
  }
  const sameClass = watched.filter((w) => !w.detectable);
  if (sameClass.length) {
    lines.push('');
    lines.push('Nota: ' + sameClass.map((w) => w.pair).join(', ')
      + ' no se evalúa con la matriz de tipos (es el mismo tipo). Se mide en el canal');
    lines.push('de color de arriba; si ese canal no aparece, no hay portales etiquetados.');
  }
  return lines.join('\n');
}

// ------------------------------------------------------------
// Corpus REAL en disco
// ------------------------------------------------------------
/**
 * Carga un caso real desde disco: `<id>.png` + `<id>.json`.
 *
 * El JSON es la etiqueta HUMANA del tablero:
 *
 * ```json
 * {
 *   "id": "nivel-12",
 *   "origen": "humano",
 *   "tema": "mina",
 *   "resolucion": { "width": 1280, "height": 720 },
 *   "notas": "captura del nivel 12, zoom 100 %",
 *   "etiqueta": [
 *     [{ "type": "empty" }, { "type": "gem" }],
 *     [{ "type": "chest_wood" }, { "type": "portal", "color": "blue" }]
 *   ]
 * }
 * ```
 *
 * Reglas duras (para que nadie evalúe a ciegas):
 *   · `origen` debe ser `"humano"`: una captura sin etiqueta humana no es corpus.
 *   · `etiqueta` debe existir y ser rectangular.
 *   · la resolución declarada debe coincidir con la del PNG; si no, se avisa y
 *     se usa la real (una captura reescalada invalidaría las coordenadas).
 *   · el PNG tiene que ser legible por `decodePng`; si no, el caso se devuelve
 *     como error en vez de inventar métricas.
 *
 * @param {{id: string, png: Buffer, descriptor: object}} entrada
 */
export function loadRealCaseFromBuffer({ id, png, descriptor }) {
  const etiqueta = descriptor.etiqueta;
  if (!etiqueta || !etiqueta.length) {
    throw new Error(`El caso ${id} no tiene etiqueta: no se puede evaluar.`);
  }
  const anchoFila = etiqueta[0].length;
  if (!anchoFila) throw new Error(`El caso ${id} tiene una etiqueta vacía.`);
  etiqueta.forEach((fila, y) => {
    if (!Array.isArray(fila) || fila.length !== anchoFila) {
      throw new Error(`Etiqueta no rectangular en el caso ${id}: la fila ${y} tiene ${fila && fila.length} celdas y la 0 tiene ${anchoFila}.`);
    }
  });

  const img = decodePng(png);
  const warnings = [];
  if (descriptor.resolucion) {
    const d = descriptor.resolucion;
    if (d.width !== img.width || d.height !== img.height) {
      warnings.push(`resolución declarada ${d.width}x${d.height} ≠ PNG ${img.width}x${img.height}: se usa la del PNG.`);
    }
  } else {
    warnings.push('el descriptor no declara resolución: se usa la del PNG.');
  }
  if (descriptor.origen !== 'humano') {
    warnings.push(`origen "${descriptor.origen}" no es "humano": el caso se evalúa pero NO cuenta como captura real validada.`);
  }

  return {
    caso: {
      id: descriptor.id || id,
      tema: descriptor.tema || null,
      origen: descriptor.origen === 'humano' ? 'humano' : 'sintetico',
      declarado: descriptor.origen || null,
      resolucion: { width: img.width, height: img.height },
      image: { data: img.data, width: img.width, height: img.height },
      etiqueta,
      notas: descriptor.notas || '',
    },
    warnings,
  };
}

/**
 * Carga todos los pares `<id>.png` + `<id>.json` de una carpeta.
 *
 * Devuelve `{ casos, warnings, errors }`. Un caso roto NO detiene la carga:
 * entra en `errors` y el informe lo dice. Preferimos un corpus incompleto y
 * declarado a un corpus que se cae o que se salta ficheros en silencio.
 *
 * `readFile` y `readDir` se inyectan para poder probar sin tocar el disco.
 */
export function loadRealCorpus({ dir, files, readFile, readDir }) {
  const nombres = files || readDir(dir);
  const ids = [...new Set(nombres.filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)))].sort();
  const casos = [];
  const warnings = [];
  const errors = [];
  for (const id of ids) {
    try {
      if (!nombres.includes(`${id}.json`)) {
        errors.push({ id, error: 'falta la etiqueta JSON' });
        continue;
      }
      const png = readFile(`${dir}/${id}.png`);
      const descriptor = JSON.parse(String(readFile(`${dir}/${id}.json`)));
      const { caso, warnings: w } = loadRealCaseFromBuffer({ id, png, descriptor });
      casos.push(caso);
      warnings.push(...w.map((m) => `${id}: ${m}`));
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }
  for (const f of nombres.filter((x) => x.endsWith('.json'))) {
    const id = f.slice(0, -5);
    if (!nombres.includes(`${id}.png`)) errors.push({ id, error: 'hay etiqueta pero falta el PNG' });
  }
  return { casos, warnings, errors };
}
