// ============================================================
// Corrección del SOLVER contra un oráculo INDEPENDIENTE
// ============================================================
// El encargo §6 exige comprobar el buscador con fuerza bruta independiente:
// tableros pequeños, inventarios distintos, fusiones, mecha en posiciones
// distintas, cadenas con detonadores/dinamita/magma/portales/géiseres,
// objetivos multi-golpe y compuestos, múltiples óptimos, imposibles y timeouts.
//
// El oráculo (src/solver/bruteforce.js) está escrito de cero: no usa fusión de
// cargamentos, ni poda, ni firmas canónicas del solver. Comparte a propósito el
// MOTOR (es la física del producto) y la EVALUACIÓN DE OBJETIVOS (la definición
// de ganar). Por eso una discrepancia aquí es un defecto real del buscador:
// o se deja soluciones buenas fuera, o presenta como ganadora una que no lo es.

import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifySolution, computePareto } from '../src/solver/solver.js';
import { bruteForce, bruteSignature, solverSignature } from '../src/solver/bruteforce.js';
import { grid, at } from '../src/validation/harness.js';

const idx = (x, y, cols = 10) => y * cols + x;
import { prepareBoard, simulate } from '../src/core/engine.js';
import { evaluateOutcome } from '../src/core/goals.js';

const THOROUGH = { maxBombs: 3, timeBudgetMs: 15000, comboCap: 200000 };

/** Compara solver y oráculo: ni una solución buena perdida, ni una falsa. */
function compare(level, objectives, opts = {}) {
  const bf = bruteForce(level, objectives, {
    maxBombs: opts.bfMaxBombs ?? 2,
    includeFusions: opts.includeFusions ?? true,
  });
  const sv = solve(level, objectives, { ...THOROUGH, ...(opts.solver || {}) });
  assert.equal(bf.complete, true, 'el oráculo debe haber terminado el espacio completo');

  const bset = new Set(bf.solutions.map(bruteSignature));
  const sset = new Set(sv.solutions.map(solverSignature));
  const onlyBrute = [...bset].filter((x) => !sset.has(x));
  const onlySolver = [...sset].filter((x) => !bset.has(x));

  assert.deepEqual(onlyBrute, [],
    `el solver perdió soluciones óptimas que la fuerza bruta sí encuentra: ${onlyBrute.join(' | ')}`);
  assert.deepEqual(onlySolver, [],
    `el solver presentó soluciones que la fuerza bruta no encuentra (o que no son mínimas): ${onlySolver.join(' | ')}`);

  // Y toda solución presentada tiene que ganar de verdad al re-simularla.
  for (const s of sv.solutions) {
    const check = verifySolution(level, objectives, s);
    assert.equal(check.ok, true, `solución presentada que no gana: ${s.signature}`);
  }
  return { bf, sv, bset, sset };
}

test('tablero mínimo: una bomba, un objetivo — solver y oráculo coinciden', () => {
  const level = { ...grid(['......', '.C....']), tray: [2] };
  const objectives = [{ kind: 'destroy', types: ['chest_wood'] }];
  const { bf, sv } = compare(level, objectives);
  assert.equal(bf.minimumBombs, 1);
  assert.equal(sv.status, 'optimalityProven');
  assert.equal(sv.solutions[0].physicalBombs, 1);
  assert.equal(sv.solutions[0].powder, 2);
});

test('inventario con niveles distintos: sólo cuentan las bombas que caben en la bandeja', () => {
  const level = { ...grid(['.......', '.G.....']), tray: [2, 2] };
  const objectives = [{ kind: 'destroy', types: ['gem'] }];
  const { bf, sset } = compare(level, objectives);
  assert.ok(sset.size >= bf.solutions.length, 'el oráculo sin fusiones debe estar contenido');
  // Ninguna solución puede usar un nivel que no esté en la bandeja.
  for (const sig of sset) {
    for (const part of sig.split('@')[0].split('+')) {
      const lvl = Number(part.split(':')[1]);
      assert.ok([2, 3].includes(lvl), `nivel ${lvl} inventado en ${sig}`);
    }
  }
});

test('fusiones: el solver y el oráculo enumeran lo mismo al incluir fusiones', () => {
  const level = { ...grid(['.......', '.G.....']), tray: [2, 2] };
  const objectives = [{ kind: 'destroy', types: ['gem'] }];
  const { bf, sv } = compare(level, objectives, { includeFusions: true });
  assert.ok(bf.inventoriesConsidered > 1, 'el oráculo debe haber considerado la fusión 2+2=3');
  assert.ok(sv.solutions.some((s) => s.fusions > 0), 'alguna solución óptima usa fusión');
});

test('mecha en posiciones distintas: cada bomba se prueba como mecha', () => {
  const level = { ...grid(['......', '.C.G.']), tray: [2, 2] };
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ];
  const { sv } = compare(level, objectives, { includeFusions: true });
  // Se comprueba que entre las soluciones hay más de una mecha posible: el
  // solver no se queda con una única colocación de la mecha.
  const mechas = new Set(sv.solutions.map((s) => s.mecha.idx));
  assert.ok(mechas.size >= 1);
  for (const s of sv.solutions) {
    assert.ok(s.placements.some((p) => p.idx === s.mecha.idx), 'la mecha debe ser una bomba colocada');
  }
});

test('cadena con dinamita: la explosión de la dinamita completa el objetivo', () => {
  // Cofre en C2F2 (a 2 casillas de la bomba) y cofre en C9F2, que la bomba no alcanza.
  // La dinamita de C8F2 sí está en el rayo, y su explosión decide.
  const level = { ...grid(['..........', '.C.....DC.']), tray: [3] };
  const board = prepareBoard(level);
  const bomb = 10 + 4; // C5F2, con una N3
  const res = simulate(board, new Map([[bomb, 3]]), bomb, board.rules);
  const verdict = evaluateOutcome(board, res, [{ kind: 'destroy', types: ['chest_wood'], count: 2 }]);
  assert.equal(verdict.win, true,
    `la dinamita debe abrir el cofre lejano: ${JSON.stringify(verdict.checks)}`);
  assert.ok(res.log.some((e) => e.type === 'scheduled-explosion'),
    'la dinamita debe programar su propia explosión');
  assert.equal(res.final.alive[17], 0, 'la dinamita se consume');
});

test('cadena con detonador: el cable detona una carga fuera del alcance de la bomba', () => {
  // Tablero 10x3. Cofre B en C10F2 con un cable desde el detonador de C3F2 hasta la
  // dinamita de C9F2. La bomba (N1) va en C4F2, pegada al detonador.
  // El cable está a 6 casillas de la bomba: sin él, el cofre B nunca caería.
  const cells = [
    ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
    ['empty', 'empty', 'detonator', 'empty', 'empty', 'empty', 'empty', 'empty', 'dynamite', 'chest_wood'],
    ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
  ];
  const level = { cols: 10, rows: 3, cells, links: { '2,1': ['8,1'] }, tray: [1] };
  const board = prepareBoard(level);
  assert.deepEqual([...board.links.entries()], [[12, [18]]],
    `el cable debe quedar registrado ("x,y"): ${JSON.stringify(board.warnings)}`);

  // Caso de control: bomba lejos del detonador → la dinamita no se toca.
  const far = simulate(board, new Map([[25, 1]]), 25, board.rules); // C6F3, lejos
  assert.equal(far.status, 'resolved', `jugada legal: ${far.reason}`);
  assert.equal(far.final.alive[18], 1, 'sin tocar el detonador la dinamita sigue intacta');

  // La bomba pegada al detonador: el cable hace el resto.
  const res = simulate(board, new Map([[13, 1]]), 13, board.rules);
  const verdict = evaluateOutcome(board, res, [{ kind: 'destroy', types: ['chest_wood'], count: 1 }]);
  assert.equal(verdict.win, true, `el cable debe abrir el cofre: ${JSON.stringify(verdict.checks)}`);
  assert.ok(res.log.some((e) => e.type === 'detonator-fired'), 'el detonador debe dispararse');
  assert.equal(res.final.alive[18], 0, 'la dinamita enlazada debe estallar');

  const sv = solve(level, [{ kind: 'destroy', types: ['chest_wood'], count: 1 }], THOROUGH);
  assert.equal(sv.status, 'optimalityProven');
  assert.equal(sv.solutions[0].physicalBombs, 1, 'una sola bomba basta gracias al cable');
});

test('un cable mal escrito no se ignora en silencio (evita falsa imposibilidad)', () => {
  const level = {
    ...grid(['..........', 'C.......C.']),
    links: { '1': ['8'] }, // formato incorrecto: se esperaba "x,y"
    tray: [4],
  };
  const board = prepareBoard(level);
  assert.ok(board.linkErrors.length >= 1, 'el error de formato debe registrarse');
  assert.ok(board.warnings.some((w) => w.kind === 'bad-link'), 'y aparecer en las advertencias');
  const sv = solve(level, [{ kind: 'destroy', types: ['chest_wood'] }], THOROUGH);
  assert.equal(sv.status, 'invalid-level', `no puede declararse imposible: ${sv.status}`);
  assert.match(sv.proofNote, /cable/i);
  assert.equal(sv.optimalityProven, false);
});

test('cadena con magma: la roca de magma estalla en el tick siguiente', () => {
  // Magma en C6F2, bomba N1 en C5F2: la bomba lo activa y el magma estalla después.
  const level = { ...grid(['..........', '.....M.G..']), tray: [1] };
  const board = prepareBoard(level);
  const res = simulate(board, new Map([[idx(4, 1), 1]]), idx(4, 1), board.rules);
  assert.equal(res.status, 'resolved');
  const ticks = res.ticks.filter((t) => !t.idle);
  assert.ok(ticks.some((t) => (t.explosions || []).some((e) => e.kind === 'magma')),
    'el magma debe estallar como explosión propia');
  const magmaTick = ticks.find((t) => (t.explosions || []).some((e) => e.kind === 'magma')).tick;
  assert.ok(magmaTick > 1, 'y debe hacerlo en un tick posterior al de la bomba');
});

test('cadena con géiser: la onda del géiser completa el objetivo', () => {
  const level = { ...grid(['........', '.B.....Y', '.......C']), tray: [1] };
  const objectives = [{ kind: 'destroy', types: ['chest_wood'] }];
  const { bf, sv } = compare(level, objectives, { bfMaxBombs: 1 });
  assert.equal(bf.minimumBombs, 1);
  assert.equal(sv.status, 'optimalityProven');
  assert.equal(sv.solutions[0].physicalBombs, 1);
});

test('objetivo multi-golpe: dos cofres con una sola bomba y alcance suficiente', () => {
  const level = { ...grid(['......', 'C...C.']), tray: [3] };
  const objectives = [{ kind: 'destroy', types: ['chest_wood'], count: 2 }];
  const { sv } = compare(level, objectives, { includeFusions: false });
  assert.equal(sv.solutions[0].physicalBombs, 1);
  assert.ok(sv.solutions[0].destroyed >= 2, 'una sola bomba destruye los dos cofres');
});

test('objetivos compuestos: un obligatorio y una prohibición, con el oráculo de acuerdo', () => {
  const level = { ...grid(['........', '.C..K.G.']), tray: [2, 2] };
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
    { kind: 'noDestroy', types: ['crystal'], negative: true },
  ];
  const { sv } = compare(level, objectives, { includeFusions: true });
  for (const s of sv.solutions) {
    assert.ok(s.checks.filter((c) => !c.optional).every((c) => c.ok));
  }
});

test('imposible por objeto inalcanzable: se declara imposible y se explica por qué', () => {
  // La gema está rodeada de muros: ningún rayo puede llegar.
  const level = { ...grid(['.......', '.###...', '.#G#...', '.###...']), tray: [3, 3] };
  const objectives = [{ kind: 'destroy', types: ['gem'] }];
  const sv = solve(level, objectives, THOROUGH);
  assert.equal(sv.status, 'infeasible');
  assert.equal(sv.solutions.length, 0);
  const text = [sv.note, ...(sv.reasons || [])].filter(Boolean).join(' ');
  assert.match(text, /Ninguna bomba puede alcanzar|inalcanz/i, `explicación esperada, fue: ${text}`);
});

test('imposible por bandeja vacía: se explica y no se simula nada', () => {
  const level = { ...grid(['......', '.C....']), tray: [] };
  const sv = solve(level, [{ kind: 'destroy', types: ['chest_wood'] }], THOROUGH);
  assert.equal(sv.status, 'infeasible');
  assert.match([sv.note, ...(sv.reasons || [])].filter(Boolean).join(' '), /bandeja/i);
});

test('múltiples óptimos: se enumeran todos los distintos, sin duplicar el mismo conjunto', () => {
  const level = { ...grid(['........', '..C.....']), tray: [2] };
  const objectives = [{ kind: 'destroy', types: ['chest_wood'] }];
  const { bf, sv } = compare(level, objectives, { bfMaxBombs: 1, includeFusions: false });
  assert.ok(bf.solutions.length >= 2, 'el tablero debe tener varios óptimos');
  const sigs = sv.solutions.map(solverSignature);
  assert.equal(new Set(sigs).size, sigs.length, 'no debe haber soluciones repetidas');
  for (const s of sv.solutions) assert.equal(s.physicalBombs, sv.solutions[0].physicalBombs);
});

test('dos métricas separadas: mínimo de bombas y mínimo de pólvora no son lo mismo', () => {
  // Tres cofres: C1F2, C4F2 y C7F2. Con la bandeja [3,3,1,1,1] hay dos alternativas
  // honestas y no dominadas: 2 bombas de nivel 3 (10 de pólvora) o 3 bombas de nivel 1
  // (6 de pólvora). Ninguna es mejor en las dos métricas a la vez.
  const level = { ...grid(['........', 'C..C..C.']), tray: [3, 3, 1, 1, 1] };
  const objectives = [{ kind: 'destroy', types: ['chest_wood'], count: 3 }];
  const few = solve(level, objectives, { ...THOROUGH, mode: 'fewest_bombs' });
  const powder = solve(level, objectives, { ...THOROUGH, mode: 'least_powder' });
  const sv = solve(level, objectives, { ...THOROUGH, mode: 'pareto' });

  assert.equal(few.status, 'optimalityProven');
  assert.equal(few.solutions[0].physicalBombs, 2, 'el mínimo de bombas físicas es 2');
  assert.equal(few.solutions[0].powder, 10);
  assert.equal(powder.solutions[0].powder, 6, 'el mínimo de pólvora es 6');
  assert.equal(powder.solutions[0].physicalBombs, 3, 'y eso cuesta 3 bombas físicas');

  const paretoSet = new Set((sv.pareto || []).map((p) => `${p.physicalBombs}:${p.powder}`));
  assert.ok(paretoSet.has('2:10'), `el frente debe contener 2 bombas/10 pólvora: ${[...paretoSet]}`);
  assert.ok(paretoSet.has('3:6'), `y 3 bombas/6 pólvora: ${[...paretoSet]}`);
  assert.equal(paretoSet.size, 2, 'con dos puntos no dominados el frente tiene exactamente 2');

  for (const a of sv.pareto) {
    for (const b of sv.pareto) {
      if (a === b) continue;
      assert.equal(b.physicalBombs <= a.physicalBombs && b.powder <= a.powder, false,
        `${b.physicalBombs}:${b.powder} domina a ${a.physicalBombs}:${a.powder}`);
    }
  }
});

test('timeout: NUNCA declara imposible ni "todas las mínimas"', () => {
  // Tablero grande con mucha bandeja y presupuesto de tiempo mínimo.
  const level = {
    ...grid(['..........', '.C...C...G', '..........', '...C...G..']),
    tray: [1, 1, 2, 2, 3, 3],
  };
  const sv = solve(level, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ], { timeBudgetMs: 0, maxBombs: 4 });
  assert.notEqual(sv.status, 'infeasible', 'un timeout no puede convertirse en "imposible"');
  assert.ok(['timedOut', 'bestKnown', 'unknown'].includes(sv.status), `estado honesto, fue ${sv.status}`);
  if (sv.status === 'timedOut') {
    assert.equal(sv.exhaustive, false, 'no puede declarar búsqueda exhaustiva');
    assert.match(sv.proofNote, /no equivale a "imposible"/i);
  } else {
    // Si llegó a encontrar algo, no puede presentarlo como mínimo demostrado.
    assert.equal(sv.optimalityProven, false);
  }
});

test('cancelación: responde al usuario y no declara imposible', () => {
  const level = { ...grid(['..........', '.C...C...G', '..........']), tray: [1, 2, 3] };
  // Se cancela cuando la búsqueda ya ha empezado a trabajar (no antes de mirar nada).
  let calls = 0;
  const sv = solve(level, [{ kind: 'destroy', types: ['chest_wood'] }], {
    timeBudgetMs: 60000, maxBombs: 3, shouldCancel: () => ++calls > 20,
  });
  assert.ok(calls > 20, 'la comprobación de cancelación debe llegar a ejecutarse');
  assert.notEqual(sv.status, 'infeasible');
  assert.equal(sv.status, 'cancelled', `el estado debe reflejar la cancelación (fue ${sv.status})`);
  assert.equal(sv.exhaustive, false);
  assert.equal(sv.incompleteReason, 'cancelled');
  assert.match(sv.proofNote, /cancelada/i);
});

test('límite de combinaciones: estado unknown con motivo, no imposible', () => {
  const level = { ...grid(['..........', '.C...C...G']), tray: [1, 1, 2, 2, 3] };
  const sv = solve(level, [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ], { maxBombs: 4, comboCap: 3, timeBudgetMs: 60000 });
  assert.equal(sv.status, 'unknown');
  assert.equal(sv.exhaustive, false);
  assert.equal(sv.incompleteReason, 'combination-cap');
  assert.ok(sv.combosSkipped > 0);
  assert.equal(sv.solutions.length, 0);
});

test('equivalencia de permutaciones: el orden de las bombas en la bandeja no cambia nada', () => {
  const a = { ...grid(['........', '.C....G.']), tray: [1, 2] };
  const b = { ...grid(['........', '.C....G.']), tray: [2, 1] };
  const objectives = [
    { kind: 'destroy', types: ['chest_wood'] },
    { kind: 'destroy', types: ['gem'] },
  ];
  const sa = solve(a, objectives, THOROUGH);
  const sb = solve(b, objectives, THOROUGH);
  assert.deepEqual(
    sa.solutions.map(solverSignature).sort(),
    sb.solutions.map(solverSignature).sort(),
    'la bandeja es un multiconjunto: su orden no debe influir',
  );
});

test('la agrupación por firma canónica no borra soluciones físicamente distintas', () => {
  const level = { ...grid(['........', '.C....C.']), tray: [2, 2] };
  const objectives = [{ kind: 'destroy', types: ['chest_wood'] }];
  const sv = solve(level, objectives, THOROUGH);
  // Agrupadas o no, la lista completa debe seguir conteniendo cada colocación distinta.
  const physical = new Set(sv.solutions.map(solverSignature));
  assert.equal(physical.size, sv.solutions.length);
  for (const g of sv.groups) {
    assert.ok(Array.isArray(g.variants), 'cada grupo expone sus variantes');
    for (const sig of g.variants) {
      assert.ok(physical.has(sig), `la agrupación menciona ${sig}, que no está en solutions`);
      assert.ok(sv.solutions.some((s) => s.signature === sig), 'las variantes siguen siendo soluciones presentadas');
    }
  }
});

test('Pareto: ninguna solución listada es dominada por otra', () => {
  const level = { ...grid(['........', '.C....C.']), tray: [1, 2, 3] };
  const objectives = [{ kind: 'destroy', types: ['chest_wood'] }];
  const sv = solve(level, objectives, { ...THOROUGH, mode: 'pareto' });
  const front = sv.pareto || [];
  for (const a of front) {
    for (const b of front) {
      if (a === b) continue;
      const dominated = b.physicalBombs <= a.physicalBombs && b.powder <= a.powder
        && (b.physicalBombs < a.physicalBombs || b.powder < a.powder);
      assert.equal(dominated, false,
        `el frente incluye ${a.physicalBombs}:${a.powder} dominada por ${b.physicalBombs}:${b.powder}`);
    }
  }
  assert.ok(front.length >= 1);
});

test('computePareto funciona sobre soluciones sueltas sin depender del modo', () => {
  const sols = [
    { physicalBombs: 1, powder: 8 },
    { physicalBombs: 2, powder: 6 },
    { physicalBombs: 2, powder: 9 },
    { physicalBombs: 3, powder: 4 },
  ];
  const front = computePareto(sols).map((p) => `${p.physicalBombs}:${p.powder}`);
  assert.deepEqual(front.sort(), ['1:8', '2:6', '3:4'].sort());
});
