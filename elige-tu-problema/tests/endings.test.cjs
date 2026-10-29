const H = require('./harness.cjs');
const assert = H.assert;

(async () => {
  const { window } = await H.bootDom();
  const ETP = window.ETP;
  const D = ETP.data.dilemmas;
  const E = ETP.data.endings;
  const byId = Object.fromEntries(D.map((d) => [d.id, d]));

  // PRNG reproducible
  let seed = 123456789;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  function simulate(size) {
    const order = [];
    const pool = D.slice();
    for (let i = 0; i < size; i++) {
      order.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
    }
    const attrs = { chaos: 50, luck: 50, prestige: 50, wit: 50, shame: 50, survival: 50 };
    const answers = [];
    for (const id of order) {
      const d = byId[id];
      const key = rand() < 0.5 ? 'a' : 'b';
      Object.keys(d[key].d).forEach((k) => { attrs[k] = Math.max(0, Math.min(100, attrs[k] + d[key].d[k])); });
      answers.push({ id, choice: key });
    }
    return { order, attrs, answers };
  }

  // determinismo: mismo run -> mismo final
  const fixed = simulate(10);
  const a1 = ETP.computeEnding(JSON.parse(JSON.stringify(fixed)));
  const a2 = ETP.computeEnding(JSON.parse(JSON.stringify(fixed)));
  assert.strictEqual(a1.id, a2.id, 'el mismo conjunto de decisiones da el mismo final');

  // sensibilidad: alterar una decisión puede cambiar el final (en una muestra amplia)
  const base = simulate(10);
  const alt = JSON.parse(JSON.stringify(base));
  const changed = alt.answers[0];
  changed.choice = changed.choice === 'a' ? 'b' : 'a';
  // recalcular atributos del cambio simple (no reconstruye todo, sólo comprueba que el motor usa las respuestas)
  let differences = 0;
  for (let i = 0; i < 200; i++) {
    const r = simulate(10);
    const r2 = JSON.parse(JSON.stringify(r));
    r2.attrs = Object.assign({}, r2.attrs);
    const flip = r2.answers[Math.floor(rand() * r2.answers.length)];
    const d = byId[flip.id];
    const other = flip.choice === 'a' ? 'b' : 'a';
    Object.keys(d[other].d).forEach((k) => { r2.attrs[k] = Math.max(0, Math.min(100, r2.attrs[k] + d[other].d[k])); });
    r2.answers = r2.answers.map((a) => a.id === flip.id ? { id: a.id, choice: other } : a);
    const e1 = ETP.computeEnding(r);
    const e2 = ETP.computeEnding(r2);
    if (e1.id !== e2.id) differences++;
  }
  assert(differences > 20, 'cambiar decisiones cambia el final con frecuencia (' + differences + '/200)');
  console.log('   sensibilidad a las decisiones:', differences, '/200 cambios de final');

  // cobertura de finales en 2000 simulaciones
  const counts = {};
  let byMode = { quick: {}, normal: {}, long: {} };
  for (let i = 0; i < 2000; i++) {
    const size = i % 3 === 0 ? 5 : (i % 3 === 1 ? 10 : 20);
    const mode = size === 5 ? 'quick' : (size === 10 ? 'normal' : 'long');
    const run = simulate(size);
    const e = ETP.computeEnding(run);
    counts[e.id] = (counts[e.id] || 0) + 1;
    byMode[mode][e.id] = (byMode[mode][e.id] || 0) + 1;
  }
  const missing = E.filter((e) => !counts[e.id]).map((e) => e.id);
  console.log('   reparto de finales:', JSON.stringify(counts));
  console.log('   sin alcanzar:', missing.length ? missing.join(', ') : 'ninguno');
  assert.strictEqual(missing.length, 0, 'se pueden alcanzar los 10 finales');
  const max = Math.max(...Object.values(counts));
  const min = Math.min(...Object.values(counts));
  assert(max / min < 40, 'ningún final domina de forma absoluta (ratio ' + (max / min).toFixed(1) + ')');
  console.log('   ratio máximo/mínimo:', (max / min).toFixed(1));

  // el final no se asigna al azar: dos partidas con la misma decisión sistemática deben diferir
  const allA = simulate(10);
  allA.attrs = { chaos: 50, luck: 50, prestige: 50, wit: 50, shame: 50, survival: 50 };
  allA.answers = allA.order.map((id) => ({ id, choice: 'a' }));
  allA.order.forEach((id) => {
    const d = byId[id];
    Object.keys(d.a.d).forEach((k) => { allA.attrs[k] = Math.max(0, Math.min(100, allA.attrs[k] + d.a.d[k])); });
  });
  const allB = JSON.parse(JSON.stringify(allA));
  allB.attrs = { chaos: 50, luck: 50, prestige: 50, wit: 50, shame: 50, survival: 50 };
  allB.order.forEach((id) => {
    const d = byId[id];
    Object.keys(d.b.d).forEach((k) => { allB.attrs[k] = Math.max(0, Math.min(100, allB.attrs[k] + d.b.d[k])); });
  });
  allB.answers = allB.order.map((id) => ({ id, choice: 'b' }));
  const ea = ETP.computeEnding(allA);
  const eb = ETP.computeEnding(allB);
  console.log('   todas A ->', ea.name, '| todas B ->', eb.name);
  assert(ea.id !== eb.id, 'elegir siempre A o siempre B lleva a finales distintos');
  console.log('OK endings.test');
})().catch((e) => { console.error(e); process.exit(1); });
