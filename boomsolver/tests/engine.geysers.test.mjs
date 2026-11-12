import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBoard, simulate } from '../src/core/engine.js';
import { levelFromAscii, run, hitSet, eventsOf, idx } from './helpers.mjs';

// ------------------------------------------------------------
// Géiseres (regla del usuario): no necesitan mecha, arrancan al pulsar
// Detonar, explotan al vencer su temporizador con una cruz de alcance 2.
// Unidad del temporizador NO confirmada → se declara "tick" (Q5).
// ------------------------------------------------------------

test('un géiser arranca solo al detonar, sin colocarse encima ni mecha', () => {
  const lvl = levelFromAscii([
    '.....',
    '.Y...',
    '.....',
  ], { tray: [1], timers: { '1,1': 2 } });
  const board = prepareBoard(lvl);
  // La mecha está lejos y no alcanza el géiser: aun así debe explotar.
  const res = simulate(board, new Map([[idx(4, 0, 5), 1]]), idx(4, 0, 5), {});
  const geyserEx = res.log.filter((e) => e.type === 'geyser-armed');
  assert.equal(geyserEx.length, 1, 'se arma al inicio del turno');
  assert.equal(geyserEx[0].timer, 2);
  assert.equal(geyserEx[0].cause, 'detonar');
  const boom = res.log.filter((e) => e.type === 'explosion' && e.kind === 'geyser');
  assert.equal(boom.length, 1, 'el géiser explota por su temporizador');
});

test('el valor del temporizador 1..5 se conserva y se respeta como tick', () => {
  for (const timer of [1, 2, 3, 4, 5]) {
    const lvl = levelFromAscii(['.....', '.Y...', '.....'], { tray: [1], timers: { '1,1': timer } });
    const board = prepareBoard(lvl);
    const res = simulate(board, new Map([[idx(4, 2, 5), 1]]), idx(4, 2, 5), {});
    const boom = res.log.find((e) => e.type === 'explosion' && e.kind === 'geyser');
    assert.ok(boom, `explota con timer ${timer}`);
    assert.equal(boom.tick, timer, `el temporizador ${timer} vence en el tick ${timer}`);
  }
});

test('el temporizador se limita a 1..5 de forma determinista', () => {
  const lvl = levelFromAscii(['.....', '.Y...', '.....'], { tray: [1], timers: { '1,1': 9 } });
  const board = prepareBoard(lvl);
  const res = simulate(board, new Map([[idx(4, 2, 5), 1]]), idx(4, 2, 5), {});
  const armed = res.log.find((e) => e.type === 'geyser-armed');
  assert.equal(armed.timer, 5);
});

test('la explosión del géiser es una cruz de alcance 2 más el centro', () => {
  const lvl = levelFromAscii([
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '...Y...',
    '.......',
    '.......',
    '.......',
  ], { tray: [1], timers: { '3,5': 1 } });
  const board = prepareBoard(lvl);
  const res = simulate(board, new Map([[idx(0, 0, 7), 1]]), idx(0, 0, 7), {});
  const ex = res.ticks.flatMap((t) => t.explosions || []).find((e) => e.kind === 'geyser');
  assert.ok(ex, 'el géiser explota');
  const cells = new Set(ex.cells);
  assert.ok(cells.has('3,5'), 'centro');
  for (const c of ['3,3', '3,7', '1,5', '5,5']) assert.ok(cells.has(c), `alcanza ${c}`);
  assert.ok(!cells.has('3,2'), 'no llega a 3 casillas');
  assert.equal(cells.size, 9, 'cruz de alcance 2 = 9 casillas');
});

test('un géiser detona bombas cercanas e inicia una reacción en cadena', () => {
  const lvl = levelFromAscii([
    '..........',
    '..........',
    '..........',
    '..........',
  ], { tray: [1, 1], timers: { '0,1': 1 } });
  const board = prepareBoard(lvl);
  // Bomba A en (3,1) es la mecha (lejos del géiser), bomba B a 2 casillas del géiser.
  const res = simulate(board, new Map([
    [idx(3, 1, 10), 1],
    [idx(2, 1, 10), 1],
  ]), idx(3, 1, 10), {});
  assert.equal(res.metrics.pendingBombs.length, 0, 'todas las bombas detonaron');
  assert.equal(res.status, 'resolved');
  const ignited = res.log.filter((e) => e.type === 'bomb-ignited');
  assert.ok(ignited.length >= 1);
});

test('un géiser puede activar a otro géiser sólo si la regla lo permite (Q8)', () => {
  const lvl = levelFromAscii([
    'Y..Y...',
    '.......',
    '.......',
    '.......',
  ], { tray: [1], timers: { '0,0': 5, '3,0': 5 } });
  const board = prepareBoard(lvl);
  // El géiser de (0,0) tarda 5; el de (3,0) también. Con alcance 2 no se tocan.
  const res = simulate(board, new Map([[idx(6, 3, 7), 1]]), idx(6, 3, 7), {});
  const geyserBooms = res.ticks.flatMap((t) => t.explosions || []).filter((e) => e.kind === 'geyser');
  assert.equal(geyserBooms.length, 2, 'ambos explotan aunque no se alcancen');
});

test('los géiseres respetan el orden determinista con las bombas en el mismo tick', () => {
  const lvl = levelFromAscii(['.....', '.Y...', '.....'], { tray: [1], timers: { '1,1': 1 } });
  const board = prepareBoard(lvl);
  // Mecha en (1,2) N1: explota en el tick 1 igual que el géiser (timer 1).
  const res = simulate(board, new Map([[idx(1, 2, 5), 1]]), idx(1, 2, 5), {});
  const tick1 = res.ticks.find((t) => t.tick === 1);
  const kinds = tick1.explosions.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['bomb', 'geyser'], 'ambos ocurren en el mismo tick, sin depender del orden');
  // El daño simultáneo no duplica la destrucción de un objeto.
  const lvl2 = levelFromAscii(['.....', '.YK..', '.....'], { tray: [1], timers: { '1,1': 1 } });
  const board2 = prepareBoard(lvl2);
  const res2 = simulate(board2, new Map([[idx(1, 2, 5), 1]]), idx(1, 2, 5), {});
  const crystalDamage = res2.log.filter((e) => e.type === 'damage' && e.object === 'crystal');
  assert.ok(crystalDamage.length <= 2, 'el cristal no recibe daño duplicado por el mismo impacto simultáneo');
});

test('un géiser no es un objetivo ni se destruye', () => {
  const lvl = levelFromAscii(['.....', '.Y...', '.....'], { tray: [1], timers: { '1,1': 1 } });
  const { res } = run(lvl, [[idx(1, 2, 5), 1]], idx(1, 2, 5));
  assert.equal(res.final.alive[idx(1, 1, 5)], 1, 'el géiser sigue en el tablero');
});

test('el arranque de géiseres se puede desplazar un tick sin reescribir el motor', () => {
  const lvl = levelFromAscii(['.....', '.Y...', '.....'], { tray: [1], timers: { '1,1': 2 } });
  const board = prepareBoard(lvl);
  const res = simulate(board, new Map([[idx(4, 2, 5), 1]]), idx(4, 2, 5), { geyserArmMode: 'tick1' });
  const boom = res.log.find((e) => e.type === 'explosion' && e.kind === 'geyser');
  assert.equal(boom.tick, 3, 'con arranque en el tick 1 el temporizador 2 vence en el tick 3');
});
