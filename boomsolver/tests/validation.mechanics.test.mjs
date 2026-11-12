// ============================================================
// Pruebas de la batería de VALIDACIÓN (portales y géiseres)
// ============================================================
// Estas pruebas NO demuestran que el juego real se comporte así: demuestran que
// el motor hace lo que la especificación dice. Un fallo aquí es, o una
// discrepancia entre motor y especificación, o un caso mal planteado.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runSuite, MECHANIC_STATE } from '../src/validation/harness.js';
import { portalCases } from '../src/validation/cases.portals.js';
import { geyserCases } from '../src/validation/cases.geysers.js';

const describeFailure = (c) => {
  const bad = c.checks.filter((ch) => !ch.pass)
    .map((ch) => `    · ${ch.name}\n      esperado: ${JSON.stringify(ch.expected)}\n      real:     ${JSON.stringify(ch.actual)}`);
  return `\n  ${c.id} — ${c.question}\n${bad.join('\n')}`;
};

for (const [name, cases] of [['portales', portalCases], ['géiseres', geyserCases]]) {
  test(`batería de ${name}: todos los casos declarados se cumplen`, () => {
    const suite = runSuite(cases);
    const failing = suite.failed.map(describeFailure).join('\n');
    assert.equal(suite.failed.length, 0, `casos con discrepancia:${failing}`);
    assert.ok(suite.asserted > 0, 'la batería debe tener casos asertados');
  });

  test(`batería de ${name}: los casos son reproducibles y ejecutan el mismo motor`, () => {
    const a = runSuite(cases);
    const b = runSuite(cases);
    assert.deepEqual(a.results.map((r) => r.actual), b.results.map((r) => r.actual),
      'el mismo tablero debe producir siempre el mismo resultado');
  });

  test(`batería de ${name}: no hay mecánicas marcadas como verificadas sin evidencia humana`, () => {
    // Ningún caso puede auto-declararse 'verified': eso exige observación del juego.
    for (const c of cases) {
      assert.notEqual(c.state, MECHANIC_STATE.VERIFIED,
        `${c.id} se declara verificado sin contraste externo registrado`);
    }
  });

  test(`batería de ${name}: cada caso explica lo que espera`, () => {
    for (const c of cases) {
      assert.ok(c.id && c.question, 'todo caso necesita id y pregunta');
      if (c.observe) continue;
      assert.ok(c.explanation && c.explanation.length > 20,
        `${c.id} no explica el razonamiento del resultado esperado`);
      assert.ok(c.expect && Object.keys(c.expect).length > 0, `${c.id} no declara expectativa`);
    }
  });

  test(`batería de ${name}: los casos abiertos dicen qué observación falta`, () => {
    for (const c of cases) {
      if (c.state === MECHANIC_STATE.UNKNOWN || c.observe) {
        assert.ok(typeof c.evidence === 'string' && c.evidence.length > 20,
          `${c.id} es desconocido y no indica qué prueba hace falta`);
      }
    }
  });
}

test('las preguntas abiertas del encargo están cubiertas por la batería de géiseres', () => {
  // Las 10 preguntas de la fase 2, mapeadas a casos. Si se borra un caso, esto falla.
  const needed = {
    'unidad del temporizador': 'G01',
    'temporizador independiente': 'G03',
    'dos temporizadores distintos': 'G04',
    'géiser ya contando': 'G05',
    'géiser activa géiser': 'G06',
    'onda y obstáculos': 'G07',
    'géiser y portales': 'G08',
    'varias bombas a la vez': 'G09',
    'bomba separada por obstáculo': 'G10',
    'activarse varias veces': 'G11',
  };
  for (const [question, id] of Object.entries(needed)) {
    assert.ok(geyserCases.some((c) => c.id === id), `falta el caso ${id} (${question})`);
  }
});

test('las cuatro direcciones de entrada al portal están cubiertas', () => {
  const ids = ['P01', 'P02', 'P03', 'P04'];
  const suite = runSuite(portalCases.filter((c) => ids.includes(c.id)));
  assert.equal(suite.results.length, 4);
  const dirs = new Set();
  for (const r of suite.results) for (const j of r.actual.jumps) dirs.add(j.dir);
  for (const d of ['left', 'right', 'up', 'down']) {
    assert.ok(dirs.has(d), `no hay ningún salto con dirección ${d}`);
  }
});
