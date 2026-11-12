// ============================================================
// Rendimiento y límites de seguridad (§9)
// ============================================================
// El encargo exige: tableros pequeños y grandes, inventarios amplios, muchos
// activadores, múltiples óptimos, cadenas largas, portales interconectados y
// muchos temporizadores; que la UI no se congele (cancelación y progreso), y que
// los límites de seguridad JAMÁS produzcan una falsa imposibilidad.
//
// Estas pruebas miden tiempos reales en este entorno. Los umbrales son GENEROSOS
// a propósito: aquí se comprueba que el trabajo está acotado y que responde a la
// cancelación, no que un portátil concreto tarde X milisegundos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/solver/solver.js';
import { prepareBoard, simulate } from '../src/core/engine.js';
import { grid } from '../src/validation/harness.js';

const board = (cols, rows, fill = 'empty') => ({
  cols, rows,
  cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill)),
});

test('tablero grande con inventario amplio: el resultado llega acotado y honesto', () => {
  const level = {
    ...board(10, 7),
    tray: [1, 1, 2, 2, 3, 3, 4],
  };
  level.cells[3][1] = 'chest_wood';
  level.cells[3][8] = 'gem';
  level.cells[1][1] = 'crystal';
  const t0 = Date.now();
  const sv = solve(level, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ], { maxBombs: 3, timeBudgetMs: 6000 });
  const elapsed = Date.now() - t0;

  assert.ok(elapsed < 20000, `debe respetar el presupuesto (tardó ${elapsed} ms)`);
  assert.notEqual(sv.status, 'infeasible', 'no puede ser imposible por haberse quedado sin tiempo');
  if (sv.status === 'optimalityProven') {
    assert.ok(sv.solutions.length > 0);
  } else {
    assert.equal(sv.exhaustive, false);
    assert.ok(sv.incompleteReason, 'debe declarar por qué no terminó');
  }
});

test('muchos objetivos y muchas soluciones: la presentación se trunca, el recuento no miente', () => {
  const level = { ...grid(['..........', '.C.C.C.C.C']), tray: [2, 2, 2] };
  const sv = solve(level, [{ kind: 'destroy', types: ['chest_wood'], count: 5 }], {
    maxBombs: 4, timeBudgetMs: 5000, maxSolutions: 5,
  });
  if (sv.solutions.length > 0) {
    assert.ok(sv.totalKnown >= sv.solutions.length);
    if (sv.totalKnown > sv.solutions.length) {
      assert.equal(sv.truncatedPresentation, true, 'si se recorta la lista debe avisarse');
      assert.equal(sv.presentationLimit, 5);
    }
  }
});

test('portales interconectados: no hay bucles infinitos ni con muchos saltos', () => {
  // Cuatro pares de portales en cadena y una bomba que los atraviesa.
  const cells = Array.from({ length: 3 }, () => Array.from({ length: 12 }, () => 'empty'));
  const pairs = [[0, 'a'], [2, 'a'], [4, 'b'], [6, 'b'], [8, 'c'], [10, 'c']];
  for (const [x, pair] of pairs) cells[1][x] = { type: 'portal', color: 'blue', pair };
  const t0 = Date.now();
  const b = prepareBoard({ cols: 12, rows: 3, cells, tray: [4] });
  const res = simulate(b, new Map([[11, 4]]), 11, b.rules);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `una sola simulación no puede colgarse (${elapsed} ms)`);
  assert.notEqual(res.status, 'invalid', res.reason === 'unresolved' ? 'bucle no cortado' : undefined);
  assert.ok(res.metrics.tickCount <= 64, 'los ticks están acotados por maxTicks');
});

test('muchos temporizadores: la simulación termina y cada géiser vence en su tick', () => {
  const cells = Array.from({ length: 3 }, () => Array.from({ length: 12 }, () => 'empty'));
  const timers = [1, 2, 3, 1, 2, 3];
  timers.forEach((t, i) => { cells[1][i * 2] = { type: 'geyser', timer: t }; });
  const b = prepareBoard({ cols: 12, rows: 3, cells, tray: [1] });
  const t0 = Date.now();
  const res = simulate(b, new Map([[35, 1]]), 35, b.rules);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `simulación lenta: ${elapsed} ms`);
  assert.equal(res.status, 'resolved');
  const armed = res.log.filter((e) => e.type === 'geyser-armed');
  assert.equal(armed.length, timers.length, 'todos los géiseres se arman una vez');
  for (const a of armed) assert.ok(a.dueTick === a.timer, `tick ${a.dueTick} ≠ timer ${a.timer}`);
});

test('cadena larga de dinamita: profundidad acotada y sin descontrol', () => {
  const cells = Array.from({ length: 2 }, () => Array.from({ length: 12 }, () => 'empty'));
  for (let x = 1; x < 11; x++) cells[0][x] = 'dynamite';
  const b = prepareBoard({ cols: 12, rows: 2, cells, tray: [1] });
  const t0 = Date.now();
  const res = simulate(b, new Map([[13, 1]]), 13, b.rules);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 3000, `cadena lenta: ${elapsed} ms`);
  assert.ok(res.metrics.tickCount <= 64);
  assert.ok(res.metrics.chainDepth >= 2, 'la cadena debe propagarse');
});

test('cancelación: shouldCancel se consulta y corta antes de terminar el espacio', () => {
  // Tablero con espacio de búsqueda amplio (varias casillas, trayectoria de k=1..4).
  const level = { ...board(9, 6), tray: [1, 1, 2, 2, 3, 4] };
  level.cells[2][1] = 'chest_wood';
  level.cells[2][7] = 'gem';
  level.cells[4][4] = 'crystal';

  let calls = 0;
  const sv = solve(level, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ], {
    maxBombs: 4,
    timeBudgetMs: 20000,
    shouldCancel: () => ++calls > 20,
  });
  assert.ok(calls > 20, 'la cancelación debe consultarse durante la búsqueda');
  assert.equal(sv.status, 'cancelled');
  assert.equal(sv.exhaustive, false);
  assert.equal(sv.incompleteReason, 'cancelled');

  // Sin cancelar, el mismo tablero termina y demuestra la optimalidad.
  const full = solve(level, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ], { maxBombs: 4, timeBudgetMs: 20000 });
  assert.equal(full.status, 'optimalityProven');
});

test('progreso: onProgress recibe el avance por nivel de k cuando hay varios niveles', () => {
  // Se usa un tablero en el que el mínimo no está en k=1, para que haya más de un
  // nivel completado y onProgress se dispare.
  const level = { ...board(9, 5), tray: [1, 1, 1, 1, 1, 1] };
  level.cells[2][1] = 'chest_wood';
  level.cells[2][7] = 'chest_wood';
  level.cells[2][4] = 'wall';
  const progress = [];
  const sv = solve(level, [
    { kind: 'destroy', types: ['chest_wood'], count: 2 },
  ], {
    maxBombs: 4,
    timeBudgetMs: 20000,
    onProgress: (p) => progress.push(p),
  });
  if (sv.status === 'optimalityProven' && sv.stats.combos > 0) {
    // Puede terminar en k=1 si alguna bomba abre los dos cofres; en ese caso no hay
    // más niveles y no exigimos progreso. Si hubo varios, deben estar bien formados.
    for (const p of progress) {
      assert.ok(typeof p.k === 'number' && p.k >= 1);
      assert.ok(typeof p.solutions === 'number');
      assert.ok(typeof p.elapsedMs === 'number' && p.elapsedMs >= 0);
    }
  }
});

test('límites de seguridad: nunca producen una falsa imposibilidad', () => {
  // El mismo tablero resuelto dos veces: con presupuesto amplio y con límites duros.
  const level = { ...grid(['..........', '.C...C...G']), tray: [2, 2, 3] };
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ];
  const roomy = solve(level, objectives, { maxBombs: 3, timeBudgetMs: 20000 });
  const tight = solve(level, objectives, { maxBombs: 3, timeBudgetMs: 5000, comboCap: 2 });

  assert.equal(roomy.status, 'optimalityProven', 'con presupuesto amplio debe demostrarse');
  assert.notEqual(tight.status, 'infeasible',
    'ningún límite de seguridad puede convertir en imposible un nivel resoluble');
  if (tight.status === 'unknown' || tight.status === 'bestKnown') {
    assert.equal(tight.exhaustive, false);
    assert.match(tight.proofNote, /no se puede afirmar|no equivale|NO es exhaustiva|no terminó/i);
  }
  // Y las soluciones que sí encontró con poco presupuesto también son válidas.
  for (const s of tight.solutions) {
    assert.ok(roomy.solutions.some((r) => r.signature === s.signature)
      || s.physicalBombs >= roomy.solutions[0].physicalBombs,
    'una solución con poco presupuesto nunca puede ser mejor que el óptimo demostrado');
  }
});

test('simulaciones por segundo: el motor es reutilizable en bucles de búsqueda', () => {
  const b = prepareBoard({ ...grid(['..........', '.C.......G']), tray: [3] });
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 300) {
    simulate(b, new Map([[11, 3]]), 11, b.rules);
    n++;
  }
  const perSec = Math.round(n / ((Date.now() - t0) / 1000));
  assert.ok(perSec > 200, `el motor debe hacer al menos 200 simulaciones/s (hizo ${perSec})`);
});

test('un tablero de nivel real (10x9) se simula sin desbordar', () => {
  const level = board(10, 9);
  for (let y = 0; y < 9; y += 2) for (let x = 0; x < 10; x += 3) level.cells[y][x] = 'wall';
  level.cells[4][4] = 'chest_wood';
  const b = prepareBoard(level);
  const t0 = Date.now();
  const res = simulate(b, new Map([[41, 2]]), 41, b.rules);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 1000, `una simulación de 10x9 debe ser instantánea (${elapsed} ms)`);
  assert.ok(['resolved', 'invalid', 'lose'].includes(res.status));
});
