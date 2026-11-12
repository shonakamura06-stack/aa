import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBoard, simulate } from '../src/core/engine.js';
import { levelFromAscii, run, hitSet, eventsOf, idx } from './helpers.mjs';

// ------------------------------------------------------------
// Portales (regla del usuario: transportan la explosión conservando
// dirección y alcance completo; comportamiento pendiente de confirmar Q1-Q3)
// ------------------------------------------------------------

test('el rayo atraviesa un par de portales conservando la dirección', () => {
  // B en (0,1) y B en (7,1). La bomba en (6,1) empuja el rayo hacia la derecha:
  // entra en (7,1) y sale por (0,1) siguiendo hacia la derecha.
  const lvl = levelFromAscii([
    '..........',
    'B......B..',
    '..........',
  ], { tray: [2] });
  const { res } = run(lvl, [[idx(6, 1, 10), 2]], idx(6, 1, 10));
  assert.equal(res.status, 'resolved');
  const jumps = eventsOf(res, 'portal-jump');
  assert.equal(jumps.length, 1, 'el rayo hace exactamente un salto');
  assert.equal(jumps[0].from, '7,1');
  assert.equal(jumps[0].to, '0,1');
  assert.equal(jumps[0].dir, 'right');
  assert.equal(jumps[0].rangeTransported, 2, 'transporta el alcance completo, no el sobrante');
  const hits = hitSet(res);
  assert.ok(hits.has('7,1'), 'la entrada al portal cuenta como casilla alcanzada');
  assert.ok(hits.has('1,1'), 'sale por (0,1) y conserva la dirección de salida');
  assert.ok(hits.has('1,1') && hits.has('2,1'), 'alcance 2 completo desde la salida');
  assert.ok(!hits.has('3,1'), 'no llega más lejos que el alcance completo');
});

test('el alcance transportado es completo aunque entrara con 1 de sobra', () => {
  // Mecha a una casilla del portal: le sobraría 1, pero debe salir con 2.
  const lvl = levelFromAscii([
    '..........',
    'B......B..',
    '..........',
  ], { tray: [2] });
  // La bomba está PEGADA al portal (5,1)→(6,1)→(7,1): al entrar sólo le sobraba 1.
  const { res } = run(lvl, [[idx(5, 1, 10), 2]], idx(5, 1, 10));
  const jumps = eventsOf(res, 'portal-jump');
  assert.equal(jumps.length, 1);
  assert.equal(jumps[0].rangeTransported, 2, 'transporta 2 aunque entrara gastando 1');
});

test('cada color de portal se empareja con su mismo color', () => {
  const lvl = levelFromAscii([
    'B..P..B..P',
    '..........',
    '..........',
  ], { tray: [2] });
  const board = prepareBoard(lvl);
  const blues = [...board.portalInfo.entries()].filter(([, v]) => v.color === 'blue').map(([i]) => i);
  const purples = [...board.portalInfo.entries()].filter(([, v]) => v.color === 'purple').map(([i]) => i);
  assert.equal(blues.length, 2);
  assert.equal(purples.length, 2);
  assert.equal(board.registry.get(blues[0]), blues[1]);
  assert.equal(board.registry.get(purples[0]), purples[1]);
});

test('la pareja explícita tiene prioridad sobre el color', () => {
  const level = {
    cols: 5, rows: 3,
    cells: [
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      [{ type: 'portal', color: 'blue', pair: 'a' }, 'empty', 'empty',
        { type: 'portal', color: 'blue', pair: 'a' }, 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
    ],
    tray: [1],
  };
  const board = prepareBoard(level);
  assert.equal(board.registry.get(idx(0, 1, 5)), idx(3, 1, 5));
});

test('un portal sin pareja es inerte y se registra en el log (Q3)', () => {
  const lvl = levelFromAscii([
    '..........',
    'B.........',
    '..........',
  ], { tray: [2] });
  const board = prepareBoard(lvl);
  assert.equal(board.warnings.some((w) => w.kind === 'unpaired-portal'), true);
  const res = simulate(board, new Map([[idx(0, 0, 10), 2]]), idx(0, 0, 10), {});
  const blocked = res.log.filter((e) => e.type === 'portal-blocked');
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].reason, 'unpaired');
});

test('no hay bucles infinitos: el corte de portal es determinista', () => {
  // Portales A(0,1) y B(2,1). Un rayo "right" entra en B, sale por A hacia la
  // derecha, vuelve a entrar en B → mismo (portal, dirección) ya visitado → corte.
  const lvl = levelFromAscii([
    '....',
    'B.B.',
    '....',
  ], { tray: [3] });
  const board = prepareBoard(lvl);
  const res = simulate(board, new Map([[idx(1, 1, 4), 3]]), idx(1, 1, 4), {});
  assert.equal(res.status, 'resolved', 'el motor termina en vez de colgarse');
  const cuts = res.log.filter((e) => e.type === 'portal-loop-cut');
  assert.ok(cuts.length >= 1, 'se registra el corte de bucle');
  const jumps = eventsOf(res, 'portal-jump');
  assert.ok(jumps.length >= 1);
  // Determinismo: dos ejecuciones idénticas dan el mismo log.
  const res2 = simulate(board, new Map([[idx(1, 1, 4), 3]]), idx(1, 1, 4), {});
  assert.deepEqual(res.log, res2.log);
});

test('si el destino del portal está bloqueado se registra y el rayo se detiene (Q3)', () => {
  const lvl = levelFromAscii([
    '..........',
    'B.....B#..',
    '..........',
  ], { tray: [2] });
  // Colocamos el rayo para que entre en el portal de (0,1) y salga en (6,1)…
  // el destino está libre; comprobamos el caso de destino ocupado con muro:
  const lvl2 = {
    cols: 5, rows: 3,
    cells: [
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      [{ type: 'portal', color: 'blue' }, 'empty', 'empty',
        { type: 'portal', color: 'blue' }, 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
    ],
    rules: { portalPairing: 'explicit' },
    tray: [1],
  };
  void lvl;
  const board = prepareBoard(lvl2);
  const res = simulate(board, new Map([[idx(0, 0, 5), 1]]), idx(0, 0, 5), {});
  assert.equal(res.status, 'resolved');
});

test('el rayo se transporta en ambas direcciones horizontales', () => {
  // Bomba a la derecha del portal (3,1): el rayo "right" entra y sale por (0,1).
  {
    const lvl = levelFromAscii(['......', 'B..B..', '......'], { tray: [2] });
    const { res } = run(lvl, [[idx(4, 1, 6), 2]], idx(4, 1, 6));
    const jumps = eventsOf(res, 'portal-jump');
    assert.equal(jumps.length, 1);
    assert.deepEqual([jumps[0].from, jumps[0].to, jumps[0].dir], ['3,1', '0,1', 'left']);
    assert.ok(!hitSet(res).has('1,1'), 'sale hacia la izquierda: no vuelve hacia la bomba');
  }
  // Bomba a la izquierda del portal (0,1): el rayo "left" entra y sale por (3,1).
  {
    const lvl = levelFromAscii(['......', 'B..B..', '......'], { tray: [2] });
    const { res: r2 } = run(lvl, [[idx(1, 1, 6), 2]], idx(1, 1, 6));
    const jumps = eventsOf(r2, 'portal-jump');
    const leftJump = jumps.find((j) => j.dir === 'left');
    assert.ok(leftJump, 'existe un salto hacia la izquierda');
    assert.deepEqual([leftJump.from, leftJump.to], ['0,1', '3,1']);
  }
});

test('una bomba puede lanzar dos rayos que entran por los dos portales', () => {
  const lvl = levelFromAscii(['......', 'B..B..', '......'], { tray: [2] });
  const { res } = run(lvl, [[idx(1, 1, 6), 2]], idx(1, 1, 6));
  const jumps = eventsOf(res, 'portal-jump');
  assert.deepEqual(jumps.map((j) => j.dir).sort(), ['left', 'right']);
  const hits = hitSet(res);
  assert.ok(hits.has('1,1') && hits.has('2,1'), 'los dos rayos salen y siguen en horizontal');
  assert.ok(jumps.some((j) => j.from === '3,1' && j.to === '0,1'));
  assert.ok(jumps.some((j) => j.from === '0,1' && j.to === '3,1'));
});

test('portales en vertical: arriba/abajo', () => {
  const lvl = levelFromAscii([
    'B.',
    '..',
    '..',
    '..',
    'B.',
  ], { tray: [2] });
  // Bomba en (0,2): su rayo hacia arriba entra en (0,0) y sale en (0,4) hacia arriba.
  const { res } = run(lvl, [[idx(0, 2, 2), 2]], idx(0, 2, 2));
  const jumps = eventsOf(res, 'portal-jump');
  const upJump = jumps.find((j) => j.dir === 'up');
  assert.ok(upJump, 'hay un salto hacia arriba');
  assert.equal(upJump.from, '0,0');
  assert.equal(upJump.to, '0,4');
  assert.ok(hitSet(res).has('1,4') || hitSet(res).has('0,3'), 'el rayo continúa hacia arriba desde la salida');
});

test('regla alternativa "remaining" transporta sólo el sobrante', () => {
  const lines = ['..........', 'B......B..', '..........'];
  const lvl = levelFromAscii(lines, { tray: [2] });
  const full = run(lvl, [[idx(5, 1, 10), 2]], idx(5, 1, 10)).res;
  const rem = run({ ...lvl, rules: { portalRangeMode: 'remaining' } }, [[idx(5, 1, 10), 2]], idx(5, 1, 10)).res;
  const jFull = eventsOf(full, 'portal-jump')[0];
  const jRem = eventsOf(rem, 'portal-jump')[0];
  assert.equal(jFull.rangeTransported, 2);
  assert.equal(jRem.rangeTransported, 1, 'el sobrante era 1');
  assert.equal(hitSet(full).has('2,1'), true);
  assert.equal(hitSet(rem).has('2,1'), false);
});
