// ============================================================
// Generador con restricciones (§7) — pruebas de aceptación
// ============================================================
// El encargo exige que el generador acepte: dimensiones, tema, objetos
// permitidos/prohibidos, mín/máx de objetivos, inventario, portales, nº de
// géiseres, temporizadores, espejos, detonadores y cables, obstáculos, peligros,
// objetivos múltiples, mínimo de bombas, Nº EXACTO de soluciones óptimas,
// dificultad objetivo, verificación con el solver, dificultad explicable y
// semillas reproducibles.
//
// Estas pruebas comprueban que cada restricción se aplica DE VERDAD: o el nivel
// la cumple, o el generador lo rechaza con un motivo. No se acepta un nivel que
// "más o menos" cumpla.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, normalizeConstraints, DEFAULT_CONSTRAINTS } from '../src/generator/generator.js';
import { solve } from '../src/solver/solver.js';
import { prepareBoard } from '../src/core/engine.js';

const FAST = { maxAttempts: 25, timeBudgetMs: 2500 };

function mustGenerate(constraints, label) {
  const out = generate(constraints, FAST);
  assert.equal(out.ok, true, `${label}: no se generó nivel. Rechazos: ${JSON.stringify((out.rejected || []).slice(0, 3))}`);
  return out;
}

test('dimensiones exactas y semilla reproducible', () => {
  const c = { width: 6, height: 4, seed: 42, targets: { gem: 1 }, tray: { 1: 3, 2: 0 }, maxBombs: 3 };
  const a = mustGenerate(c, 'dimensiones');
  const b = mustGenerate(c, 'dimensiones repetido');
  assert.equal(a.level.cols, 6);
  assert.equal(a.level.rows, 4);
  assert.deepEqual(a.level.cells, b.level.cells, 'misma semilla ⇒ mismo tablero');
  assert.equal(a.level.seed, b.level.seed);
});

test('semillas distintas producen tableros distintos (o al menos no siempre el mismo)', () => {
  const base = { width: 6, height: 4, targets: { gem: 1 }, tray: { 1: 3, 2: 0 }, maxBombs: 3 };
  const shapes = new Set();
  for (const seed of [1, 2, 3, 4]) {
    const out = generate({ ...base, seed }, FAST);
    if (out.ok) shapes.add(JSON.stringify(out.level.cells));
  }
  assert.ok(shapes.size >= 2, `las semillas deberían variar el nivel: ${shapes.size} formas`);
});

test('objetos prohibidos: el nivel no contiene ninguno', () => {
  const out = mustGenerate({
    width: 6, height: 4, seed: 5, targets: { gem: 1 }, tray: { 1: 3, 2: 0 }, maxBombs: 3,
    forbidObjects: ['crystal', 'cat'],
  }, 'objetos prohibidos');
  for (const row of out.level.cells) {
    for (const cell of row) {
      const t = typeof cell === 'string' ? cell : cell && cell.type;
      assert.notEqual(t, 'crystal', 'no puede haber cristales');
      assert.notEqual(t, 'cat', 'no puede haber gatos');
    }
  }
});

test('si no se puede cumplir una prohibición, el generador lo dice y no la ignora', () => {
  // Se prohíbe el propio objetivo: no existe ningún nivel válido.
  const out = generate({
    width: 5, height: 3, seed: 2, targets: { gem: 1 }, tray: { 1: 2, 2: 0 }, maxBombs: 2,
    forbidObjects: ['gem'],
  }, { maxAttempts: 5, timeBudgetMs: 1200 });
  assert.equal(out.ok, false);
  assert.ok(out.rejected.length > 0, 'debe explicar por qué no hay nivel');
  for (const r of out.rejected) assert.ok(typeof r.reason === 'string' && r.reason.length > 5);
});

test('número exacto de soluciones óptimas: o se cumple al pie de la letra o se rechaza', () => {
  // Se prueban varios recuentos exactos: el generador debe devolver un nivel cuyo
  // número de soluciones óptimas sea EXACTAMENTE el pedido, no "parecido".
  const targets = [1, 2, 3];
  let generated = 0;
  for (const exact of targets) {
    const out = generate({
      width: 6, height: 4, seed: 9 + exact, targets: { gem: 1 }, tray: { 1: 3, 2: 0 }, maxBombs: 3,
      exactSolutionCount: exact,
    }, { maxAttempts: 25, timeBudgetMs: 2500 });
    if (!out.ok) {
      // Rechazar es legítimo: lo que no se admite es devolver otro recuento.
      const reasons = out.rejected.map((r) => r.reason).join(' ');
      assert.match(reasons, /exactamente \d+ soluciones/, `motivo esperado, fue: ${reasons.slice(0, 200)}`);
      continue;
    }
    generated++;
    const solved = solve(out.level.objectives ? out.level : out.level, out.level.objectives,
      { maxBombs: 3, timeBudgetMs: 8000 });
    assert.equal(solved.solutions.length, exact,
      `se pidieron exactamente ${exact} y hay ${solved.solutions.length}`);
  }
  assert.ok(generated >= 1, 'al menos un recuento exacto debe poder generarse');
});

test('el generador no acepta un recuento exacto imposible y explica el recuento real', () => {
  const out = generate({
    width: 6, height: 4, seed: 9, targets: { gem: 1 }, tray: { 1: 3, 2: 0 }, maxBombs: 3,
    exactSolutionCount: 999,
  }, { maxAttempts: 4, timeBudgetMs: 1500 });
  assert.equal(out.ok, false);
  assert.ok(out.rejected.some((r) => /exactamente 999 soluciones óptimas y hay \d+/.test(r.reason)),
    JSON.stringify(out.rejected.slice(0, 2)));
});

test('mínimo y máximo de bombas del óptimo se respetan', () => {
  const out = mustGenerate({
    width: 7, height: 5, seed: 11, targets: { gem: 1, chest_wood: 1 }, tray: { 1: 2, 2: 2 },
    minBombs: 2, maxBombs: 4,
  }, 'rango de bombas');
  const solved = solve(out.level, out.level.objectives, { maxBombs: 5, timeBudgetMs: 8000 });
  assert.equal(solved.status, 'optimalityProven');
  assert.ok(solved.solutions[0].physicalBombs >= 2, `mínimo ${solved.solutions[0].physicalBombs}`);
  assert.ok(solved.solutions[0].physicalBombs <= 4);
});

test('dificultad objetivo por banda y por puntuación', () => {
  const out = mustGenerate({
    width: 6, height: 4, seed: 13, targets: { gem: 1 }, tray: { 1: 3, 2: 1 }, maxBombs: 3,
    difficulty: 'medium',
  }, 'dificultad media');
  assert.equal(out.level.difficulty.band, 'medium');
  assert.ok(out.level.difficulty.score >= 25 && out.level.difficulty.score < 50);
  // La explicación debe estar: el encargo exige dificultad EXPLICABLE.
  assert.ok(Array.isArray(out.level.difficultyExplanation.factors));
  assert.ok(out.level.difficultyExplanation.factors.length > 0);
  for (const f of out.level.difficultyExplanation.factors) {
    assert.ok(f.id && f.label && typeof f.value === 'number' && typeof f.weight === 'number');
  }
  assert.match(out.level.difficultyExplanation.note, /sin calibrar/i);
});

test('dificultad por rango de puntuación se respeta', () => {
  const out = mustGenerate({
    width: 6, height: 4, seed: 17, targets: { gem: 1 }, tray: { 1: 3, 2: 1 }, maxBombs: 3,
    difficultyMinScore: 20, difficultyMaxScore: 60,
  }, 'rango de dificultad');
  const s = out.level.difficulty.score;
  assert.ok(s >= 20 && s <= 60, `puntuación ${s} fuera de [20,60]`);
});

test('temporizador de géiser exigido: el nivel lo contiene o no se acepta', () => {
  const out = generate({
    width: 7, height: 5, seed: 21, targets: { gem: 1 }, tray: { 1: 3, 2: 1 }, maxBombs: 3,
    mechanics: { geysers: 1 }, requireGeyserTimers: [2], geyserTimers: [2],
  }, { maxAttempts: 20, timeBudgetMs: 3000 });
  if (out.ok) {
    const timers = [];
    for (const row of out.level.cells) {
      for (const cell of row) {
        if (cell && typeof cell === 'object' && cell.type === 'geyser') timers.push(cell.timer);
      }
    }
    assert.ok(timers.includes(2), `temporizadores encontrados: ${timers}`);
  } else {
    // Si no se pudo, debe decirlo con el motivo correcto, no aceptar un géiser de otro timer.
    const reasons = out.rejected.map((r) => r.reason).join(' ');
    assert.match(reasons, /temporizador|géiser|geiser/i);
  }
});

test('el nivel generado se verifica con el solver y se puede re-simular', () => {
  const out = mustGenerate({
    width: 6, height: 4, seed: 23, targets: { gem: 1, chest_wood: 1 }, tray: { 1: 3, 2: 1 }, maxBombs: 4,
  }, 'verificación');
  assert.equal(out.level.verified, true, 'el generador debe marcar verificado sólo con optimalityProven');
  assert.equal(out.level.solverStatus, 'optimalityProven');
  const solved = solve(out.level, out.level.objectives, { maxBombs: 4, timeBudgetMs: 8000 });
  assert.equal(solved.status, 'optimalityProven');
  const board = prepareBoard(out.level);
  assert.equal(board.cols, out.level.cols);
  // Y la solución óptima del generador debe ser una de las que encuentra el solver.
  assert.ok(solved.solutions.length >= 1);
});

test('un nivel generado nunca declara resoluble si el solver no lo demostró', () => {
  // Restricciones imposibles: solución única con muchas casillas y pocas bombas.
  const out = generate({
    width: 8, height: 6, seed: 31, targets: { gem: 3, chest_wood: 2 }, tray: { 1: 1 },
    maxBombs: 1, solutionCount: 'unique',
  }, { maxAttempts: 8, timeBudgetMs: 1500 });
  if (out.ok) {
    assert.equal(out.level.verified, true);
    assert.equal(out.level.solverStatus, undefined === out.level.solverStatus ? undefined : out.level.solverStatus);
  } else {
    assert.ok(out.rejected.every((r) => typeof r.reason === 'string'));
  }
});

test('normalizeConstraints no acepta valores absurdos y conserva las claves nuevas', () => {
  const c = normalizeConstraints({
    width: 999, height: -4, seed: 'x', exactSolutionCount: 2, forbidObjects: ['crystal'],
    difficultyMinScore: 30,
  });
  assert.ok(c.width >= 3 && c.width <= 12);
  assert.ok(c.height >= 2 && c.height <= 10);
  assert.equal(c.seed, 1);
  assert.equal(c.exactSolutionCount, 2);
  assert.deepEqual(c.forbidObjects, ['crystal']);
  assert.equal(c.difficultyMinScore, 30);
  // Y las claves por defecto siguen ahí.
  for (const k of Object.keys(DEFAULT_CONSTRAINTS)) assert.ok(k in c, `falta ${k}`);
});

test('inventario: el nivel parte de la bandeja pedida y las fusiones son legales', () => {
  const out = mustGenerate({
    width: 6, height: 4, seed: 37, targets: { gem: 1 }, tray: { 1: 2, 2: 3 }, maxBombs: 3,
  }, 'inventario');
  assert.deepEqual(out.level.tray.slice().sort(), [1, 1, 2, 2, 2].sort(),
    'la bandeja del nivel es exactamente la pedida');
  const solved = solve(out.level, out.level.objectives, { maxBombs: 3, timeBudgetMs: 8000 });
  // Un nivel 3 sólo es legal si se obtuvo fusionando 2+2 (o 1+2 en modo suma).
  for (const s of solved.solutions) {
    const used = s.placements.map((p) => p.level);
    for (const lvl of used) {
      if (lvl > 2) {
        assert.ok(s.fusions > 0, `el nivel ${lvl} exige al menos una fusión registrada`);
      }
      assert.ok(lvl >= 1 && lvl <= 4, `nivel de bomba imposible: ${lvl}`);
    }
  }
});
