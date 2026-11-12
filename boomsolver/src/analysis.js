// ============================================================
// BoomSolver — análisis explicativo
// ============================================================
// Herramientas que responden "¿por qué?" sin volver a implementar física:
// todo pasa por el simulador y el buscador.

import { prepareBoard, simulate } from './core/engine.js';
import { evaluateOutcome } from './core/goals.js';
import { solve } from './solver/solver.js';

/** Bombas presentes en TODAS las soluciones mínimas (necesidad lógica estructural). */
export function necessaryBombs(result) {
  const sols = result.solutions || [];
  if (!sols.length) return { cells: [], note: 'No hay soluciones con las que comparar.' };
  const cellSets = sols.map((s) => new Map(s.placements.map((p) => [p.idx, p.level])));
  const common = [];
  for (const [idx] of cellSets[0]) {
    if (cellSets.every((m) => m.has(idx))) {
      const levels = cellSets.map((m) => m.get(idx));
      common.push({ idx, alwaysSameLevel: new Set(levels).size === 1, levels });
    }
  }
  return {
    cells: common,
    note: common.length
      ? `${common.length} casilla(s) aparecen en todas las soluciones óptimas: son necesarias en esa posición.`
      : 'Ninguna casilla concreta es obligatoria: el nivel se resuelve por varias vías distintas.',
  };
}

/** Bombas que se pueden quitar sin perder la victoria (redundancia). */
export function redundantBombs(level, objectives, solution) {
  const board = prepareBoard(level);
  const map = new Map(solution.placements.map((p) => [p.idx, p.level]));
  const out = [];
  for (const idx of [...map.keys()]) {
    const reduced = new Map(map);
    reduced.delete(idx);
    if (reduced.size === 0) continue;
    let stillWins = false;
    for (const mecha of reduced.keys()) {
      const res = simulate(board, reduced, mecha, board.rules);
      if (evaluateOutcome(board, res, objectives).win) { stillWins = true; break; }
    }
    if (stillWins) out.push(idx);
  }
  return { removable: out, note: out.length ? `${out.length} bomba(s) son redundantes en esta jugada concreta.` : 'Todas las bombas colocadas son necesarias en esta jugada.' };
}

/**
 * Análisis contrafactual: prueba variantes y dice si siguen ganando.
 * variants: [{label, level?, place?, remove?, changeLevel?}]
 */
export function counterfactual(level, objectives, solution, variants = []) {
  const out = [];
  for (const v of variants) {
    let lvl = v.level || level;
    let map = new Map(solution.placements.map((p) => [p.idx, p.level]));
    if (v.remove != null) map.delete(v.remove);
    if (v.changeLevel && v.changeLevel.idx != null) map.set(v.changeLevel.idx, v.changeLevel.level);
    if (v.move && v.move.from != null) {
      const lvlOfBomb = map.get(v.move.from);
      map.delete(v.move.from);
      map.set(v.move.to, lvlOfBomb ?? 1);
    }
    const board = prepareBoard(lvl);
    let best = null;
    for (const mecha of map.keys()) {
      const res = simulate(board, map, mecha, board.rules);
      const verdict = evaluateOutcome(board, res, objectives);
      if (!best || (verdict.win && !best.win)) best = { win: verdict.win, verdict, result: res };
    }
    out.push({
      label: v.label || 'variante',
      win: !!best && best.win,
      failures: best ? best.verdict.failures.map((f) => f.message) : ['sin bombas colocadas'],
      reason: best ? (best.result.reason || 'resolved') : 'sin bombas',
    });
  }
  return out;
}

/** Qué casillas puede alcanzar una bomba concreta (mapa de calor). */
export function heatmapFor(level, placements = []) {
  const board = prepareBoard(level);
  const map = new Map(placements.map((p) => [Array.isArray(p) ? p[0] : p.idx, Array.isArray(p) ? p[1] : p.level]));
  const counts = new Int32Array(board.n);
  let hazards = new Set();
  for (const mecha of map.keys()) {
    const res = simulate(board, map, mecha, board.rules);
    for (const tick of res.ticks) {
      for (const ex of tick.explosions || []) {
        for (const c of ex.cells) {
          const [x, y] = c.split(',').map(Number);
          counts[y * board.cols + x]++;
        }
      }
    }
    if (res.metrics.hazard) hazards.add(res.metrics.hazard.index);
  }
  return { counts: Array.from(counts), hazardRisk: [...hazards], board };
}

/** Diagnóstico de nivel imposible con causas concretas. */
export function explainImpossible(level, objectives, options = {}) {
  const result = solve(level, objectives, { ...options, maxSolutions: 1, maxBombs: options.maxBombs ?? 4 });
  if (result.solutions.length > 0) {
    return { impossible: false, note: 'Sí hay solución; no se puede declarar imposible.', result };
  }
  const causes = [];
  for (const r of result.reasons) causes.push(r);

  const board = prepareBoard(level);
  // ¿Objeticos alcanzables por alguna bomba?
  const targetTypes = new Set();
  for (const o of objectives) for (const t of (o.types || (o.type ? [o.type] : []))) targetTypes.add(t);
  const blocked = [];
  for (let i = 0; i < board.n; i++) {
    if (board.hp0[i] <= 0 || !targetTypes.has(board.types[i])) continue;
    const single = solve(level, [{ kind: 'destroy', types: [board.types[i]], count: 1 }], { maxBombs: 1, maxSolutions: 1, timeBudgetMs: 800 });
    if (single.solutions.length === 0) blocked.push({ cell: `${i % board.cols},${Math.floor(i / board.cols)}`, type: board.types[i] });
  }
  if (blocked.length) {
    causes.push(`Estos objetivos no se pueden alcanzar ni con una bomba dedicada: ` +
      blocked.map((b) => `${b.type} en (${b.cell})`).join(', ') + '.');
  }
  const trayPowder = (level.tray || []).reduce((a, l) => a + ({ 1: 1, 2: 2, 3: 4, 4: 8 }[l] || 0), 0);
  causes.push(`Recursos disponibles: ${(level.tray || []).length} bomba(s), ${trayPowder} de pólvora.`);
  return { impossible: true, causes, result, status: result.status, proven: result.status === 'infeasible' };
}

/** Sugerencia: la siguiente decisión útil sin revelar toda la solución. */
export function hint(level, objectives, options = {}) {
  const result = solve(level, objectives, { ...options, maxSolutions: 20 });
  if (!result.solutions.length) return { hint: null, message: result.proofNote || 'Sin solución encontrada.' };
  const bombCounts = new Map();
  for (const s of result.solutions) {
    for (const p of s.placements) bombCounts.set(p.idx, (bombCounts.get(p.idx) || 0) + 1);
  }
  const ranked = [...bombCounts.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const cols = level.cols;
  return {
    hint: best ? { cell: `${best[0] % cols},${Math.floor(best[0] / cols)}`, appearIn: best[1], of: result.solutions.length } : null,
    message: best
      ? `Prueba a colocar una bomba en C${(best[0] % cols) + 1}F${Math.floor(best[0] / cols) + 1}: aparece en ${best[1]} de ${result.solutions.length} soluciones óptimas.`
      : 'No se pudo extraer una pista fiable.',
    minimumBombs: result.solutions[0].physicalBombs,
  };
}
