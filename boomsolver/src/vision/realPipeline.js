// ============================================================
// BoomSolver — tubería de reconocimiento sobre capturas REALES
// ============================================================
// QUÉ HACE
// --------
// Convierte una captura ya troceada en casillas (`cellGrid`) en la misma forma
// de salida que `detectBoard()`: una rejilla de celdas con `{type,status,
// confidence,evidence}`. Así la evaluación (`realEval.js`) compara peras con
// peras y el resto del sistema no necesita saber de dónde salió la lectura.
//
// DE DÓNDE SALE EL MODELO
// -----------------------
// El modelo de prototipos se entrena SÓLO con las capturas de DESARROLLO del
// corpus. Nunca con las de evaluación: por eso `cargarModeloDesdeCorpus`
// recibe la lista de ids permitidos y no "todo lo que haya".
//
// LO QUE NO HACE
// --------------
// · No estima la rejilla: la recibe hecha. La estimación de rejilla es otro
//   problema (y hoy no está resuelto: ver `estimateRealGrid`).
// · No lee la bandeja ni los cables: eso está fuera del alcance de esta fase y
//   se contesta con `null` en vez de con una invención.

import { classifyRealCell, realCellFeatures, trainModel } from './realClassifier.js';
import { REVIEW } from './detector.js';

/** Trocea la captura y clasifica cada casilla. */
export function classificarCapturaReal({ data, width, height, cellGrid, modelo, opciones = {} }) {
  const rows = cellGrid.length;
  const cols = cellGrid[0]?.length || 0;
  if (!rows || !cols) return { ok: false, reason: 'rejilla vacía' };
  if (!modelo) return { ok: false, reason: 'sin modelo entrenado' };
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const g = cellGrid[r][c];
      // Recortar al lienzo: una casilla que se sale de la imagen no se puede
      // leer, y leerla a medias daría rasgos falsos.
      const box = {
        x0: Math.max(0, g.x0), y0: Math.max(0, g.y0),
        x1: Math.min(width - 1, g.x1), y1: Math.min(height - 1, g.y1),
      };
      const usable = box.x1 - box.x0 + 1 >= (g.x1 - g.x0 + 1) * 0.6
        && box.y1 - box.y0 + 1 >= (g.y1 - g.y0 + 1) * 0.6;
      if (!usable) {
        row.push({
          x: c, y: r, type: null, status: REVIEW.NEEDS_REVIEW, confidence: 0,
          evidence: ['la casilla se sale de la captura'], features: null,
        });
        continue;
      }
      const res = classifyRealCell(data, width, box, modelo, opciones);
      row.push({ x: c, y: r, ...res });
    }
    cells.push(row);
  }
  const stats = cells.flat();
  return {
    ok: true,
    status: REVIEW.CONFIRMED,
    cells,
    cols,
    rows,
    confidence: Number((stats.reduce((a, c) => a + (c.confidence || 0), 0) / stats.length).toFixed(3)),
    tray: null,
    timers: null,
    links: null,
  };
}

/** Rasgos crudos de todas las casillas (para entrenar y para depurar). */
export function extraerMuestras({ data, width, height, cellGrid, etiquetas = [] }) {
  const byCell = new Map(etiquetas.map((o) => [`${o.x},${o.y}`, o.type]));
  const out = [];
  for (let r = 0; r < cellGrid.length; r++) {
    for (let c = 0; c < cellGrid[r].length; c++) {
      const g = cellGrid[r][c];
      const box = {
        x0: Math.max(0, g.x0), y0: Math.max(0, g.y0),
        x1: Math.min(width - 1, g.x1), y1: Math.min(height - 1, g.y1),
      };
      if (box.x1 - box.x0 + 1 < (g.x1 - g.x0 + 1) * 0.6) continue;
      if (box.y1 - box.y0 + 1 < (g.y1 - g.y0 + 1) * 0.6) continue;
      out.push({ x: c, y: r, type: byCell.get(`${c},${r}`) || 'empty', features: realCellFeatures(data, width, box) });
    }
  }
  return out;
}

/**
 * Entrena el modelo con las capturas indicadas.
 *
 * @param {{id:string,image:{data,width,height},cellGrid:any[][],objetos:{x:number,y:number,type:string}[]}[]} casos
 * @param {string} [etiqueta] nombre del conjunto, sólo para trazabilidad
 */
export function entrenarModelo(casos, { etiqueta = 'desarrollo' } = {}) {
  const samples = [];
  for (const caso of casos) {
    for (const m of extraerMuestras({ ...caso.image, cellGrid: caso.cellGrid, etiquetas: caso.objetos })) {
      // `*` = objeto fuera del catálogo: no se aprende, se deja fuera.
      if (m.type === 'empty' || m.type === '*') continue;
      samples.push({ type: m.type, features: m.features });
    }
  }
  const modelo = trainModel(samples);
  modelo.etiqueta = etiqueta;
  modelo.capturas = casos.map((c) => c.id);
  modelo.clases = modelo.classes.slice();
  return modelo;
}
