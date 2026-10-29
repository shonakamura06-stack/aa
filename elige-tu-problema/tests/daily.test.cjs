const H = require('./harness.cjs');
const assert = H.assert;

(async () => {
  // Mismo día, historial distinto -> misma secuencia
  const day = '2026-10-29T10:00:00';
  const a = await H.bootDom({ fixedDate: day });
  await H.clickStart(a.window, a.document, 'daily');
  const orderA = JSON.parse(JSON.stringify(H.state(a.window).run.order));

  const preloaded = JSON.stringify({
    v: 1,
    stats: { games: 9, answers: 90, ends: { genio: 4 }, cats: { caos: 20 }, bestStreak: 7, dailies: 2 },
    history: [{ date: '2026-10-01T10:00:00.000Z', mode: 'normal', endingId: 'genio', attrs: { chaos: 80, luck: 20, prestige: 40, wit: 90, shame: 70, survival: 50 }, total: 10 }],
    daily: { lastKey: '2026-10-28' },
    run: null
  });
  const b = await H.bootDom({ fixedDate: day, saved: preloaded });
  await H.clickStart(b.window, b.document, 'daily');
  const orderB = JSON.parse(JSON.stringify(H.state(b.window).run.order));
  assert.strictEqual(JSON.stringify(orderB), JSON.stringify(orderA), 'la secuencia diaria no depende del historial');
  assert.strictEqual(orderA.length, 10, 'el reto del día tiene 10 dilemas');
  assert.strictEqual(new Set(orderA).size, 10, 'sin dilemas repetidos en el reto');
  console.log('   secuencia diaria estable y determinista');

  // Otro día -> otra secuencia
  const c = await H.bootDom({ fixedDate: '2026-10-30T10:00:00' });
  await H.clickStart(c.window, c.document, 'daily');
  const orderC = JSON.parse(JSON.stringify(H.state(c.window).run.order));
  assert.notStrictEqual(JSON.stringify(orderC), JSON.stringify(orderA), 'otro día genera otra secuencia');
  console.log('   secuencia distinta al cambiar de día');

  // Completar el reto del día
  await H.playRun(a.window, a.document, 10, (i) => (i % 2 ? 'a' : 'b'));
  const aState = H.state(a.window);
  assert.strictEqual(aState.stats.games, 1, 'el reto cuenta como partida');
  assert.strictEqual(aState.stats.dailies, 1, 'contador de retos del día');
  assert.strictEqual(aState.daily.lastKey, '2026-10-29', 'fecha del reto guardada con fecha local');
  a.document.querySelector('.nav-link[data-go="inicio"]').click();
  await H.tick(15);
  assert(/Completado hoy/.test(a.document.querySelector('#daily-state').textContent), 'el inicio indica que el reto está completado');

  // Se puede repetir el mismo día
  await H.clickStart(a.window, a.document, 'daily');
  assert.strictEqual(aState.stats.games, 1, 'estado previo intacto antes de terminar');
  assert.strictEqual(H.state(a.window).run.order.length, 10, 'se puede repetir el reto del día');
  const errs = [].concat(a.errors, b.errors, c.errors);
  assert.strictEqual(errs.length, 0, 'sin errores de consola: ' + JSON.stringify(errs));
  console.log('OK daily.test');
})().catch((e) => { console.error(e); process.exit(1); });
