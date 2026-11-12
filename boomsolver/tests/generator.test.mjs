import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, buildCandidate, validateStructure, normalizeConstraints, toExportable, objectivesFor } from '../src/generator/generator.js';
import { verifySolution, solve } from '../src/solver/solver.js';
import { scoreDifficulty } from '../src/difficulty.js';
import { necessaryBombs, redundantBombs, counterfactual, explainImpossible, hint } from '../src/analysis.js';

test('misma semilla ⇒ mismo nivel exacto (reproducibilidad)', () => {
  const c = { width: 6, height: 4, seed: 12345, targets: { gem: 2 }, tray: { 1: 2, 2: 1 } };
  const a = buildCandidate(c);
  const b = buildCandidate(c);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.tray, b.tray);
});

test('semillas distintas ⇒ niveles distintos', () => {
  const a = buildCandidate({ width: 6, height: 4, seed: 1, targets: { gem: 2 } });
  const b = buildCandidate({ width: 6, height: 4, seed: 2, targets: { gem: 2 } });
  assert.notDeepEqual(a.cells, b.cells);
});

test('el generador sólo acepta niveles que el buscador demuestra solubles', () => {
  const r = generate({ width: 5, height: 4, seed: 7, targets: { gem: 1 }, tray: { 1: 2 }, maxAttempts: 8 });
  assert.equal(r.ok, true);
  assert.equal(r.optimalityProven, true, 'la solvencia está demostrada, no supuesta');
  const v = verifySolution(r.level, r.objectives, r.solution);
  assert.equal(v.ok, true, 'la solución se reproduce en el simulador oficial');
});

test('el nivel exportado es JSON versionado, importable y sin secretos', () => {
  const r = generate({ width: 5, height: 4, seed: 11, targets: { gem: 1 }, tray: { 1: 2 } });
  const json = JSON.stringify(toExportable(r.level, r.objectives, r.level.constraints));
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'boomsolver-level');
  assert.equal(parsed.version, 2);
  assert.ok(Array.isArray(parsed.objectives));
  assert.equal(/api[_-]?key|token|secret/i.test(json), false, 'no se filtran credenciales');
});

test('respeta el máximo de bombas pedido o explica el fallo', () => {
  const r = generate({ width: 5, height: 4, seed: 3, targets: { gem: 1 }, tray: { 1: 2 }, minBombs: 1, maxBombs: 1, maxAttempts: 6 });
  if (r.ok) assert.equal(r.metrics.physicalBombs, 1);
  else assert.ok(r.rejected.length > 0, 'informa de los motivos de rechazo');
});

test('las restricciones imposibles se informan con sugerencias', () => {
  const r = generate({
    width: 4, height: 3, seed: 5, targets: { gem: 9 }, tray: { 1: 1 },
    minBombs: 5, maxBombs: 5, maxAttempts: 4,
  });
  assert.equal(r.ok, false);
  assert.ok(r.rejected.length > 0);
  assert.ok(r.hint && r.hint.suggestions.length > 0);
});

test('un tablero sin objetivos se rechaza por estructura', () => {
  const bad = { cols: 3, rows: 2, cells: [['empty', 'empty', 'empty'], ['empty', 'empty', 'empty']], tray: [1] };
  const v = validateStructure(bad);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /objetivo/i);
});

test('normaliza restricciones fuera de rango en lugar de fallar', () => {
  const c = normalizeConstraints({ width: 500, height: -2, seed: 'x' });
  assert.ok(c.width <= 12 && c.width >= 3);
  assert.ok(c.height >= 2);
  assert.equal(Number.isFinite(c.seed), true);
});

test('la dificultad es explicable y separa algoritmo de jugador', () => {
  const r = generate({ width: 6, height: 4, seed: 21, targets: { chest_wood: 2 }, tray: { 1: 2, 2: 2 } });
  if (!r.ok) return;
  const d = scoreDifficulty(r.level, { solutions: [r.solution], status: 'optimalityProven' }, r.objectives);
  assert.ok(d.factors.length >= 8);
  assert.ok(d.explanation.length > 0);
  assert.equal(d.playerDifficulty.calibrado, false, 'declara que no está calibrada');
  assert.ok(['easy', 'medium', 'hard', 'expert'].includes(d.band));
  for (const f of d.factors) assert.equal(typeof f.contribution, 'number');
});

test('análisis de necesidad, redundancia y contrafactual', () => {
  const level = {
    cols: 5, rows: 3,
    cells: [
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      ['chest_wood', 'empty', 'empty', 'empty', 'gem'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
    ],
    tray: [3, 1, 1],
  };
  const objectives = [{ kind: 'destroy', types: ['chest_wood', 'gem'], count: 2 }];
  const res = solve(level, objectives, { mode: 'fewest_bombs', maxSolutions: 20 });
  assert.ok(res.solutions.length > 0);
  const nec = necessaryBombs(res);
  assert.ok(Array.isArray(nec.cells));
  const red = redundantBombs(level, objectives, res.solutions[0]);
  assert.ok(Array.isArray(red.removable));
  const cf = counterfactual(level, objectives, res.solutions[0], [
    { label: 'misma jugada', },
    { label: 'quitando la última bomba', remove: res.solutions[0].placements[res.solutions[0].placements.length - 1].idx },
  ]);
  assert.equal(cf.length, 2);
  assert.equal(typeof cf[0].win, 'boolean');
});

test('explica imposibilidad con causas concretas', () => {
  const level = {
    cols: 3, rows: 2,
    cells: [['#####'.slice(0, 3), 'wall', 'wall'], ['wall', 'gem', 'wall']],
    tray: [1],
  };
  const diag = explainImpossible(level, [{ kind: 'destroy', types: ['gem'], count: 1 }]);
  assert.equal(diag.impossible, true);
  assert.ok(diag.causes.length > 0);
  assert.match(diag.causes.join(' '), /no se pueden alcanzar|Ninguna bomba|Recursos/i);
});

test('la pista señala una casilla y no revela toda la solución', () => {
  const level = {
    cols: 5, rows: 3,
    cells: [
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'chest_wood', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
    ],
    tray: [2, 1],
  };
  const h = hint(level, [{ kind: 'destroy', types: ['chest_wood'], count: 1 }]);
  assert.ok(h.hint);
  assert.match(h.message, /C\dF\d/);
  assert.ok(h.minimumBombs >= 1);
});

test('objetivos derivados del tablero incluyen positivos y negativos', () => {
  const level = buildCandidate({ width: 6, height: 4, seed: 9, targets: { chest_wood: 1, gem: 1 }, hazards: { crystal: 1 } });
  const objs = objectivesFor(level, level.constraints);
  const kinds = objs.map((o) => o.kind);
  assert.ok(kinds.includes('destroy'));
  assert.ok(kinds.includes('noDestroy'), 'el cristal genera condición negativa');
});
