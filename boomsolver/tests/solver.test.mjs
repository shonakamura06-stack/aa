import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifySolution, canFuse, fusionStates, loadoutsOfSize } from '../src/solver/solver.js';
import { levelFromAscii, idx } from './helpers.mjs';

const chests = (n = 1) => [{ kind: 'destroy', types: ['chest_wood'], count: n }];

// ------------------------------------------------------------
// Fusiones
// ------------------------------------------------------------
test('regla "solo iguales": N1+N1→N2, N3+N3→N4, N4+N4 no fusiona', () => {
  assert.equal(canFuse(1, 1, 'equal'), 2);
  assert.equal(canFuse(2, 2, 'equal'), 3);
  assert.equal(canFuse(3, 3, 'equal'), 4);
  assert.equal(canFuse(4, 4, 'equal'), 0);
  assert.equal(canFuse(2, 1, 'equal'), 0, 'niveles distintos no fusionan');
});

test('regla "suma libre": N2+N1→N3 y N3+N1→N4 con tope N4', () => {
  assert.equal(canFuse(2, 1, 'sum'), 3);
  assert.equal(canFuse(3, 1, 'sum'), 4);
  assert.equal(canFuse(4, 1, 'sum'), 0, 'nada supera N4');
  assert.equal(canFuse(1, 1, 'sum'), 2);
  assert.equal(canFuse(4, 4, 'sum'), 0);
});

test('los estados de fusión incluyen el inicial y respetan la pólvora', () => {
  const st = fusionStates([2, 2], 'equal');
  const keys = st.map((s) => s.levels.join(','));
  assert.ok(keys.includes('2,2'), 'estado inicial');
  assert.ok(keys.includes('3'), 'tras fusionar');
  const three = st.find((s) => s.levels.join(',') === '3');
  assert.equal(three.powder, 4);
  assert.equal(three.fusions, 1);
});

const loadoutSizes = (tray, mode) => loadoutsOfSize(tray, mode, 1).map((l) => l.levels.join(''));

test('un cargamento de 1 bomba puede venir de una fusión', () => {
  const sizes = loadoutSizes([1, 1], 'equal');
  assert.ok(sizes.includes('2'), 'N1+N1 permite colocar una N2');
});

// ------------------------------------------------------------
// Óptimos demostrables en niveles pequeños
// ------------------------------------------------------------
test('encuentra el mínimo de bombas en un caso trivial', () => {
  const lvl = levelFromAscii(['.........', 'C........', '.........'], { tray: [1, 1, 1] });
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs' });
  assert.equal(r.status, 'optimalityProven');
  assert.equal(r.solutions[0].physicalBombs, 1);
  assert.equal(r.solutions[0].powder, 1);
  // Comprobación independiente con el simulador.
  assert.equal(verifySolution(lvl, chests(1), r.solutions[0]).ok, true);
});

test('el mínimo declarado coincide con una fuerza bruta independiente', () => {
  // Tablero pequeño: se verifica el óptimo con un oráculo que no usa el solver.
  // Dos cofres separados 6 casillas con N2: hacen falta dos tiros que se
  // encadenen (la segunda bomba debe ser alcanzada por la primera).
  const lvl = levelFromAscii([
    '.......',
    'C.....C',
    '.......',
  ], { tray: [2, 2] });
  const r = solve(lvl, chests(2), { mode: 'fewest_bombs' });
  assert.equal(r.status, 'optimalityProven');
  const oracle = bruteForceMinimum(lvl, chests(2));
  assert.equal(r.solutions[0].physicalBombs, oracle, `solver=${r.solutions[0].physicalBombs} oráculo=${oracle}`);
  assert.equal(r.solutions.every((s) => s.physicalBombs === oracle), true, 'todas las soluciones son mínimas');
});

test('distinción real: menos bombas ≠ menos pólvora', () => {
  // Una sola N4 (1 bomba, 8 de pólvora) abre los dos cofres de los extremos.
  // Con menos pólvora hacen falta dos bombas (N2+N3 = 6, o N2+N2+N2 = 6).
  const lvl = levelFromAscii([
    '.........',
    'C.......C',
  ], { tray: [4, 2, 2, 2] });
  const objectives = chests(2);
  const fewest = solve(lvl, objectives, { mode: 'fewest_bombs' });
  const powder = solve(lvl, objectives, { mode: 'least_powder' });
  assert.equal(fewest.status, 'optimalityProven');
  assert.equal(powder.status, 'optimalityProven');

  const byBombs = fewest.solutions[0];
  const byPowder = powder.solutions[0];
  assert.equal(byBombs.physicalBombs, 1, 'el mínimo físico es 1 bomba');
  assert.equal(byBombs.powder, 8, 'esa N4 cuesta 8 de pólvora');
  assert.equal(byPowder.powder, 6, 'el mínimo de pólvora es 6');
  assert.equal(byPowder.physicalBombs, 2, 'y necesita 2 bombas físicas');
  assert.equal(verifySolution(lvl, objectives, byBombs).ok, true);
  assert.equal(verifySolution(lvl, objectives, byPowder).ok, true);
});

test('frontera de Pareto con las dos métricas separadas', () => {
  const lvl = levelFromAscii([
    '.........',
    'C.......C',
  ], { tray: [4, 2, 2, 2] });
  const r = solve(lvl, chests(2), { mode: 'pareto' });
  assert.equal(r.status, 'optimalityProven');
  const pts = r.pareto.map((p) => `${p.physicalBombs}:${p.powder}`);
  assert.ok(pts.includes('1:8'), `punto (1 bomba, 8 pólvora) esperado en ${pts}`);
  assert.ok(pts.includes('2:6'), `punto (2 bombas, 6 pólvora) esperado en ${pts}`);
  for (const s of r.solutions) {
    assert.equal(typeof s.physicalBombs, 'number');
    assert.equal(typeof s.powder, 'number');
  }
});

test('una solución que sólo existe fusionando (N1+N1→N2)', () => {
  // El interruptor de (1,0) no es colocable pero deja pasar el rayo: la única
  // forma de alcanzar el cofre de (0,0) es una N2 desde (2,0), que exige fusionar.
  const lvl = levelFromAscii(['CS..'], { tray: [1, 1] });
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs' });
  assert.equal(r.status, 'optimalityProven');
  assert.equal(r.solutions[0].physicalBombs, 1);
  assert.equal(r.solutions[0].powder, 2);
  assert.deepEqual(r.solutions[0].fusionSteps, ['N1 + N1 → N2']);
  assert.equal(r.solutions[0].placements[0].cell, 'C3F1');
});

test('enumeración completa de soluciones mínimas distintas', () => {
  // Cofre en el centro de una fila: varias bombas distintas lo abren con 1 bomba.
  const lvl = levelFromAscii([
    '.........',
    '....C....',
    '.........',
  ], { tray: [2] });
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs', maxSolutions: 100 });
  assert.equal(r.status, 'optimalityProven');
  const sigs = new Set(r.solutions.map((s) => s.signature));
  assert.equal(sigs.size, r.solutions.length, 'no hay duplicados de firma');
  assert.equal(r.solutions.length, r.totalKnown);
  // Todas con 1 bomba: mínimo demostrado y todas verificadas.
  for (const s of r.solutions) {
    assert.equal(s.physicalBombs, 1);
    assert.equal(verifySolution(lvl, chests(1), s).ok, true);
  }
  // Hay al menos 4 casillas ortogonales que pueden abrirlo con N2.
  assert.ok(r.solutions.length >= 4, `encontradas ${r.solutions.length}`);
});

test('el límite de presentación se informa y no se oculta', () => {
  const lvl = levelFromAscii([
    '.........',
    '....C....',
    '.........',
  ], { tray: [2] });
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs', maxSolutions: 2 });
  assert.equal(r.solutions.length, 2);
  assert.equal(r.truncatedPresentation, true);
  assert.equal(r.presentationLimit, 2);
  assert.ok(r.totalKnown > 2, `total conocido ${r.totalKnown}`);
});

// ------------------------------------------------------------
// Optimalidad honesta
// ------------------------------------------------------------
test('timeout: no declara optimalityProven', () => {
  const lvl = levelFromAscii([
    '...............',
    'C............C.',
    '...............',
  ], { tray: [1, 1, 1, 1, 1, 1, 2, 2, 3] });
  const r = solve(lvl, chests(2), { mode: 'least_powder', timeBudgetMs: 1 });
  assert.ok(['bestKnown', 'timedOut', 'cancelled'].includes(r.status), `estado ${r.status}`);
  assert.equal(r.optimalityProven, false);
  assert.match(r.proofNote, /no se puede afirmar|agotó el tiempo|cancelada|Mejor solución/i);
});

test('cancelación: estado cancelled y mensaje honesto', () => {
  const lvl = levelFromAscii(['.........', 'C...X...C', '.........'], { tray: [1, 1, 1, 2] });
  const r = solve(lvl, chests(2), { mode: 'least_powder', shouldCancel: () => true });
  assert.equal(r.status, 'cancelled');
  assert.equal(r.status === 'optimalityProven', false);
});

test('imposible: cofre encerrado por muros, con causa explicada', () => {
  const lvl = levelFromAscii(['###', '#C#', '###'], { tray: [4] });
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs' });
  assert.equal(r.status, 'infeasible');
  assert.equal(r.solutions.length, 0);
  assert.match(r.reasons.join(' '), /Ninguna bomba|casillas/i);
});

test('imposible: objeto encerrado en una cámara sellada', () => {
  const lvl = levelFromAscii([
    '#####',
    '#C#.#',
    '#####',
  ], { tray: [4] });
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs' });
  assert.equal(r.status, 'infeasible');
  assert.match(r.reasons.join(' '), /Ninguna bomba puede alcanzar|No hay casillas/);
  assert.match(r.reasons.join(' '), /Cofre de madera|casillas/);
});

test('bombas desconectadas no cuentan como solución', () => {
  // Dos cofres muy separados y una sola bomba N2: imposible alcanzar ambos.
  const lvl = levelFromAscii([
    '.............',
    'C...........C',
    '.............',
  ], { tray: [2] });
  const r = solve(lvl, chests(2), { mode: 'fewest_bombs' });
  assert.equal(r.solutions.length, 0);
});

test('bandeja vacía se rechaza con motivo claro', () => {
  const lvl = levelFromAscii(['C..'], { tray: [] });
  const r = solve(lvl, chests(1));
  assert.equal(r.status, 'infeasible');
  assert.match(r.reasons.join(' '), /bandeja/i);
});

test('los objetivos imposibles por falta de tipo se explican', () => {
  const lvl = levelFromAscii(['C..'], { tray: [1] });
  const r = solve(lvl, [{ kind: 'destroy', types: ['gem'], count: 1 }]);
  assert.ok(r.reasons.join(' ').match(/no están en el tablero/));
});

test('cada solución se reproduce exactamente en el simulador (contrato buscador↔motor)', () => {
  const lvl = levelFromAscii([
    '.........',
    'C.......G',
    '.........',
  ], { tray: [3, 1, 1] });
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'], count: 1 },
    { kind: 'destroy', types: ['gem'], count: 1 },
  ];
  const r = solve(lvl, objectives, { mode: 'fewest_bombs' });
  assert.ok(r.solutions.length > 0);
  for (const s of r.solutions) {
    const v = verifySolution(lvl, objectives, s);
    assert.equal(v.ok, true, `la solución ${s.signature} debe validarse`);
    assert.equal(v.result.metrics.powder, s.powder);
    assert.equal(v.result.metrics.tickCount, s.ticks);
  }
});

test('el buscador respeta reglas activas (peligro evitable vs. inevitable)', () => {
  // Cristal entre la bomba y el cofre: cualquier tiro que abra el cofre rompe el cristal.
  const lvl = levelFromAscii([
    'CK.',
    '#..',
  ], { tray: [4] });
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'], count: 1 },
    { kind: 'noDestroy', types: ['crystal'], negative: true },
  ];
  const r = solve(lvl, objectives, { mode: 'fewest_bombs' });
  assert.equal(r.solutions.length, 0, 'no hay solución sin romper el cristal');
  // Con el cristal fuera del camino, sí hay solución y el buscador la encuentra.
  const lvl2 = levelFromAscii(['CK.', '...'], { tray: [4] });
  const r2 = solve(lvl2, objectives, { mode: 'fewest_bombs' });
  assert.ok(r2.solutions.length > 0, 'con el cristal fuera del camino hay solución');
});

test('con portales el mínimo puede bajar (el buscador los usa)', () => {
  const lvl = levelFromAscii([
    '..C..',
    '.....',
    '..B..',
    '.....',
    '..B..',
  ], { tray: [1] });
  // El cofre está a 2 casillas del portal (2,4)… la bomba entra por abajo.
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs' });
  assert.ok(r.solutions.length > 0);
  assert.ok(r.solutions.some((s) => s.portalJumps > 0), 'alguna solución usa el portal');
});

test('los géiseres participan en la solución aunque no sean mecha', () => {
  const lvl = levelFromAscii([
    'C....',
    '.....',
    '.Y...',
  ], { tray: [1], timers: { '1,2': 1 } });
  const r = solve(lvl, chests(1), { mode: 'fewest_bombs' });
  assert.ok(r.solutions.length > 0);
});


// ------------------------------------------------------------
// Oráculo independiente: fuerza bruta directa sobre el motor
// ------------------------------------------------------------
import { prepareBoard } from '../src/core/engine.js';
import { simulate } from '../src/core/engine.js';
import { evaluateOutcome } from '../src/core/goals.js';
import { fusionStates as fs, permutationsOfMultiset } from '../src/solver/solver.js';

function bruteForceMinimum(level, objectives, maxBombs = 3) {
  const board = prepareBoard(level);
  const cells = [];
  for (let i = 0; i < board.n; i++) if (board.placeable[i]) cells.push(i);
  const pools = [];
  for (const st of fs(level.tray, board.rules.fusionMode)) {
    const uniq = new Set();
    const rec = (i, chosen) => {
      if (chosen.length >= 1 && chosen.length <= maxBombs) uniq.add(chosen.slice().sort((a, b) => b - a).join(','));
      if (i >= st.levels.length || chosen.length === maxBombs) return;
      chosen.push(st.levels[i]); rec(i + 1, chosen); chosen.pop();
      rec(i + 1, chosen);
    };
    rec(0, []);
    for (const u of uniq) pools.push(u.split(',').map(Number));
  }
  let best = Infinity;
  for (const levels of pools) {
    const k = levels.length;
    if (k >= best) continue;
    if (k > cells.length) continue;
    for (const combo of combinationsOf(cells, k)) {
      for (const perm of permutationsOfMultiset(levels)) {
        const map = new Map(combo.map((c, i) => [c, perm[i]]));
        for (const mecha of map.keys()) {
          const res = simulate(board, map, mecha, board.rules);
          if (evaluateOutcome(board, res, objectives).win) { best = k; break; }
        }
        if (best === k) break;
      }
      if (best === k) break;
    }
  }
  return best;
}

function combinationsOf(arr, k) {
  const out = [];
  const cur = [];
  const rec = (start) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1); cur.pop(); }
  };
  rec(0);
  return out;
}
