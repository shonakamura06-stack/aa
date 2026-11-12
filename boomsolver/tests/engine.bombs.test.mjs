import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBoard, simulate } from '../src/core/engine.js';
import { evaluateOutcome } from '../src/core/goals.js';
import { levelFromAscii, run, hitSet, eventsOf, idx } from './helpers.mjs';

// ---- Alcance de cada nivel de bomba (spec §3.1) ----
for (const [level, range] of [[1, 1], [2, 2], [3, 3], [4, 4]]) {
  test(`N${level} abre una cruz de alcance ${range} más el centro`, () => {
    const lines = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........'];
    const center = idx(4, 4, 10);
    const lvl = levelFromAscii(lines, { tray: [level] });
    const { res } = run(lvl, [[center, level]], center);
    assert.equal(res.status, 'resolved');
    const hits = hitSet(res);
    assert.equal(hits.size, 1 + 4 * range);
    assert.ok(hits.has('4,4'));
    assert.ok(hits.has(`${4 + range},4`));
    assert.ok(hits.has(`${4 - range},4`));
    assert.ok(hits.has(`4,${4 + range}`));
    assert.ok(hits.has(`4,${4 - range}`));
    assert.ok(!hits.has(`${4 + range + 1},4`));
  });
}

test('la pólvora equivalente es 1,2,4,8 y es distinta del número de bombas', () => {
  const lines = ['....', '....', '....'];
  const lvl = levelFromAscii(lines, { tray: [4] });
  const { res } = run(lvl, [[idx(1, 1, 4), 4]], idx(1, 1, 4));
  assert.equal(res.metrics.placedCount, 1);
  assert.equal(res.metrics.powder, 8);
});

test('un muro detiene el rayo', () => {
  const lvl = levelFromAscii(['.....', '..#..', '.....'], { tray: [3] });
  const { res } = run(lvl, [[idx(0, 1, 5), 3]], idx(0, 1, 5));
  const hits = hitSet(res);
  assert.ok(hits.has('1,1'));
  assert.ok(hits.has('2,1'), 'la casilla del muro registra el impacto que detuvo el rayo');
  assert.ok(!hits.has('3,1'), 'el rayo no atraviesa el muro');
});

test('el cofre de hierro necesita dos impactos y su HP persiste entre olas', () => {
  // Un solo impacto: sobrevive.
  const lvl1 = levelFromAscii(['.....', '.I...', '.....'], { tray: [2] });
  const { res: r1 } = run(lvl1, [[idx(0, 1, 5), 2]], idx(0, 1, 5));
  assert.equal(r1.final.alive[idx(1, 1, 5)], 1, 'sobrevive al primer impacto');
  assert.equal(r1.final.hp[idx(1, 1, 5)], 1, 'le queda 1 punto de vida');

  // Dos olas: la mecha golpea el cofre y también enciende una dinamita 3x3
  // que en la ola siguiente vuelve a golpearlo.
  const lvl2 = levelFromAscii(['D....', '.I...', '.....'], { tray: [1], rules: { dynamitePattern: 'x3x3' } });
  const { res: r2 } = run(lvl2, [[idx(0, 1, 5), 1]], idx(0, 1, 5));
  assert.ok(r2.metrics.tickCount >= 2, 'la dinamita añade una ola');
  assert.equal(r2.final.alive[idx(1, 1, 5)], 0, 'muere con el segundo impacto');
});

test('un objeto destruido sigue bloqueando durante el tick en que se destruye', () => {
  // Roca blanda en (2,1) y gema detrás en (4,1): la roca bloquea y la gema no cae.
  const lvl = levelFromAscii(['.....', '..X.G', '.....'], { tray: [4] });
  const { res } = run(lvl, [[idx(0, 1, 5), 4]], idx(0, 1, 5));
  assert.equal(res.final.alive[idx(2, 1, 5)], 0, 'la roca se destruye');
  assert.equal(res.final.alive[idx(4, 1, 5)], 1, 'la gema de detrás sigue viva en la misma ola');
});

test('bomba colocada sin detonar ⇒ no es una victoria válida (disconnected)', () => {
  const lvl = levelFromAscii([
    '.........',
    '.........',
    '.........',
  ], { tray: [1, 1] });
  // Dos bombas lejos: la segunda nunca se alcanza.
  const { res } = run(lvl, [[idx(0, 0, 9), 1], [idx(8, 2, 9), 1]], idx(0, 0, 9));
  assert.equal(res.status, 'invalid');
  assert.equal(res.reason, 'disconnected');
  assert.equal(res.metrics.pendingBombs.length, 1);
});

test('reacción en cadena: una bomba enciende a la siguiente', () => {
  const lvl = levelFromAscii([
    '..........',
    '..........',
    '..........',
  ], { tray: [1, 1, 1] });
  const { res } = run(lvl, [
    [idx(3, 1, 10), 1], [idx(4, 1, 10), 1], [idx(5, 1, 10), 1],
  ], idx(3, 1, 10));
  assert.equal(res.status, 'resolved');
  assert.equal(res.metrics.tickCount, 3, 'tres olas encadenadas');
  assert.equal(res.metrics.pendingBombs.length, 0);
});

test('la mecha debe ser una bomba colocada', () => {
  const lvl = levelFromAscii(['...'], { tray: [1] });
  const { res } = run(lvl, [], 0);
  assert.equal(res.status, 'invalid');
  assert.equal(res.reason, 'no_mecha');
});

test('peligros: tocar un cristal produce derrota', () => {
  const lvl = levelFromAscii(['.....', '..K..', '.....'], { tray: [2] });
  const { res } = run(lvl, [[idx(0, 1, 5), 2]], idx(0, 1, 5));
  assert.equal(res.status, 'lose');
  assert.equal(res.reason, 'hazard');
  assert.equal(res.metrics.hazard.type, 'crystal');
  assert.equal(res.final.alive[idx(2, 1, 5)], 1, 'el cristal no se destruye');
});

test('condición negativa "sin romper cristales" falla aunque el objetivo se cumpla', () => {
  const lvl = levelFromAscii(['K....', '.C...', '.....'], { tray: [2] });
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'], count: 1 },
    { kind: 'noDestroy', types: ['crystal'], negative: true },
  ];
  const { res, verdict } = run(lvl, [[idx(0, 1, 5), 2]], idx(0, 1, 5), objectives);
  assert.equal(res.final.alive[idx(1, 1, 5)], 0, 'el cofre sí se abre');
  assert.equal(res.status, 'lose', 'el cristal también se rompe');
  assert.equal(verdict.win, false);
  assert.ok(verdict.failures.some((f) => f.kind === 'negative'));
});

test('condición negativa se cumple si el cristal no se toca', () => {
  const lvl = levelFromAscii(['.....', '.C...', '.....'], { tray: [1] });
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'], count: 1 },
    { kind: 'noDestroy', types: ['crystal'], negative: true },
  ];
  const { verdict } = run(lvl, [[idx(0, 1, 5), 1]], idx(0, 1, 5), objectives);
  assert.equal(verdict.win, true);
});

test('la detonación es determinista: mismo estado ⇒ mismo resultado', () => {
  const lvl = levelFromAscii([
    '.........',
    '.C...D.X.',
    '....K....',
  ], { tray: [2, 1] });
  const placements = [[idx(0, 1, 9), 2], [idx(6, 1, 9), 1]];
  const a = run(lvl, placements, idx(0, 1, 9)).res;
  const b = run(lvl, placements, idx(0, 1, 9)).res;
  assert.deepEqual(a.final, b.final);
  assert.deepEqual(a.log.map((e) => e.type), b.log.map((e) => e.type));
});
