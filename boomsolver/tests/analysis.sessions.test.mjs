// ============================================================
// Análisis de jugadas para el workbench (§8)
// ============================================================
// Se prueba el módulo PURO que alimenta la UI: ondas individuales, recorrido por
// portal, temporizadores de géiser, cadenas, daño y comparación de soluciones.
// Si esto pasa, la UI no puede mostrar datos que el motor no haya producido.

import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBoard, simulate } from '../src/core/engine.js';
import { solve } from '../src/solver/solver.js';
import { grid, at } from '../src/validation/harness.js';
import {
  waveBreakdown, portalTrail, geyserTimers, damageLedger, chainGraph,
  compareSolutions, optimalityBanner, explainPlay,
} from '../src/analysis/sessions.js';

const run = (lines, placements, opts = {}) => {
  const board = prepareBoard({ ...grid(lines), ...(opts.level || {}) });
  const res = simulate(board, new Map(placements), opts.mecha ?? placements[0][0], board.rules);
  return { board, res };
};

test('ondas individuales: cada rayo de cada explosión, con sus casillas y saltos', () => {
  const { res } = run(['..........', 'B..B......', '..........'], [[at(2, 1, 10), 2]]);
  const waves = waveBreakdown(res);
  assert.equal(waves.length, 1, 'una explosión');
  const w = waves[0];
  assert.equal(w.kind, 'bomb');
  // La explosión de una bomba se registra con su casilla central + 4 rayos en cruz.
  assert.equal(w.rays.length, 5, `rayos registrados: ${w.rays.map((r) => r.dir).join(',')}`);
  assert.equal(w.rays[0].dir, 'center', 'el primero es la casilla de origen');
  for (const r of w.rays.slice(1)) {
    assert.ok(Array.isArray(r.cells));
    assert.ok(['up', 'down', 'left', 'right'].includes(r.dir));
  }
  const withJump = w.rays.find((r) => r.jumps.length > 0);
  assert.ok(withJump, 'algún rayo debe atravesar un portal');
  assert.ok(withJump.jumps[0].from && withJump.jumps[0].to);
});

test('recorrido por portal: orden, dirección y alcance transportado', () => {
  const { res } = run(['..........', 'B..B......', '..........'], [[at(2, 1, 10), 2]]);
  const trail = portalTrail(res);
  assert.equal(trail.total, trail.jumps.length);
  for (const j of trail.jumps) {
    assert.ok(j.order >= 1);
    assert.ok(j.tick >= 1);
    assert.ok(j.entry === j.from && j.exit === j.to);
    assert.ok(['left', 'right', 'up', 'down'].includes(j.dir));
    assert.ok(j.rangeTransported >= 1);
  }
});

test('temporizadores de géiser: armado, vencimiento y explosión, con unidad declarada', () => {
  const { res } = run(['.........', '....Z....', '.........'], [[at(0, 0, 9), 1]]);
  const timers = geyserTimers(res);
  assert.equal(timers.length, 1);
  const t = timers[0];
  assert.equal(t.cell, '4,1');
  assert.equal(t.timer, 3);
  assert.equal(t.armedTick, 0);
  assert.equal(t.armedDueTick, 3);
  assert.equal(t.dueTick, 3);
  assert.equal(t.explodedTick, 3);
  assert.equal(t.unit, 'tick de simulación');
  assert.ok(t.cells.includes('4,1'), 'la onda del géiser incluye su propia casilla');
});

test('temporizadores de géiser: registra el adelanto cuando la onda lo provoca', () => {
  const { res } = run(['.........', '....Z....', '.........'],
    [[at(4, 0, 9), 1]], { level: { tray: [1], rules: { geyserHitBehavior: 'detonate' } } });
  const t = geyserTimers(res)[0];
  assert.equal(t.advancedFrom, 3, 'estaba programado para el tick 3');
  assert.equal(t.armedDueTick, 3, 'el vencimiento original no se reescribe');
  assert.equal(t.dueTick, 2, 'y la onda lo adelantó al 2');
  assert.equal(t.explodedTick, 2);
});

test('cadenas: se registra quién enciende a quién y en qué tick', () => {
  const { res } = run(['.....', '.....', '.....'], [[at(1, 1, 5), 1], [at(1, 2, 5), 1]]);
  const chain = chainGraph(res);
  assert.ok(chain.count >= 1);
  const ignite = chain.edges.find((e) => e.kind === 'bomb');
  assert.ok(ignite, 'debe haber una ignición en cadena');
  assert.equal(ignite.from, '1,1');
  assert.equal(ignite.to, '1,2');
  assert.equal(ignite.tick, 1);
  assert.equal(chain.depth, 2, 'la cadena termina en el tick 2');
});

test('cadena por detonador: los cables aparecen como aristas propias', () => {
  // Bomba N1 en C4F2, pegada al detonador de C3F2, enlazado a la carga de C9F2.
  const { res } = run(['..........', '..E.....C.'], [[at(3, 1, 10), 1]],
    { level: { links: { '2,1': ['8,1'] }, tray: [1] } });
  const chain = chainGraph(res);
  const cable = chain.edges.find((e) => e.kind === 'cable');
  assert.ok(cable, `debe haber una arista de cable: ${JSON.stringify(chain.edges)}`);
  assert.equal(cable.from, '2,1');
  assert.equal(cable.to, '8,1');
});

test('daño recibido: resumen por objeto y recuento de peligros', () => {
  // Bomba legal en C1F2 y cristal (peligro) en C2F2, dentro de su alcance.
  const { board, res } = run(['......', '.KC...'], [[at(0, 1, 6), 1]]);
  const ledger = damageLedger(res, board);
  assert.ok(ledger.rows.length >= 1);
  assert.ok(ledger.summary.some((s) => s.object === 'crystal'));
  assert.ok(ledger.hazardsReached >= 1, 'el cristal es peligro y debe contarse');
  for (const r of ledger.rows) {
    assert.ok(r.cell && r.tick >= 1);
  }
});

test('comparar soluciones: detecta qué cambia y explica por qué importa', () => {
  const a = {
    physicalBombs: 1, powder: 8, ticks: 1, chainDepth: 1, portalJumps: 0, fusions: 0,
    destroyed: 2, mecha: { idx: 14, cell: 'C5F2' },
    placements: [{ idx: 14, level: 4 }],
    checks: [{ label: 'Destruir Cofre', ok: true, done: 2, total: 2 }],
  };
  const b = {
    ...a,
    physicalBombs: 2, powder: 2,
    mecha: { idx: 2, cell: 'C3F1' },
    placements: [{ idx: 2, level: 1 }, { idx: 20, level: 1 }],
  };
  const d = compareSolutions(a, b);
  assert.equal(d.identical, false);
  assert.deepEqual(d.onlyA, [14]);
  assert.deepEqual(d.onlyB, [2, 20]);
  assert.ok(d.diffs.some((x) => x.label === 'bombas físicas' && x.a === 1 && x.b === 2));
  assert.ok(d.diffs.some((x) => x.label === 'pólvora'));
  assert.ok(d.verdicts.join(' ').includes('bomba'));
});

test('comparar soluciones idénticas lo dice en vez de inventar diferencias', () => {
  const a = {
    physicalBombs: 1, powder: 2, ticks: 1, chainDepth: 1, portalJumps: 0, fusions: 0,
    destroyed: 1, mecha: { idx: 3, cell: 'C4F1' },
    placements: [{ idx: 3, level: 2 }], checks: [{ label: 'x', ok: true, done: 1, total: 1 }],
  };
  const d = compareSolutions(a, { ...a });
  assert.equal(d.identical, true);
  assert.equal(d.diffs.length, 0);
  assert.equal(d.onlyA.length, 0);
});

test('banner de optimalidad: cada estado dice la verdad y con el tono correcto', () => {
  const shown = (r) => optimalityBanner(r);

  const proven = shown({ status: 'optimalityProven', solutions: [1], totalKnown: 1 });
  assert.equal(proven.tone, 'ok');
  assert.match(proven.label, /DEMOSTRADO/);

  for (const status of ['bestKnown', 'timedOut', 'cancelled', 'unknown']) {
    const b = shown({ status, solutions: [] });
    assert.equal(b.tone, 'warn', status);
    assert.doesNotMatch(b.label, /Óptimo DEMOSTRADO/);
  }
  const timedOut = shown({ status: 'timedOut', solutions: [] });
  assert.match(timedOut.detail, /NO significa|no significa/i);

  const impossible = shown({ status: 'infeasible', solutions: [] });
  assert.equal(impossible.tone, 'err');
  assert.match(impossible.label, /IMPOSIBLE DEMOSTRADO/);

  const invalid = shown({ status: 'invalid-level', solutions: [] });
  assert.equal(invalid.tone, 'err');
});

test('banner: avisa cuando la lista de soluciones está recortada', () => {
  const b = optimalityBanner({
    status: 'optimalityProven', solutions: [1, 2], totalKnown: 40, truncatedPresentation: true,
  });
  assert.equal(b.truncated, true);
  assert.equal(b.totalKnown, 40);
  assert.equal(b.shown, 2);
});

test('explicación: menciona coste, bombas, objetivos y cadena cuando la hay', () => {
  const level = { ...grid(['..........', '.C.....DC.']), tray: [3] };
  const sv = solve(level, [{ kind: 'destroy', types: ['chest_wood'], count: 2 }], { maxBombs: 3, timeBudgetMs: 8000 });
  assert.ok(sv.solutions.length > 0, `debe haber solución: ${sv.status}`);
  const { lines, chain } = explainPlay(sv.solutions[0]);
  const text = lines.join('\n');
  assert.match(text, /bomba\(s\) física/);
  assert.match(text, /pólvora/);
  assert.ok(chain.count >= 1, 'la jugada usa una cadena y debe aparecer');
  assert.match(text, /tick/);
});

test('cadena de punta a punta: solver → motor → análisis, sin campos inventados', () => {
  // Esta es la tubería real del workbench: el solver produce soluciones, el
  // usuario carga una, el motor la simula y los paneles leen ESA simulación.
  // Se comprueba aquí porque el fallo clásico es pasar el resultado del solver
  // (que no tiene `ticks`) a las funciones de análisis: entonces la UI pinta
  // «0 ondas» sin error visible.
  const level = {
    ...grid([
      '........',
      '.C..G...',
      '........',
      '........',
      '........',
    ]),
    tray: [1, 2],
    objectives: [{ kind: 'destroy', cells: ['1,1'] }, { kind: 'destroy', cells: ['4,1'] }],
  };
  const board = prepareBoard(level);
  const solved = solve(level, level.objectives, { mode: 'fewest_bombs', maxSolutions: 5 });
  assert.equal(solved.status, 'optimalityProven');
  assert.ok(solved.solutions.length >= 1);
  // La salida del solver no es una simulación: en la solución `ticks` es un
  // NÚMERO (cuántos ticks dura) y no hay `log`. Pasarla a los paneles de
  // análisis devolvía listas vacías sin avisar, así que ahora se rechaza.
  assert.equal(typeof solved.solutions[0].ticks, 'number');
  assert.throws(() => waveBreakdown(solved), /salida del SOLVER/);
  assert.throws(() => damageLedger(solved, board), /salida del SOLVER/);
  // Una solución SÍ trae su registro de eventos, así que la cadena y el
  // recorrido de portales se pueden leer de ella: es lo que usa «Explicar».
  assert.doesNotThrow(() => chainGraph(solved.solutions[0]));
  assert.doesNotThrow(() => portalTrail(solved.solutions[0]));

  const sol = solved.solutions[0];
  const sim = simulate(board, new Map(sol.placements.map((p) => [p.idx, p.level])), sol.mecha.idx, board.rules);
  assert.equal(sim.status, 'resolved');
  assert.ok(Array.isArray(sim.ticks) && sim.ticks.length >= 1);

  const waves = waveBreakdown(sim);
  assert.ok(waves.length >= 1, 'la jugada óptima debe producir al menos una explosión');
  assert.equal(waves[0].rays.length, 5, 'una explosión en cruz son 5 rayos (centro + 4 direcciones)');
  assert.ok(waves[0].unionFromRays.includes(at(1, 1, 8)) || waves[0].cells.includes(at(1, 1, 8)),
    'la onda alcanza el cofre objetivo');

  const ledger = damageLedger(sim, board);
  assert.ok(ledger.summary.length >= 1, 'algún objeto recibió daño');
  assert.equal(ledger.hazardsReached, 0, 'esta jugada no toca peligros');

  const chain = chainGraph(sim);
  assert.equal(chain.count, 0, 'una sola bomba sin detonadores no produce cadena');

  const banner = optimalityBanner(solved);
  assert.equal(banner.tone, 'ok');
  const plano = explainPlay(sol);
  assert.ok(plano.lines.length >= 2);
  assert.match(plano.lines[0], /bomba/i);
});

test('el workbench no muestra datos que el motor no produjo', () => {
  // Con una simulación inválida no debe haber ondas, saltos ni géiseres inventados.
  const { res } = run(['..........', '..E.....C.'], [[at(4, 1, 10), 1]],
    { level: { links: { '2,1': ['8,1'] }, tray: [1] } });
  if (res.status === 'invalid') {
    assert.deepEqual(waveBreakdown(res), []);
    assert.equal(portalTrail(res).total, 0);
    assert.deepEqual(geyserTimers(res).filter((g) => g.explodedTick !== null), []);
  }
});
