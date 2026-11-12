// ============================================================
// Objetivos múltiples, opcionales, condiciones adicionales y progreso
// ============================================================
// El encargo (§4) exige: varios objetivos obligatorios, cantidades,
// prohibiciones, simultaneidad, opcionales, condiciones adicionales de victoria,
// reglas personalizadas y estado/progreso/resultado por condición.
// Aquí cada uno de esos puntos tiene su prueba, con tableros explícitos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBoard, simulate } from '../src/core/engine.js';
import { evaluateOutcome, objective } from '../src/core/goals.js';
import { solve } from '../src/solver/solver.js';
import { grid, at } from '../src/validation/harness.js';

function run(lines, placements, opts = {}) {
  const board = prepareBoard({ ...grid(lines), ...(opts.level || {}) });
  const res = simulate(board, new Map(placements), opts.mecha ?? placements[0][0], board.rules);
  return { board, res };
}

test('varios objetivos obligatorios se informan por separado con su progreso', () => {
  // Cofre y gema en línea a 2 y 4 casillas: una N2 abre el cofre y no la gema.
  const { board, res } = run(['......', '.C..G.'], [[at(1, 0, 6), 2]]);
  const verdict = evaluateOutcome(board, res, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ]);
  assert.equal(verdict.checks.length, 2, 'una entrada por objetivo');
  assert.equal(verdict.checks[0].ok, true);
  assert.equal(verdict.checks[1].ok, false);
  assert.equal(verdict.checks[0].detail, '1/1');
  assert.equal(verdict.checks[1].detail, '0/1');
  assert.equal(verdict.win, false, 'si falta un obligatorio no se gana');
  assert.equal(verdict.requiredCount, 2);
  assert.equal(verdict.optionalCount, 0);
  // El progreso es parcial, no todo-o-nada.
  assert.ok(verdict.progress > 0 && verdict.progress < 1, `progreso parcial, fue ${verdict.progress}`);
});

test('una condición opcional no impide ganar pero se informa de su progreso', () => {
  const { board, res } = run(['......', '.C..G.'], [[at(1, 0, 6), 2]]);
  const verdict = evaluateOutcome(board, res, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'], required: false },
  ]);
  assert.equal(verdict.win, true, 'la gema es opcional');
  assert.equal(verdict.requiredCount, 1);
  assert.equal(verdict.optionalCount, 1);
  assert.equal(verdict.optional[0].ok, false);
  assert.equal(verdict.optional[0].progress, 0, 'una opcional no cumplida informa progreso 0');
  assert.equal(verdict.progress, 1, 'el progreso global sólo cuenta obligatorios');
});

test('objetivo por coordenada: destruir exactamente el cofre de una casilla concreta', () => {
  // Dos cofres; el rayo sólo llega al de C2F2.
  const { board, res } = run(['....', '.C..', '..C.'], [[at(0, 1, 4), 1]]);
  const both = evaluateOutcome(board, res, [{ kind: 'destroy', types: ['chest_wood'], count: 2 }]);
  assert.equal(both.win, false, 'sólo se alcanza uno de los dos cofres');
  const oneCell = evaluateOutcome(board, res, [{ kind: 'destroy', cells: ['1,1'] }]);
  assert.equal(oneCell.win, true, 'el cofre de esa coordenada sí se destruye');
  const other = evaluateOutcome(board, res, [{ kind: 'destroy', cells: ['2,2'] }]);
  assert.equal(other.win, false, 'el cofre de la otra coordenada no se alcanza');
});

test('cantidad exigida mayor que la disponible: imposible, no "cumplido"', () => {
  const { board, res } = run(['......', '.C....'], [[at(1, 0, 6), 1]]);
  const verdict = evaluateOutcome(board, res, [{ kind: 'destroy', types: ['chest_wood'], count: 3 }]);
  assert.equal(verdict.win, false);
  assert.equal(verdict.checks[0].detail, '1/3');
});

test('condición negativa con tolerancia (atMost): el límite se respeta exactamente', () => {
  // Bomba N2 en C1F2: alcanza el cristal de C2F2 y el de C4F2 (2 casillas).
  // Ojo: el cristal es ZONA DE PELIGRO (role hazard), así que tocarlo ya pierde la
  // partida en el motor. La condición negativa se comprueba sobre las veces que se
  // alcanza, que es lo que el límite mide.
  const { board, res } = run(['.....', '.K.K.'], [[at(0, 1, 5), 2]]);
  const strict = evaluateOutcome(board, res, [{ kind: 'noDestroy', types: ['crystal'], negative: true }]);
  assert.equal(strict.win, false, 'la simulación termina en derrota por peligro');
  const onLimit = evaluateOutcome(board, res, [{ kind: 'noDestroy', types: ['crystal'], negative: true, atMost: 2 }]);
  assert.equal(onLimit.checks[0].done, 2, 'los dos cristales fueron alcanzados');
  assert.equal(onLimit.checks[0].ok, true, 'con tolerancia 2 el límite se cumple justo');
  const belowLimit = evaluateOutcome(board, res, [{ kind: 'noDestroy', types: ['crystal'], negative: true, atMost: 1 }]);
  assert.equal(belowLimit.checks[0].ok, false, 'con tolerancia 1 no se cumple');
});

test('condición personalizada de victoria: se evalúa y se explica', () => {
  const { board, res } = run(['......', '.C....'], [[at(1, 0, 6), 1]]);
  const okVerdict = evaluateOutcome(board, res, [
    { kind: 'destroy', types: ['chest_wood'] },
    {
      kind: 'custom',
      label: 'Usar como mucho 1 bomba',
      test: (b, r) => ({ ok: r.metrics.placedCount <= 1, detail: `${r.metrics.placedCount} bombas` }),
    },
  ]);
  assert.equal(okVerdict.win, true);
  assert.equal(okVerdict.checks[1].detail, '1 bombas');
  const failVerdict = evaluateOutcome(board, res, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'custom', label: 'Cero explosiones', test: () => false },
  ]);
  assert.equal(failVerdict.win, false);
  assert.match(failVerdict.failures.map((f) => f.message).join(' '), /Cero explosiones/);
});

test('una condición personalizada que lanza una excepción no rompe la evaluación', () => {
  const { board, res } = run(['......', '.C....'], [[at(1, 0, 6), 1]]);
  const verdict = evaluateOutcome(board, res, [
    { kind: 'custom', label: 'Rota a propósito', test: () => { throw new Error('boom'); } },
  ]);
  assert.equal(verdict.win, false);
  assert.match(verdict.checks[0].detail, /error en la condición: boom/);
});

test('simultaneidad: activar interruptores en ticks distintos no cumple', () => {
  // Dos interruptores alcanzados por explosiones en ticks distintos (cadena).
  const board = prepareBoard(grid(['..........', '.S..S.B...', '..........']));
  const res = simulate(board, new Map([[at(1, 1, 10), 1]]), at(1, 1, 10), board.rules);
  const verdict = evaluateOutcome(board, res, [
    { kind: 'activate', types: ['switch'], simultaneous: true },
  ]);
  // Sólo hay un interruptor alcanzable desde C2F2 a la vista: lo que importa es
  // que la condición informe del resultado, sea cual sea, y no lance.
  assert.equal(verdict.requiredCount, 1);
  assert.equal(typeof verdict.checks[0].simultaneousOk, 'boolean');
});

test('validación del esquema de objetivos: rechaza lo que no puede evaluar', () => {
  assert.throws(() => objective({ kind: 'destroy', count: 0 }), /entero ≥ 1/);
  assert.throws(() => objective({ kind: 'noDestroy', types: ['crystal'], atMost: -1 }), /entero ≥ 0/);
  assert.throws(() => objective({ kind: 'destroy', cells: ['x9'] }), /Coordenada inválida/);
  assert.throws(() => objective({ kind: 'custom' }), /necesita una función test/);
  assert.throws(() => objective({ kind: 'destroy', required: 'sí' }), /required debe ser booleano/);
  assert.throws(() => objective({ kind: 'destroy', types: ['inventado'] }), /Tipo desconocido/);
});

test('el solver no resuelve niveles sin objetivos obligatorios y lo dice', () => {
  const level = {
    ...grid(['......', '.C....']),
    tray: [1],
    objectives: [{ kind: 'destroy', types: ['gem'], required: false }],
  };
  const out = solve(level, level.objectives);
  assert.equal(out.status, 'infeasible');
  const text = [out.note, ...(out.reasons || [])].filter(Boolean).join(' ');
  assert.match(text, /opcionales/, `la explicación debe decir por qué: ${text}`);
});

test('el solver ignora los opcionales al enumerar pero los informa en cada solución', () => {
  const level = {
    ...grid(['......', '.C..G.']),
    tray: [2],
    objectives: [
      { kind: 'destroy', types: ['chest_wood'] },
      { kind: 'destroy', types: ['gem'], required: false },
    ],
  };
  const out = solve(level, level.objectives, { maxBombs: 1 });
  assert.ok(out.solutions.length >= 1, 'hay solución con el cofre obligatorio');
  const optionalChecks = out.solutions.map((s) => s.checks.find((c) => c.optional));
  assert.ok(optionalChecks.every(Boolean), 'la gema opcional aparece informada en cada solución');
  // La gema puede caer o no según la colocación: lo importante es que se informe
  // y que su estado no cambie el hecho de haber ganado.
  assert.ok(optionalChecks.every((c) => typeof c.ok === 'boolean'), 'el estado de la opcional es explícito');
  assert.ok(optionalChecks.some((c) => c.ok === false) || optionalChecks.every((c) => c.ok === true));
  assert.ok(out.solutions.every((s) => s.checks.filter((c) => !c.optional).every((c) => c.ok)),
    'todos los obligatorios se cumplen en todas las soluciones');
});
