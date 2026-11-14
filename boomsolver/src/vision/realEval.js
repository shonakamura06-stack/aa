// ============================================================
// BoomSolver — evaluación de la visión sobre capturas REALES (Fase 2.1)
// ============================================================
// QUÉ HACE
// --------
// Carga las capturas del juego con etiqueta humana (`corpus/real/*.json`), pasa
// cada una por la canalización de visión y compara contra lo etiquetado.
//
// QUÉ MIDE, CADA COSA POR SEPARADO (requisito del encargo)
// ------------------------------------------------------
//   1. rejilla          → ¿acierta filas y columnas?
//   2. por clase        → precisión y exhaustividad de cada tipo de objeto
//   3. confusiones      → qué clase se confunde con cuál (matriz)
//   4. falsos positivos → objetos inventados (detección sin objeto real)
//   5. omitidos         → objetos reales que el detector no ve
//   6. abstención       → cuántas casillas el detector no afirma
//   7. bandeja          → acierto del inventario de bombas
//   8. temporizadores   → lectura de los números de géiser
//   9. cables           → enlaces detonador ↔ dinamita
//  10. desconocidos     → objetos reales fuera del catálogo
//
// REGLAS QUE NO SE ROMPEN
// -----------------------
// · Sólo se comparan OBJETOS. El suelo y el "fuera del mapa" no se etiquetan:
//   etiquetarlos a ojo metería errores humanos en la métrica y no aporta nada
//   sobre reconocer objetos.
// · Un objeto de clase desconocida (`*`) no cuenta ni como acierto ni como fallo
//   de clase: se cuenta aparte, porque el catálogo no lo cubre.
// · Los resultados se pueden partir por NIVEL (`splitByLevel`) para que nunca se
//   afirme precisión sobre las mismas capturas con las que se ajustó nada.
// · El módulo es puro salvo el cargador de disco, que recibe las funciones de E/S.

import { detectBoard, detectBoardRegion, REVIEW } from './detector.js';
import { classificarCapturaReal, entrenarModelo } from './realPipeline.js';
import { estimateRealGrid, estimateGridFromFloor, gridCellBoxes } from './grid.js';
import { decodePng } from './png.js';

export const UNKNOWN_TYPE = '*';

// ------------------------------------------------------------
// Carga del corpus
// ------------------------------------------------------------
/**
 * Carga `corpus/real/*.json` + la captura que cada etiqueta referencia.
 *
 * Devuelve `{ casos, errores }`. Una etiqueta rota NO detiene la carga: entra en
 * `errores` y el informe la menciona. Un corpus incompleto y declarado es mejor
 * que un corpus que se cae o que se salta ficheros en silencio.
 */
export function loadRealCorpusFs({ dir, readFile, readDir }) {
  const files = readDir(dir);
  const ids = [...new Set(files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))].sort();
  const casos = [];
  const errores = [];
  for (const id of ids) {
    try {
      const doc = JSON.parse(String(readFile(`${dir}/${id}.json`)));
      if (!Array.isArray(doc.objetos)) throw new Error('la etiqueta no tiene lista de objetos');
      if (!doc.cuadricula || !doc.cuadricula.cols || !doc.cuadricula.rows) throw new Error('falta la cuadrícula');
      const pngPath = `${dir}/${doc.captura || `captures/${id}.png`}`;
      const png = readFile(pngPath);
      const image = decodePng(png);
      if (image.width !== doc.resolucion?.width || image.height !== doc.resolucion?.height) {
        throw new Error(`la captura mide ${image.width}x${image.height} y la etiqueta dice ${doc.resolucion?.width}x${doc.resolucion?.height}`);
      }
      casos.push({ ...doc, id: doc.id || id, image });
    } catch (err) {
      errores.push({ id, error: err.message });
    }
  }
  return { casos, errores };
}

// ------------------------------------------------------------
// Utilidades de comparación
// ------------------------------------------------------------
/** Casilla de cada objeto etiquetado, con la cuadrícula HUMANA. */
export function labelCells(caso) {
  const { cols, rows } = caso.cuadricula;
  return caso.objetos
    .map((o) => ({ ...o, cell: o.cell || { x: o.x, y: o.y } }))
    .filter((o) => o.cell.x >= 0 && o.cell.y >= 0 && o.cell.x < cols && o.cell.y < rows);
}

/**
 * Compara objetos etiquetados contra objetos detectados, casilla a casilla.
 *
 * `detection.cells` es la rejilla de casillas del detector (cada una con `type`,
 * `status`). Sólo cuentan como «detectado» las casillas cuyo estado es
 * `confirmed` y cuyo tipo no es `empty`: una abstención no es un acierto.
 */
export function compareObjects(caso, detection) {
  const labels = labelCells(caso);
  const res = {
    id: caso.id, nivel: caso.nivel, nombre: caso.nombre,
    cells: [], confusion: new Map(),
    correct: 0, wrong: 0, missed: 0, falsePositive: 0, abstained: 0,
    unknownLabelled: 0, totalLabelled: labels.length, detections: 0,
  };
  if (!detection || !detection.ok) {
    res.skipped = true;
    return res;
  }
  const claimed = new Map();
  for (const row of detection.cells) {
    for (const cell of row) {
      if (cell.status !== REVIEW.CONFIRMED) continue;
      if (!cell.type || cell.type === 'empty') continue;
      claimed.set(`${cell.x},${cell.y}`, cell);
    }
  }
  res.detections = claimed.size;
  const consumed = new Set();
  for (const label of labels) {
    const key = `${label.cell.x},${label.cell.y}`;
    const got = claimed.get(key);
    const entry = { cell: label.cell, label: label.type, got: got ? got.type : null, outcome: null };
    if (label.type === UNKNOWN_TYPE) {
      // Objeto real fuera del catálogo: la clase no se puntúa, pero si el
      // detector afirma algo en esa casilla es un falso positivo de verdad.
      res.unknownLabelled++;
      entry.outcome = 'unknown-class';
      if (got) { res.falsePositive++; consumed.add(key); entry.outcome = 'unknown-class-claimed'; }
      res.cells.push(entry);
      continue;
    }
    if (!got) {
      // Distinguir «no lo vio» de «prefirió no afirmar» es obligatorio.
      const any = (detection.cells[label.cell.y] || [])[label.cell.x];
      if (any && any.status === REVIEW.CONFIRMED) { res.missed++; entry.outcome = 'missed'; }
      else { res.abstained++; entry.outcome = 'abstained'; }
      res.cells.push(entry);
      continue;
    }
    consumed.add(key);
    if (got.type === label.type) {
      res.correct++;
      entry.outcome = 'correct';
    } else {
      res.wrong++;
      entry.outcome = 'wrong';
      const k = `${label.type}>${got.type}`;
      res.confusion.set(k, (res.confusion.get(k) || 0) + 1);
    }
    res.cells.push(entry);
  }
  for (const [key, cell] of claimed) {
    if (consumed.has(key)) continue;
    res.falsePositive++;
    const k = `(nada)>${cell.type}`;
    res.confusion.set(k, (res.confusion.get(k) || 0) + 1);
    const [x, y] = key.split(',').map(Number);
    res.cells.push({ cell: { x, y }, label: null, got: cell.type, outcome: 'false-positive' });
  }
  return res;
}

/** Precisión/exhaustividad por clase. */
export function perClassMetrics(comparisons) {
  const stats = new Map();
  const bump = (tipo) => {
    if (!stats.has(tipo)) stats.set(tipo, { tipo, etiquetados: 0, aciertos: 0, confusiones: 0, omitidos: 0, abstenidos: 0, falsos: 0 });
    return stats.get(tipo);
  };
  for (const c of comparisons) {
    for (const cell of c.cells) {
      if (!cell.label || cell.label === UNKNOWN_TYPE) continue;
      const s = bump(cell.label);
      s.etiquetados++;
      if (cell.outcome === 'correct') s.aciertos++;
      else if (cell.outcome === 'wrong') s.confusiones++;
      else if (cell.outcome === 'missed') s.omitidos++;
      else if (cell.outcome === 'abstained') s.abstenidos++;
    }
    for (const [pair, n] of c.confusion) {
      const [from, to] = pair.split('>');
      if (from === '(nada)') bump(to).falsos += n;
    }
  }
  const round = (v) => (v === null ? null : Number(v.toFixed(3)));
  return [...stats.values()].map((s) => {
    const dichos = s.aciertos + s.confusiones + s.falsos;
    return {
      ...s,
      precision: dichos ? round(s.aciertos / dichos) : null,
      exhaustividad: s.etiquetados ? round(s.aciertos / s.etiquetados) : null,
    };
  }).sort((a, b) => b.etiquetados - a.etiquetados);
}

/** Matriz de confusión como objeto plano `"real>visto": n`. */
export function confusionMatrix(comparisons) {
  const m = {};
  for (const c of comparisons) {
    for (const [pair, n] of c.confusion) m[pair] = (m[pair] || 0) + n;
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

/** Acierto de la bandeja de bombas (multiconjunto, orden irrelevante). */
export function compareTray(expected, detected) {
  const norm = (list) => {
    const m = new Map();
    for (const item of list || []) {
      const key = item.type || item.tipo || item.class || 'unknown';
      m.set(key, (m.get(key) || 0) + (item.count ?? 1));
    }
    return m;
  };
  const exp = norm(expected);
  const det = norm(detected);
  const keys = new Set([...exp.keys(), ...det.keys()]);
  const diferencias = [];
  for (const k of keys) {
    const a = exp.get(k) || 0;
    const b = det.get(k) || 0;
    if (a !== b) diferencias.push({ tipo: k, esperado: a, detectado: b });
  }
  return {
    esperado: Object.fromEntries(exp),
    detectado: Object.fromEntries(det),
    acierto: diferencias.length === 0,
    diferencias,
  };
}

/** Lectura de temporizadores: por géiser etiquetado. */
export function compareTimers(expected, detection, { grid = null } = {}) {
  if (!expected || !expected.length) return { total: 0, aciertos: 0, detalle: [] };
  const detalle = [];
  let aciertos = 0;
  for (const t of expected) {
    const cell = findCell(detection, t.at);
    const leido = cell && cell.timer !== undefined ? cell.timer : null;
    const ok = leido !== null && Number(leido) === Number(t.value);
    if (ok) aciertos++;
    detalle.push({ at: t.at, esperado: t.value, leido, acierto: ok });
  }
  return { total: expected.length, aciertos, detalle };
}

/** Cables detonador ↔ dinamita. */
export function compareLinks(expected, detection) {
  if (!expected || !expected.length) return { total: 0, aciertos: 0, detalle: [] };
  const pairs = new Set();
  for (const link of (detection && detection.links) || []) {
    const key = `${link.from.x},${link.from.y}>${link.to.x},${link.to.y}`;
    pairs.add(key);
    pairs.add(`${link.to.x},${link.to.y}>${link.from.x},${link.from.y}`);
  }
  const detalle = expected.map((l) => {
    const key = `${l.from[0]},${l.from[1]}>${l.to[0]},${l.to[1]}`;
    return { par: key, encontrado: pairs.has(key) };
  });
  return { total: expected.length, aciertos: detalle.filter((d) => d.encontrado).length, detalle };
}

function findCell(detection, at) {
  if (!detection || !detection.ok || !at) return null;
  return (detection.cells[at[1]] || [])[at[0]] || null;
}

// ------------------------------------------------------------
// Evaluación de una captura
// ------------------------------------------------------------
/**
 * Evalúa una captura real en dos modos, que miden cosas distintas:
 *
 *   `end-to-end`  imagen completa → región → rejilla → clasificación.
 *                 Es lo que el sistema haría de verdad: si falla la rejilla,
 *                 falla todo y así se contabiliza.
 *   `clasificador` captura recortada al tablero + cuadrícula HUMANA.
 *                 Aísla el reconocimiento de objetos: mide si el clasificador
 *                 sabe leer el arte real cuando la rejilla se la dan hecha.
 *
 * Separarlos es obligatorio: si se mezclan, un fallo de rejilla puede parecer un
 * fallo de clasificación (o al contrario) y las dos cifras dejan de significar nada.
 */
export function evaluateRealCase(caso, opts = {}) {
  const mode = opts.mode || 'clasificador';
  const { data, width, height } = caso.image;
  const out = {
    id: caso.id, nivel: caso.nivel, nombre: caso.nombre, pagina: caso.pagina_pdf, modo: mode,
    rejilla: { esperado: `${caso.cuadricula.cols}x${caso.cuadricula.rows}`, estimado: null, acierto: false },
    bandeja: null, temporizadores: null, cables: null, comparacion: null, notas: [],
  };

  let cellGrid = null;
  if (mode === 'clasificador') {
    if (!caso.geometria) {
      out.comparacion = { id: caso.id, skipped: true, reason: 'sin geometría humana' };
      return out;
    }
    // Dos cosas distintas que el corpus guarda por separado:
    //   origen_recorte → dónde se recortó la captura dentro de la página
    //   fase_casilla   → desplazamiento de la rejilla DENTRO de la captura
    // La rejilla humana es la suma de las dos. Ignorar la fase desplaza todas
    // las casillas media casilla y hunde las métricas sin que el clasificador
    // tenga nada que ver; por eso la fase es dato obligatorio del corpus.
    const fase = caso.geometria.fase_casilla || { x: 0, y: 0 };
    cellGrid = gridCellBoxes({
      origin: { x: (caso.geometria.origen_recorte?.x || 0) + fase.x, y: (caso.geometria.origen_recorte?.y || 0) + fase.y },
      pitch: { x: caso.geometria.lado, y: caso.geometria.lado },
      cols: caso.cuadricula.cols,
      rows: caso.cuadricula.rows,
      width,
      height,
    });
    out.rejilla.estimado = 'dada (humana)';
    out.rejilla.fase = { x: fase.x, y: fase.y };
    out.notas.push('cuadrícula humana: mide el clasificador, no la rejilla');
  } else {
    // Sistema completo sobre la imagen tal cual se capturó.
    // Se prueba primero el estimador por DAMERO sobre la captura entera
    // (`estimateGridFromFloor`) y sólo si falla se recurre a la detección de
    // región + `estimateRealGrid`. El orden importa: el segundo necesita una
    // región de tablero que en estas capturas —recortadas al tablero— no existe
    // como objeto separado, y por eso devolvía rejillas de 4x4 o null.
    let grid = null;
    try {
      grid = estimateGridFromFloor(data, width, height);
      out.rejilla.metodo = 'damero (captura completa)';
    } catch (err) {
      out.notas.push(`rejilla damero: ${err.message}`);
    }
    if (!grid) {
      let region = null;
      try {
        region = opts.region || detectBoardRegion(data, width, height);
      } catch (err) {
        out.notas.push(`región: ${err.message}`);
      }
      if (!region || region.width < 40) {
        out.notas.push('no se encontró una región de tablero plausible');
        out.notas.push('segunda vía (región + juntas) no aplicable');
      } else {
        try {
          grid = estimateRealGrid(data, width, region);
          out.rejilla.metodo = 'juntas sobre región';
        } catch (err) {
          out.notas.push(`rejilla: ${err.message}`);
        }
      }
    }
    if (grid) {
      out.rejilla.estimado = `${grid.cols}x${grid.rows}`;
      out.rejilla.lado = grid.cell;
      out.rejilla.confianza = grid.confidence;
      out.rejilla.origen = grid.origin;
      out.rejilla.acierto = grid.cols === caso.cuadricula.cols && grid.rows === caso.cuadricula.rows;
      cellGrid = gridCellBoxes(grid);
      if (grid.warnings?.length) out.notas.push(...grid.warnings);
    }
  }

  if (!cellGrid) {
    out.comparacion = { id: caso.id, skipped: true, reason: 'sin rejilla' };
    out.bandeja = compareTray(caso.bandeja, []);
    out.temporizadores = compareTimers(caso.temporizadores, null);
    out.cables = compareLinks(caso.enlaces, null);
    return out;
  }
  const rows = cellGrid.length;
  const cols = cellGrid[0].length;
  const region = {
    x0: cellGrid[0][0].x0, y0: cellGrid[0][0].y0,
    x1: cellGrid[rows - 1][cols - 1].x1, y1: cellGrid[rows - 1][cols - 1].y1,
    width: cellGrid[0][cols - 1].x1 - cellGrid[0][0].x0 + 1,
    height: cellGrid[rows - 1][0].y1 - cellGrid[0][0].y0 + 1,
    warnings: [],
  };
  // En modo `clasificador` manda el reconocedor de arte real (prototipos
  // entrenados sólo con capturas de desarrollo). En `end-to-end` se usa la
  // canalización completa del detector sintético sobre la imagen tal cual.
  const det = mode === 'sintetico'
    ? detectBoard({ data, width, height }, { region, cols, rows, cellGrid, traySlots: caso.traySlots })
    : classificarCapturaReal({ data, width, height, cellGrid, modelo: opts.modelo });
  out.comparacion = compareObjects(caso, det);
  out.comparacion.modo = mode;
  // Casillas que la etiqueta declara VACÍAS: la otra mitad de la verdad. Un
  // detector que acierta todo lo que hay pero inventa objetos donde no hay nada
  // no sirve; contarlo aparte es lo que permite verlo.
  const etiquetadas = new Set(caso.objetos.map((o) => `${o.x},${o.y}`));
  out.vacias = { total: 0, reconocidas: 0, abstenidas: 0, inventadas: 0 };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (etiquetadas.has(`${c},${r}`)) continue;
      const cell = (det.cells[r] || [])[c];
      if (!cell) continue;
      out.vacias.total++;
      if (cell.type === 'empty' && cell.status === REVIEW.CONFIRMED) out.vacias.reconocidas++;
      else if (cell.type === null || cell.status !== REVIEW.CONFIRMED) out.vacias.abstenidas++;
      else out.vacias.inventadas++;
    }
  }
  out.bandeja = compareTray(caso.bandeja, det.tray);
  out.temporizadores = compareTimers(caso.temporizadores, det);
  out.cables = compareLinks(caso.enlaces, det);
  out.deteccion = { confianza: det.confidence, estado: det.status, filas: rows, columnas: cols };
  return out;
}

// ------------------------------------------------------------
// Agregado y partición
// ------------------------------------------------------------
/** Resumen agregado de una lista de evaluaciones. */
export function summarizeReal(results) {
  const comparaciones = results.map((r) => r.comparacion).filter((c) => c && !c.skipped);
  const sum = (k) => comparaciones.reduce((a, c) => a + (c[k] || 0), 0);
  const totalLabelled = sum('totalLabelled');
  const unknownLabelled = sum('unknownLabelled');
  const evaluables = totalLabelled - unknownLabelled;
  const correct = sum('correct');
  const gridOk = results.filter((r) => r.rejilla.acierto).length;
  const gridTotal = results.filter((r) => r.rejilla.estimado).length;
  const timers = results.map((r) => r.temporizadores).filter(Boolean);
  const timerTotal = timers.reduce((a, t) => a + t.total, 0);
  const timerOk = timers.reduce((a, t) => a + t.aciertos, 0);
  const links = results.map((r) => r.cables).filter(Boolean);
  const linkTotal = links.reduce((a, l) => a + l.total, 0);
  const linkOk = links.reduce((a, l) => a + l.aciertos, 0);
  const trays = results.map((r) => r.bandeja).filter(Boolean);
  const round = (v) => (v === null ? null : Number(v.toFixed(3)));
  return {
    capturas: results.length,
    capturasEvaluadas: comparaciones.length,
    niveles: new Set(results.map((r) => r.nivel).filter((n) => n !== null && n !== undefined)).size,
    rejilla: {
      aciertos: gridOk,
      total: gridTotal,
      exactitud: gridTotal ? round(gridOk / gridTotal) : null,
      metodo: results.find((r) => r.rejilla?.metodo)?.rejilla.metodo || null,
    },
    objetos: {
      etiquetados: totalLabelled,
      evaluables,
      desconocidos: unknownLabelled,
      correctos: correct,
      erroneos: sum('wrong'),
      omitidos: sum('missed'),
      falsosPositivos: sum('falsePositive'),
      abstenidos: sum('abstained'),
      precision: round(correct / Math.max(1, correct + sum('wrong') + sum('falsePositive'))),
      exhaustividad: round(correct / Math.max(1, evaluables)),
      abstencion: round(sum('abstained') / Math.max(1, evaluables)),
    },
    porClase: perClassMetrics(comparaciones),
    confusiones: confusionMatrix(comparaciones),
    bandeja: {
      capturas: trays.length,
      aciertos: trays.filter((t) => t.acierto).length,
    },
    temporizadores: { aciertos: timerOk, total: timerTotal },
    cables: { aciertos: linkOk, total: linkTotal },
    desconocidos: results.flatMap((r) => r.desconocidos || []),
  };
}

/**
 * Parte el corpus por NIVEL (nunca por captura): dos capturas del mismo nivel
 * son casi la misma imagen y partirlas sería hacer trampa.
 *
 * Dos capturas del mismo nivel son `p03` y `p04` (mismo nivel 83, dos estados
 * del mismo tablero): van siempre al mismo lado. El reparto es determinista
 * —niveles ordenados, los `evalRatio` primeros a evaluación— para que el
 * informe se pueda reproducir; no se sortea nada.
 */
export function splitByLevel(casos, { evalRatio = 0.4 } = {}) {
  const niveles = [...new Set(casos.map((c) => c.nivel).filter((n) => n !== null && n !== undefined))].sort((a, b) => a - b);
  const nEval = Math.max(1, Math.round(niveles.length * evalRatio));
  const evalSet = new Set(niveles.slice(0, nEval));
  return {
    dev: casos.filter((c) => !evalSet.has(c.nivel)),
    eval: casos.filter((c) => evalSet.has(c.nivel)),
    nivelesEval: [...evalSet],
    nivelesDev: niveles.filter((n) => !evalSet.has(n)),
  };
}

/**
 * Validación cruzada dejando un nivel fuera (leave-one-level-out).
 *
 * Es la forma honesta de medir con 13 capturas: se entrena con las capturas de
 * todos los niveles menos uno y se evalúa en el que queda fuera. Repetido para
 * cada nivel, todas las capturas acaban evaluadas con un modelo que no las ha
 * visto nunca. Dos capturas del mismo nivel caen siempre en el mismo pliegue.
 */
export function crossValidateByLevel(casos) {
  const grupos = new Map();
  for (const c of casos) {
    const key = c.nivel === null || c.nivel === undefined ? `id:${c.id}` : `n:${c.nivel}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(c);
  }
  const claves = [...grupos.keys()].sort();
  return claves.map((k) => ({
    grupo: k,
    dev: casos.filter((c) => !grupos.get(k).includes(c)),
    eval: grupos.get(k),
  }));
}

/** Texto legible del informe (para la CLI y para la UI). */
export function renderRealReport(summary, { errores = [], split = null } = {}) {
  const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)} %`);
  const L = [];
  L.push('CORPUS REAL — visión sobre capturas del juego');
  L.push('='.repeat(56));
  L.push(`Capturas cargadas: ${summary.capturas} · evaluadas: ${summary.capturasEvaluadas} · niveles distintos: ${summary.niveles}`);
  if (!summary.capturas) {
    L.push('');
    L.push('No hay capturas reales: no se puede afirmar nada sobre precisión real.');
    return L.join('\n');
  }
  L.push(`Rejilla (filas × columnas): ${summary.rejilla.aciertos}/${summary.rejilla.total} capturas — ${pct(summary.rejilla.exactitud)}`);
  const o = summary.objetos;
  L.push(`Objetos etiquetados a mano: ${o.etiquetados} (${o.desconocidos} de clase desconocida, no puntuados)`);
  L.push(`Objetos evaluables: ${o.evaluables}`);
  L.push(`  correctos            ${o.correctos}`);
  L.push(`  clase equivocada     ${o.erroneos}`);
  L.push(`  falsos positivos     ${o.falsosPositivos}`);
  L.push(`  omitidos             ${o.omitidos}`);
  L.push(`  no afirmados         ${o.abstenidos}`);
  L.push(`  precisión            ${pct(o.precision)}`);
  L.push(`  exhaustividad        ${pct(o.exhaustividad)}`);
  L.push(`  abstención           ${pct(o.abstencion)}`);
  L.push('');
  L.push('Por clase:');
  for (const c of summary.porClase) {
    L.push(`  ${c.tipo.padEnd(18)} etiquetados ${String(c.etiquetados).padStart(3)} · aciertos ${String(c.aciertos).padStart(3)} · conf ${String(c.confusiones).padStart(3)} · omit ${String(c.omitidos).padStart(3)} · abst ${String(c.abstenidos).padStart(3)} · falsos ${String(c.falsos).padStart(3)} · P ${pct(c.precision)} · R ${pct(c.exhaustividad)}`);
  }
  const conf = Object.entries(summary.confusiones);
  if (conf.length) {
    L.push('');
    L.push('Confusiones (real > visto):');
    for (const [k, n] of conf) L.push(`  ${k.replace('>', ' → ')} ×${n}`);
  }
  L.push('');
  L.push(`Bandeja de bombas: ${summary.bandeja.aciertos}/${summary.bandeja.capturas} capturas con inventario correcto`);
  L.push(`Temporizadores de géiser: ${summary.temporizadores.aciertos}/${summary.temporizadores.total} leídos bien`);
  L.push(`Cables detonador↔dinamita: ${summary.cables.aciertos}/${summary.cables.total} recuperados`);
  if (summary.desconocidos.length) {
    L.push('');
    L.push('Objetos sin identificar (deben seguir sin typeId):');
    for (const d of summary.desconocidos) L.push(`  · ${d}`);
  }
  if (split) {
    L.push('');
    L.push(`Partición por nivel: desarrollo ${split.nivelesDev.join(', ') || '—'} · evaluación ${split.nivelesEval.join(', ') || '—'}`);
  }
  if (errores.length) {
    L.push('');
    L.push('Etiquetas con problemas:');
    for (const e of errores) L.push(`  · ${e.id}: ${e.error}`);
  }
  L.push('');
  L.push('Recordatorio: esto mide RECONOCIMIENTO sobre capturas estáticas. No dice');
  L.push('nada sobre el comportamiento de las explosiones ni sobre física.');
  return L.join('\n');
}

// ------------------------------------------------------------
// Evaluación completa con validación cruzada por nivel
// ------------------------------------------------------------
/** Rejilla de casillas de un caso, con la fase de casilla ya aplicada. */
export function casoCellGrid(caso) {
  const fase = caso.geometria?.fase_casilla || { x: 0, y: 0 };
  const recorte = caso.geometria?.origen_recorte || { x: 0, y: 0 };
  return gridCellBoxes({
    origin: { x: recorte.x + fase.x, y: recorte.y + fase.y },
    pitch: { x: caso.geometria.lado, y: caso.geometria.lado },
    cols: caso.cuadricula.cols,
    rows: caso.cuadricula.rows,
  });
}

/**
 * Evalúa el corpus real de principio a fin con validación cruzada por nivel.
 *
 * `mode` elige qué se mide (ver `evaluateRealCase`):
 *   `clasificador` (por defecto) rejilla humana → aísla el reconocedor de arte.
 *   `estimada`     rejilla ESTIMADA de la captura → mide el sistema completo.
 *
 * Devuelve `{ pliegues, agregado, porClase, confusiones, notas }`. Cada pliegue
 * lleva su modelo entrenado sólo con las capturas de desarrollo y la evaluación
 * de las de reserva, de modo que quien lea el resultado pueda comprobar qué
 * capturas entrenaron qué.
 */
export function evaluateRealCorpus(casos, { opciones = {}, mode = 'clasificador' } = {}) {
  const pliegues = [];
  const todas = [];
  const notas = [];
  for (const { grupo, dev, eval: ev } of crossValidateByLevel(casos)) {
    const modelo = entrenarModelo(
      dev.map((c) => ({
        id: c.id,
        image: c.image,
        cellGrid: casoCellGrid(c),
        objetos: c.objetos,
      })),
      { etiqueta: `dev sin ${grupo}` },
    );
    const resultados = [];
    for (const caso of ev) {
      const r = evaluateRealCase(caso, { mode, modelo, opciones });
      resultados.push(r);
      todas.push(r);
    }
    const vaciasPliegue = resultados.reduce((a, r) => ({
      total: a.total + (r.vacias?.total || 0),
      reconocidas: a.reconocidas + (r.vacias?.reconocidas || 0),
      abstenidas: a.abstenidas + (r.vacias?.abstenidas || 0),
      inventadas: a.inventadas + (r.vacias?.inventadas || 0),
    }), { total: 0, reconocidas: 0, abstenidas: 0, inventadas: 0 });
    pliegues.push({
      grupo,
      dev: dev.map((c) => c.id),
      eval: ev.map((c) => c.id),
      clasesAprendidas: modelo.classes,
      resultados,
      resumen: { ...summarizeReal(resultados), vacias: vaciasPliegue },
    });
    for (const c of modelo.classes) {
      if (!dev.some((d) => d.objetos.some((o) => o.type === c))) notas.push(`clase ${c} sin muestra de desarrollo en ${grupo}`);
    }
  }
  const agregado = summarizeReal(todas);
  // Falsos positivos «de verdad»: afirmar una clase en una casilla que la
  // etiqueta declara vacía. `compareObjects` sólo cuenta lo etiquetado, así que
  // aquí se añade el recuento de casillas vacías y cuántas se inventaron.
  const vacias = { total: 0, reconocidas: 0, abstenidas: 0, inventadas: 0 };
  for (const r of todas) {
    if (!r.vacias) continue;
    vacias.total += r.vacias.total;
    vacias.reconocidas += r.vacias.reconocidas;
    vacias.abstenidas += r.vacias.abstenidas;
    vacias.inventadas += r.vacias.inventadas;
  }
  const round = (v) => (v === null || v === undefined ? null : Number(v.toFixed(3)));
  return {
    pliegues,
    agregado: {
      ...agregado,
      vacias: {
        ...vacias,
        exactitud: round(vacias.reconocidas / Math.max(1, vacias.total)),
        invencion: round(vacias.inventadas / Math.max(1, vacias.total)),
      },
    },
    porClase: agregado.porClase,
    confusiones: agregado.confusiones,
    notas,
  };
}

/**
 * Informe legible de la validación real.
 *
 * El orden no es casual: primero lo que se puede afirmar (cobertura del corpus
 * y método), luego el resultado con la ABSTENCIÓN como cifra de primera fila, y
 * sólo después el detalle. Una precisión sin su abstención al lado es una
 * cifra que engaña, así que van siempre juntas.
 */
export function renderRealCrossReport(cross) {
  const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)} %`);
  const L = [];
  const a = cross.agregado;
  const o = a.objetos;
  L.push('CORPUS REAL — validación cruzada dejando un nivel fuera');
  L.push('='.repeat(64));
  L.push('');
  L.push(`Capturas: ${a.capturas} · niveles distintos: ${a.niveles} · objetos etiquetados: ${o.etiquetados}`);
  L.push(`Pliegues (uno por nivel): ${cross.pliegues.length}. Cada captura se evalúa con un modelo`);
  L.push('entrenado SIN su nivel: nunca se mide sobre lo que se ajustó.');
  L.push('');
  L.push('RESULTADO SOBRE OBJETOS');
  L.push('-'.repeat(64));
  L.push(`  evaluables        ${o.evaluables}  (${o.desconocidos} de clase desconocida, no puntuados)`);
  L.push(`  aciertos          ${o.correctos}   (${pct(o.exhaustividad)} del total)`);
  L.push(`  clase equivocada  ${o.erroneos}`);
  L.push(`  falsos positivos  ${o.falsosPositivos}`);
  L.push(`  omitidos          ${o.omitidos}`);
  L.push(`  ABSTENCIONES      ${o.abstenidos}   (${pct(o.abstencion)} del total)`);
  L.push('');
  L.push(`  precisión sobre lo que el sistema AFIRMA: ${pct(o.precision)}`);
  L.push(`  (denominador = aciertos + equivocadas + falsos positivos = ${o.correctos + o.erroneos + o.falsosPositivos})`);
  L.push('');
  L.push('RESULTADO SOBRE CASILLAS VACÍAS');
  L.push('-'.repeat(64));
  const v = a.vacias;
  L.push(`  casillas etiquetadas como vacías: ${v.total}`);
  L.push(`  reconocidas como vacías        ${v.reconocidas}  (${pct(v.exactitud)})`);
  L.push(`  abstenidas                     ${v.abstenidas}`);
  L.push(`  INVENTADAS (objeto donde no hay) ${v.inventadas}  (${pct(v.invencion)})`);
  L.push('');
  L.push('REJILLA');
  L.push('-'.repeat(64));
  if (a.rejilla.metodo && a.rejilla.metodo !== 'dada (humana)') {
    L.push(`  capturas con rejilla estimada y comparada: ${a.rejilla.total}`);
    L.push(`  rejilla exacta (columnas Y filas)        ${a.rejilla.aciertos}  (${pct(a.rejilla.exactitud)})`);
    L.push(`  método: ${a.rejilla.metodo}`);
  } else {
    L.push('  no se estima: en este modo la rejilla la da la etiqueta humana.');
    L.push('  Para medirla, ejecuta con `--grid=estimada`.');
  }
  L.push('');
  L.push('POR PLIEGUE');
  L.push('-'.repeat(64));
  L.push('  nivel        captura(s)                          ok  equiv  absten  vacías-inventadas');
  for (const p of cross.pliegues) {
    const s = p.resumen.objetos;
    L.push(`  ${p.grupo.replace(/^n:|^id:/, '').padEnd(10)} ${p.eval.join(', ').slice(0, 34).padEnd(34)} ${String(s.correctos).padStart(3)} ${String(s.erroneos).padStart(6)} ${String(s.abstenidos).padStart(7)} ${String(p.resumen.vacias.inventadas).padStart(17)}`);
  }
  L.push('');
  if (cross.porClase.length) {
    L.push('POR CLASE');
    L.push('-'.repeat(64));
    L.push('  clase              etiquetados  aciertos  equiv  absten  precisión  exhaustividad');
    for (const c of cross.porClase) {
      L.push(`  ${c.tipo.padEnd(18)} ${String(c.etiquetados).padStart(11)} ${String(c.aciertos).padStart(9)} ${String(c.confusiones).padStart(6)} ${String(c.abstenidos).padStart(7)} ${pct(c.precision).padStart(10)} ${pct(c.exhaustividad).padStart(13)}`);
    }
    L.push('');
  }
  const conf = Object.entries(cross.confusiones || {});
  if (conf.length) {
    L.push('CONFUSIONES (real → visto)');
    L.push('-'.repeat(64));
    for (const [k, n] of conf) L.push(`  ${k.padEnd(34)} ${n}`);
    L.push('');
  }
  if (cross.notas.length) {
    L.push('NOTAS DEL ENTRENAMIENTO');
    L.push('-'.repeat(64));
    for (const n of cross.notas) L.push(`  · ${n}`);
    L.push('');
  }
  L.push('LO QUE ESTE INFORME NO DICE');
  L.push('-'.repeat(64));
  L.push('  · No dice que el detector "reconozca capturas reales" en general: son 13');
  L.push('    capturas de un tutorial, con un solo estilo de arte.');
  if (a.rejilla.metodo === 'dada (humana)') {
    L.push('  · La rejilla aquí es la HUMANA: se le da hecha al clasificador, así que');
    L.push('    esto mide el reconocimiento de arte, no la rejilla. El sistema completo');
    L.push('    (con la rejilla que él mismo estima) se mide con `--grid=estimada`, y');
    L.push('    sus fallos de rejilla se cuentan allí como fallos de objetos.');
  } else {
    L.push('  · La rejilla aquí es la ESTIMADA por el sistema, no la humana: las');
    L.push('    cifras incluyen los errores de rejilla. Para separar el reconocimiento');
    L.push('    de arte del resto, usa el modo por defecto (rejilla humana).');
  }
  L.push('  · La abstención no es un fallo del sistema: es el sistema diciendo que no');
  L.push('    lo sabe. Se cuenta aparte, nunca se suma a los aciertos.');
  return L.join('\n');
}
