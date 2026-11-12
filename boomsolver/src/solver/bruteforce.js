// ============================================================
// BoomSolver — fuerza bruta INDEPENDIENTE (oráculo de validación)
// ============================================================
// Objetivo: comprobar que el buscador no se miente a sí mismo.
//
// Este módulo NO reutiliza nada del solver: ni fusión de cargamentos, ni poda
// por candidatos, ni firmas canónicas, ni ordenaciones de Pareto. Recorre el
// espacio completo de jugadas de un tablero pequeño:
//
//   para k = 1..kMax:
//     para cada subconjunto de k casillas colocables:
//       para cada asignación de niveles del inventario:
//         para cada bomba como mecha:
//           simular con el motor y evaluar los objetivos
//
// Comparte con el solver sólo dos cosas, y a propósito: el MOTOR FÍSICO
// (debe ser el mismo, es el producto) y la EVALUACIÓN DE OBJETIVOS (es la
// definición de "ganar"). Todo lo demás está escrito de cero aquí para que un
// error del solver no se repita en su propia verificación.
//
// Límites: pensado para tableros pequeños. `maxCombos` protege la memoria y,
// si se alcanza, el resultado se declara `complete: false` (nunca "imposible").

import { BOMB_LEVELS } from '../core/catalog.js';
import { prepareBoard, simulate } from '../core/engine.js';
import { evaluateOutcome } from '../core/goals.js';

/** Todas las combinaciones de k índices sobre `arr` (orden ascendente). */
function chooseIndices(arr, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push(acc.slice()); return out; }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    chooseIndices(arr, k, i + 1, acc, out);
    acc.pop();
  }
  return out;
}

/** Asignaciones de nivel (con repetición) sobre `idx` casillas, tomando del inventario. */
function* levelAssignments(inventory, slots) {
  const used = new Array(inventory.length).fill(false);
  const acc = [];
  function* rec() {
    if (acc.length === slots) { yield acc.slice(); return; }
    for (let i = 0; i < inventory.length; i++) {
      if (used[i]) continue;
      // Evitar repetir la misma decisión con bombas idénticas del inventario.
      if (i > 0 && inventory[i] === inventory[i - 1] && !used[i - 1]) continue;
      used[i] = true;
      acc.push(inventory[i]);
      yield* rec();
      acc.pop();
      used[i] = false;
    }
  }
  yield* rec();
}

export function bruteForce(level, objectives, options = {}) {
  const {
    maxBombs = 2,
    maxCombos = 500000,
    includeFusions = false,
    onSolution = null,
  } = options;

  const board = prepareBoard(level);
  const placeable = [];
  for (let i = 0; i < board.n; i++) if (board.placeable[i]) placeable.push(i);

  // Inventarios: la bandeja tal cual y, opcionalmente, cada resultado de fusionar
  // dos bombas iguales (o 1+2 en modo suma), calculado a mano aquí.
  const inventories = [level.tray.slice()];
  if (includeFusions) {
    const seen = new Set([level.tray.slice().sort().join(',')]);
    const frontier = [level.tray.slice()];
    let guard = 0;
    while (frontier.length && guard++ < 200) {
      const cur = frontier.pop();
      for (let i = 0; i < cur.length; i++) {
        for (let j = i + 1; j < cur.length; j++) {
          const a = cur[i];
          const b = cur[j];
          let out = 0;
          if (a === b && a < 4) out = a + 1;
          else if (board.rules.fusionMode === 'sum' && a === 1 && b >= 2 && b < 4) out = b + 1;
          else if (board.rules.fusionMode === 'sum' && b === 1 && a >= 2 && a < 4) out = a + 1;
          if (!out) continue;
          const next = cur.filter((_, k) => k !== i && k !== j).concat([out]).sort();
          const key = next.join(',');
          if (seen.has(key)) {
            // Mismo inventario: ya está considerado.
          } else {
            seen.add(key);
            inventories.push(next);
            frontier.push(next);
          }
        }
      }
    }
  }

  const winners = [];
  let combosTried = 0;
  let complete = true;
  const t0 = Date.now();

  outer:
  for (let k = 1; k <= maxBombs; k++) {
    if (k > placeable.length) break;
    for (const cells of chooseIndices(placeable, k)) {
      for (const inventory of inventories) {
        if (inventory.length < k) continue;
        for (const levels of levelAssignments(inventory, k)) {
          for (let rot = 0; rot < k; rot++) {
            // Cada bomba, una vez, como mecha.
            const mecha = cells[rot];
            const map = new Map();
            for (let i = 0; i < k; i++) map.set(cells[i], levels[(i + rot) % k]);
            combosTried++;
            if (combosTried > maxCombos) { complete = false; break outer; }
            const res = simulate(board, map, mecha, board.rules);
            const verdict = evaluateOutcome(board, res, objectives);
            if (!verdict.win) continue;
            const sol = {
              k,
              mecha,
              placements: cells.map((c, i) => ({ idx: c, level: levels[(i + rot) % k] })),
              powder: cells.reduce((a, c, i) => a + BOMB_LEVELS[levels[(i + rot) % k]].powder, 0),
              ticks: res.metrics.tickCount,
              source: 'brute-force',
            };
            winners.push(sol);
            if (onSolution) onSolution(sol);
          }
        }
      }
    }
    // Si hay soluciones con k bombas, no hace falta mirar k+1 para demostrar el mínimo.
    if (winners.length > 0) break;
  }

  const firstK = winners.length ? winners[0].k : null;
  return {
    complete,
    combosTried,
    elapsedMs: Date.now() - t0,
    minimumBombs: firstK,
    solutions: winners.filter((w) => w.k === firstK),
    allWinners: winners,
    inventoriesConsidered: inventories.length,
  };
}

/** Firma de una jugada para comparar con el solver sin depender de su formato. */
export function bruteSignature(sol) {
  return sol.placements
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((p) => `${p.idx}:${p.level}`)
    .join('+') + `@${sol.mecha}`;
}

export function solverSignature(sol) {
  return sol.placements
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((p) => `${p.idx}:${p.level}`)
    .join('+') + `@${sol.mecha.idx}`;
}
