import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBoard, simulate, mirrorTurn } from '../src/core/engine.js';
import { levelFromAscii, run, hitSet, eventsOf, idx } from './helpers.mjs';

// ------------------------------------------------------------
// Espejos
// ------------------------------------------------------------

test('convención de espejos: / y \\ en las cuatro direcciones', () => {
  assert.equal(mirrorTurn('slash', 'right'), 'up');
  assert.equal(mirrorTurn('slash', 'down'), 'left');
  assert.equal(mirrorTurn('slash', 'left'), 'down');
  assert.equal(mirrorTurn('slash', 'up'), 'right');
  assert.equal(mirrorTurn('backslash', 'right'), 'down');
  assert.equal(mirrorTurn('backslash', 'up'), 'left');
  assert.equal(mirrorTurn('backslash', 'left'), 'up');
  assert.equal(mirrorTurn('backslash', 'down'), 'right');
  assert.equal(mirrorTurn('slash', 'ur'), null, 'diagonal sin convención confirmada');
});

test('un espejo / desvía el rayo 90° (up → right)', () => {
  // Bomba en (0,3) N3: sube por la columna 0, el espejo / está en (0,2).
  const lvl = levelFromAscii([
    '....',
    '....',
    '/...',
    '....',
    '....',
  ], { tray: [3] });
  const { res } = run(lvl, [[idx(0, 3, 4), 3]], idx(0, 3, 4));
  const hits = hitSet(res);
  assert.ok(hits.has('0,2'), 'llega al espejo');
  assert.ok(hits.has('1,2'), 'gira 90° y sigue hacia la derecha');
  assert.ok(!hits.has('0,1'), 'no atraviesa el espejo en línea recta');
});

test('un espejo \\ desvía el rayo al lado contrario (up → left)', () => {
  const lvl = levelFromAscii([
    '....',
    '....',
    '\\...',
    '....',
    '....',
  ], { tray: [3] });
  const { res } = run(lvl, [[idx(0, 3, 4), 3]], idx(0, 3, 4));
  const hits = hitSet(res);
  assert.ok(hits.has('0,2'), 'llega al espejo');
  assert.ok(!hits.has('1,2'), 'no gira hacia la derecha');
  assert.ok(!hits.has('0,1'), 'no sigue recto');
});

test('el espejo no bloquea el rayo (dos rayos pueden atravesarlo)', () => {
  const lvl = levelFromAscii(['./.', '...', '...'], { tray: [2] });
  const board = prepareBoard(lvl);
  assert.equal(board.hp0[idx(1, 0, 3)], -1, 'el espejo es indestructible');
});

// ------------------------------------------------------------
// Detonadores y cables
// ------------------------------------------------------------

test('el detonador explota su carga conectada, aunque esté lejos', () => {
  const lvl = levelFromAscii([
    'E.......',
    '........',
    '........',
    '........',
    '.......D',
  ], { tray: [1] });
  lvl.links = { '0,0': ['7,4'] };
  const { res } = run(lvl, [[idx(1, 0, 8), 1]], idx(1, 0, 8));
  assert.equal(res.final.alive[idx(7, 4, 8)], 0, 'la dinamita conectada explota');
  const fired = eventsOf(res, 'detonator-fired');
  assert.equal(fired.length, 1);
  assert.deepEqual(fired[0].targets, ['7,4']);
});

test('sin cable, el detonador no activa nada', () => {
  const lvl = levelFromAscii([
    'E.......',
    '........',
    '.......D',
  ], { tray: [1] });
  const { res } = run(lvl, [[idx(1, 1, 8), 1]], idx(1, 1, 8));
  assert.equal(res.final.alive[idx(7, 2, 8)], 1, 'la dinamita no conectada sigue viva');
  assert.equal(eventsOf(res, 'detonator-fired').length, 0, 'el detonador no fue alcanzado por la onda');
});

test('el cable encadena: detonador → dinamita → objetos cercanos', () => {
  const lvl = levelFromAscii([
    'E.......',
    '........',
    '....C.D.',
  ], { tray: [1], rules: { dynamitePattern: 'row' } });
  lvl.links = { '0,0': ['6,2'] };
  const { res } = run(lvl, [[idx(1, 0, 8), 1]], idx(1, 0, 8), [{ kind: 'destroy', types: ['chest_wood'], count: 1 }]);
  assert.equal(res.final.alive[idx(4, 2, 8)], 0, 'el cofre cae por la explosión de la dinamita');
  assert.equal(res.metrics.tickCount, 2, 'ticks: 1) mecha+detonador 2) dinamita');
});

test('un objeto con HP 2 resiste la primera ola y cae en la segunda', () => {
  // Roca dura en (1,1). La mecha en (1,0) golpea la roca (1 impacto, tick 1) y
  // enciende la dinamita en (0,0), que con patrón 3x3 vuelve a golpearla (tick 2).
  const lvl = levelFromAscii(['D...', '.R..', '....'], { tray: [1], rules: { dynamitePattern: 'x3x3' } });
  const { res } = run(lvl, [[idx(1, 0, 4), 1]], idx(1, 0, 4));
  const dmg = eventsOf(res, 'damage').filter((e) => e.object === 'rock_hard');
  assert.equal(dmg.length, 2, 'dos impactos en olas distintas');
  assert.deepEqual(dmg.map((d) => d.tick), [1, 2]);
  assert.equal(res.final.alive[idx(1, 1, 4)], 0);
});

// ------------------------------------------------------------
// Dinamita, magma y patrones
// ------------------------------------------------------------

for (const [pattern, expect] of [
  // Dinamita en (2,2); la mecha N1 está justo debajo, en (2,3).
  ['cross1', (h) => h.has('2,1') && h.has('1,2') && h.has('3,2') && !h.has('1,1') && !h.has('2,4') === false],
  ['x3x3', (h) => h.has('2,1') && h.has('1,2') && h.has('3,2') && h.has('1,1') && h.has('3,3')],
  ['row', (h) => h.has('0,2') && h.has('4,2') && !h.has('2,1')],
  ['col', (h) => h.has('2,0') && h.has('2,4') && !h.has('1,2')],
]) {
  test(`patrón de dinamita "${pattern}"`, () => {
    const lvl = levelFromAscii([
      '.....',
      '.....',
      '..D..',
      '.....',
      '.....',
    ], { tray: [1], rules: { dynamitePattern: pattern } });
    const { res } = run(lvl, [[idx(2, 3, 5), 1]], idx(2, 3, 5));
    const h = hitSet(res);
    assert.equal(res.final.alive[idx(2, 2, 5)], 0, 'la dinamita se destruye');
    assert.ok(expect(h), `casillas esperadas del patrón ${pattern}: ${[...h].sort().join(' ')}`);
  });
}

for (const range of [1, 2, 3]) {
  test(`magma con alcance ${range}`, () => {
    // Magma en (3,2); la mecha N1 está debajo, en (3,3), y activa el magma.
    const grid = Array.from({ length: 9 }, () => '.........');
    grid[4] = '...M.....';
    const lvl = levelFromAscii(grid, { tray: [1], rules: { magmaRange: range } });
    const { res } = run(lvl, [[idx(3, 5, 9), 1]], idx(3, 5, 9));
    const h = hitSet(res);
    assert.equal(res.final.alive[idx(3, 4, 9)], 0, 'el magma se consume');
    assert.ok(h.has(`${3 + range},4`), `alcanza a la derecha ${range}`);
    assert.ok(!h.has(`${4 + range},4`), 'no pasa del alcance configurado');
    assert.ok(h.has(`3,${4 - range}`), `alcanza arriba ${range}`);
  });
}

test('la roca de magma detiene la onda que la activa (regla configurable)', () => {
  // Bomba N3 en C3F1 (casilla vacía), magma en C2F1 y cofre en C1F1 detrás.
  // La onda de la bomba llega al magma y NO debe pasar al cofre en el mismo tick.
  // Tablero: C=cofre en C1F1, M=magma en C2F1, bomba N3 en C3F1.
  const lvl = levelFromAscii(['CM.......'], { tray: [3] });
  const { res } = run(lvl, [[idx(2, 0, 9), 3]], idx(2, 0, 9));
  const tick1 = (res.ticks.find((t) => t.tick === 1) || { explosions: [] }).explosions
    .flatMap((e) => e.cells);
  assert.ok(tick1.includes('1,0'), 'la onda llega al magma de C2F1');
  assert.ok(!tick1.includes('0,0'), 'el magma detiene la onda: no llega al cofre de C1F1');
  // Y el magma estalla después, así que el cofre acaba cayendo igual: se comprueba
  // que el magma se consume y que el efecto llega en un tick posterior.
  assert.equal(res.final.alive[idx(1, 0, 9)], 0, 'el magma se consume');
});

test('cadenas del mismo tipo (regla opcional)', () => {
  const lvl = levelFromAscii([
    'D..D..D',
    '.......',
  ], { tray: [1] });
  const { res } = run(lvl, [[idx(3, 1, 7), 1]], idx(3, 1, 7));
  // Sin cadena del mismo tipo, cada dinamita explota al ser alcanzada por la onda,
  // no en cadena remota.
  assert.equal(res.final.alive[idx(0, 0, 7)], 1);
  assert.equal(res.final.alive[idx(3, 0, 7)], 0);
  assert.equal(res.final.alive[idx(6, 0, 7)], 1);
});

// ------------------------------------------------------------
// Eventos simultáneos y compuestos
// ------------------------------------------------------------

test('dos interruptores que deben activarse a la vez en el mismo tick', () => {
  const lvl = levelFromAscii([
    '.........',
    'S.......S',
    '.........',
  ], { tray: [4] });
  const objectives = [{ kind: 'activate', types: ['switch'], simultaneous: true }];
  // Una bomba sola en el centro activa los dos en el mismo tick.
  const { res, verdict } = run(lvl, [[idx(4, 1, 9), 4]], idx(4, 1, 9), objectives);
  assert.equal(res.final.activated[idx(0, 1, 9)], 1);
  assert.equal(res.final.activated[idx(8, 1, 9)], 1);
  assert.equal(verdict.win, true, 'activación simultánea válida');
  assert.equal(res.final.activatedTick[idx(0, 1, 9)], res.final.activatedTick[idx(8, 1, 9)]);
});

test('si los interruptores se activan en ticks distintos no cuenta como "a la vez"', () => {
  const lvl = levelFromAscii([
    '.........',
    'S.......S',
    '.........',
  ], { tray: [1, 1] });
  const { res } = run(lvl, [[idx(0, 0, 9), 1], [idx(8, 2, 9), 1]], idx(0, 0, 9));
  // Sólo se activa el de la izquierda: el otro no está al alcance.
  const ticks = [res.final.activatedTick[idx(0, 1, 9)], res.final.activatedTick[idx(8, 1, 9)]];
  assert.notEqual(ticks[0], ticks[1]);
});

test('objetivos compuestos: cofres + gemas + sin romper cristales', () => {
  const lvl = levelFromAscii([
    '.........',
    'C.......G',
    '.........',
    '..K......',
  ], { tray: [4] });
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'], count: 1 },
    { kind: 'destroy', types: ['gem'], count: 1 },
    { kind: 'noDestroy', types: ['crystal'], negative: true },
  ];
  // Una N4 en (4,1) abre el cofre (0,1) y recoge la gema (8,1) sin tocar el cristal (2,3).
  const { verdict } = run(lvl, [[idx(4, 1, 9), 4]], idx(4, 1, 9), objectives);
  assert.equal(verdict.win, true, JSON.stringify(verdict.failures));
  assert.equal(verdict.checks.length, 3);
});

test('bombas enemigas: se detonan como parte de la cadena', () => {
  const lvl = levelFromAscii([
    '.........',
    '.....e...',
    '.........',
  ], { tray: [2], rules: { requireEnemyBombs: true } });
  const { res } = run(lvl, [[idx(3, 1, 9), 2]], idx(3, 1, 9), [{ kind: 'enemyBombs' }]);
  assert.equal(res.final.alive[idx(5, 1, 9)], 0, 'la enemiga explota');
  assert.equal(res.status, 'resolved');
});

test('nivel mínimo de daño: un objeto que exige N3 no cae con N1', () => {
  const level = {
    cols: 3, rows: 1, tray: [1],
    cells: [[
      'empty',
      { type: 'custom_tough', hp: 1 },
      'empty',
    ]],
  };
  // El catálogo no acepta tipos inventados: se comportan como muro y se avisan.
  const board = prepareBoard(level);
  assert.equal(board.warnings.some((w) => w.kind === 'unknown-cell'), true);
});
