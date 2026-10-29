const H = require('./harness.cjs');
const assert = H.assert;

(async () => {
  // A. almacenamiento bloqueado
  const blocked = await H.bootDom({ blockStorage: true });
  await H.clickStart(blocked.window, blocked.document, 'quick');
  await H.playRun(blocked.window, blocked.document, 5, () => 'a');
  assert(H.visible(blocked.document, 'screen-result'), 'se puede terminar una partida sin localStorage');
  assert.strictEqual(H.state(blocked.window).stats.games, 1, 'las estadísticas viven en memoria');
  assert(/No se puede guardar/.test(blocked.document.querySelector('#toast').textContent), 'avisa de que no se guarda: ' + blocked.document.querySelector('#toast').textContent);
  assert.strictEqual(blocked.errors.length, 0, 'sin errores con localStorage bloqueado: ' + JSON.stringify(blocked.errors));
  console.log('   localStorage bloqueado: juego operativo con aviso');

  // B. datos corruptos
  const corrupt = await H.bootDom({ saved: '{esto no es json' });
  const cs = H.state(corrupt.window);
  assert.strictEqual(cs.stats.games, 0, 'estado limpio tras JSON corrupto');
  assert.strictEqual(corrupt.errors.length, 0, 'sin errores con JSON corrupto');
  await H.clickStart(corrupt.window, corrupt.document, 'quick');
  assert(H.visible(corrupt.document, 'screen-game'), 'se puede jugar tras datos corruptos');
  console.log('   JSON corrupto: se descarta sin romper');

  // C. estado con tipos inválidos y partida imposible
  const messy = JSON.stringify({
    v: 1,
    stats: { games: 'muchas', answers: -4, ends: { genio: 'x', inventado: 3 }, cats: { caos: 'dos', nope: 1 }, bestStreak: null, dailies: undefined },
    history: [{ endingId: 'inexistente' }, null, 'texto'],
    daily: { lastKey: 'ayer' },
    run: { mode: 'turbo', order: ['d01', 'd99'], idx: 9, answers: [], attrs: {} }
  });
  const messyDom = await H.bootDom({ saved: messy });
  const ms = H.state(messyDom.window);
  assert.strictEqual(ms.stats.games, 0, 'games inválido saneado');
  assert.strictEqual(ms.stats.answers, 0, 'answers negativo saneado');
  assert.strictEqual(Object.keys(ms.stats.ends).length, 0, 'finales inválidos descartados');
  assert.strictEqual(ms.run, null, 'partida imposible descartada');
  assert.strictEqual(ms.history.length, 0, 'historial inválido descartado');
  assert.strictEqual(messyDom.errors.length, 0, 'sin errores con estado inválido');
  console.log('   estado inválido: saneado sin errores');

  // D. estado parcialmente válido: conserva lo bueno, descarta la partida rota
  const partial = JSON.stringify({
    v: 1,
    stats: { games: 3, answers: 30, ends: { leyenda: 2 }, cats: { caos: 10 }, bestStreak: 5, dailies: 1 },
    history: [{ date: '2026-10-20T10:00:00.000Z', mode: 'normal', endingId: 'leyenda', attrs: { chaos: 90, luck: 40, prestige: 60, wit: 50, shame: 70, survival: 45 }, total: 10 }],
    daily: { lastKey: '2026-10-20' },
    run: { mode: 'normal', order: ['d01'], idx: 0, answers: [{ id: 'd01', choice: 'z' }] }
  });
  const partialDom = await H.bootDom({ saved: partial });
  const ps = H.state(partialDom.window);
  assert.strictEqual(ps.stats.games, 3, 'estadísticas válidas conservadas');
  assert.strictEqual(ps.stats.ends.leyenda, 2, 'finales válidos conservados');
  assert.strictEqual(ps.history.length, 1, 'historial válido conservado');
  assert.strictEqual(ps.daily.lastKey, '2026-10-20', 'fecha diaria válida conservada');
  console.log('   estado parcialmente válido: conserva lo correcto');

  // E. guardar la partida y retomarla en una nueva carga
  const first = await H.bootDom({ fixedDate: '2026-10-29T09:00:00' });
  await H.clickStart(first.window, first.document, 'normal');
  for (let i = 0; i < 3; i++) { await H.answer(first.window, first.document, i % 2 ? 'a' : 'b'); await H.nextBtn(first.window, first.document); }
  await H.answer(first.window, first.document, 'b'); // decisión 4 sin pasar de pantalla
  const snapshot = H.stored(first.window);
  assert(snapshot, 'hay datos guardados');
  const beforeState = H.state(first.window);

  const resumed = await H.bootDom({ saved: snapshot, fixedDate: '2026-10-29T09:05:00' });
  assert(!resumed.document.querySelector('#resume-slot').hidden, 'el inicio ofrece continuar la partida');
  const cont = Array.from(resumed.document.querySelectorAll('#resume-slot button')).find((b) => /Continuar/.test(b.textContent));
  cont.click();
  await H.tick(20);
  assert(H.visible(resumed.document, 'screen-game'), 'vuelve a la pantalla de juego');
  assert.strictEqual(H.state(resumed.window).run.answers.length, 4, 'las decisiones se conservan');
  assert(resumed.document.querySelector('#next-btn'), 'se restaura la consecuencia pendiente de continuar');
  const before = H.state(resumed.window).run;
  await H.nextBtn(resumed.window, resumed.document);
  const after = H.state(resumed.window).run;
  assert.strictEqual(after.idx, before.idx + 1, 'continúa en el dilema siguiente sin duplicar');
  assert.strictEqual(after.answers.length, 4, 'no se duplican respuestas al retomar');
  assert.strictEqual(after.id, beforeState.run.id, 'misma partida restaurada');
  console.log('   guardado y restauración de partida OK');

  // F. resultado persistente sin doble contabilización
  await H.playRun(resumed.window, resumed.document, 6, () => 'a');
  assert(H.visible(resumed.document, 'screen-result'), 'termina la partida restaurada');
  const finished = H.stored(resumed.window);
  const finishedState = H.state(resumed.window);
  const reloaded = await H.bootDom({ saved: finished });
  reloaded.window.location.hash = '#resultado';
  await H.tick(40);
  assert(H.visible(reloaded.document, 'screen-result'), 'el resultado se recupera al recargar');
  assert.strictEqual(reloaded.document.querySelector('#result-title').textContent,
    resumed.document.querySelector('#result-title').textContent, 'mismo final tras recargar');
  assert.strictEqual(H.state(reloaded.window).stats.games, finishedState.stats.games, 'no se cuenta dos veces la partida');
  console.log('   resultado persistente sin duplicar estadísticas');

  // G. reinicio con confirmación
  reloaded.document.querySelector('.nav-link[data-go="coleccion"]').click();
  await H.tick(20);
  reloaded.document.querySelector('[data-action="reset-progress"]').click();
  await H.tick(20);
  assert(reloaded.document.querySelector('.modal'), 'pide confirmación antes de borrar');
  const cancel = Array.from(reloaded.document.querySelectorAll('.modal .btn')).find((b) => /Cancelar/.test(b.textContent));
  cancel.click();
  await H.tick(20);
  assert.strictEqual(H.state(reloaded.window).stats.games, finishedState.stats.games, 'cancelar no borra nada');
  reloaded.document.querySelector('[data-action="reset-progress"]').click();
  await H.tick(20);
  const confirm = Array.from(reloaded.document.querySelectorAll('.modal .btn')).find((b) => /borrar todo/.test(b.textContent));
  confirm.click();
  await H.tick(30);
  const cleared = H.state(reloaded.window);
  assert.strictEqual(cleared.stats.games, 0, 'borrar reinicia las partidas');
  assert.strictEqual(Object.keys(cleared.stats.ends).length, 0, 'borrar reinicia los finales');
  assert.strictEqual(cleared.history.length, 0, 'borrar reinicia el historial');
  assert.strictEqual(cleared.run, null, 'borrar elimina la partida en curso');
  assert(H.visible(reloaded.document, 'screen-home'), 'vuelve al inicio tras borrar');
  console.log('   reinicio con confirmación OK');

  // H. compartir sin soporte nativo (mensajes honestos, sin excepciones)
  const share = await H.bootDom();
  await H.clickStart(share.window, share.document, 'quick');
  await H.playRun(share.window, share.document, 5, () => 'b');
  const note = share.document.querySelector('#share-note');
  share.document.querySelector('[data-action="copy"]').click();
  await H.tick(40);
  assert(note.textContent.length > 0, 'mensaje tras copiar');
  assert(/No se pudo copiar|copiado/i.test(note.textContent), 'mensaje honesto al copiar: ' + note.textContent);
  share.document.querySelector('[data-action="download-card"]').click();
  await H.tick(40);
  assert(/tarjeta|imagen|captura/i.test(note.textContent), 'mensaje honesto al descargar sin canvas: ' + note.textContent);
  share.document.querySelector('[data-action="share"]').click();
  await H.tick(60);
  assert(note.textContent.length > 0, 'mensaje tras intentar compartir');
  assert(!/Compartido\./.test(note.textContent), 'no afirma haber compartido sin éxito: ' + note.textContent);

  // H2. menú nativo disponible y cancelado
  share.window.navigator.share = () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' }));
  share.document.querySelector('[data-action="share"]').click();
  await H.tick(80);
  assert(/cancelada|No se pudo/i.test(note.textContent), 'informa de la cancelación: ' + note.textContent);

  // H3. menú nativo que falla de verdad -> copia de respaldo
  share.window.navigator.share = () => Promise.reject(new Error('boom'));
  share.document.querySelector('[data-action="share"]').click();
  await H.tick(80);
  assert(/No se pudo|portapapeles/i.test(note.textContent), 'respaldo honesto tras fallo: ' + note.textContent);
  assert.strictEqual(share.errors.length, 0, 'sin errores al compartir: ' + JSON.stringify(share.errors));
  console.log('   compartir: mensajes honestos y sin excepciones');

  // I. navegación completa y hash
  const nav = await H.bootDom();
  for (const [page, screen] of [['coleccion', 'screen-collection'], ['acerca', 'screen-about'], ['privacidad', 'screen-privacy'], ['contacto', 'screen-contact'], ['inicio', 'screen-home']]) {
    nav.document.querySelector('.nav-link[data-go="' + page + '"]').click();
    await H.tick(15);
    assert(H.visible(nav.document, screen), 'navega a ' + page);
    assert(nav.window.location.hash === '#' + page, 'hash actualizado a ' + page);
    assert.strictEqual(nav.document.querySelector('.nav-link[aria-current="page"]').getAttribute('data-go'), page, 'nav activa marcada en ' + page);
  }
  nav.window.location.hash = '#resultado';
  await H.tick(30);
  assert(H.visible(nav.document, 'screen-home'), 'sin resultado no muestra pantalla de resultado');
  nav.window.location.hash = '#pantalla-inventada';
  await H.tick(30);
  assert(H.visible(nav.document, 'screen-home'), 'hash desconocido lleva al inicio');
  assert.strictEqual(nav.errors.length, 0, 'sin errores de navegación');
  console.log('   navegación y hash OK');

  // J. salir de una partida sin terminar no rompe estadísticas
  const quit = await H.bootDom();
  await H.clickStart(quit.window, quit.document, 'normal');
  await H.answer(quit.window, quit.document, 'a');
  quit.document.querySelector('[data-action="quit"]').click();
  await H.tick(15);
  const discard = Array.from(quit.document.querySelectorAll('.modal .btn')).find((b) => /Descartar/.test(b.textContent));
  discard.click();
  await H.tick(20);
  const qs = H.state(quit.window);
  assert.strictEqual(qs.run, null, 'partida descartada');
  assert.strictEqual(qs.stats.games, 0, 'no cuenta como partida completada');
  assert.strictEqual(qs.stats.answers, 1, 'sí cuenta el dilema respondido');
  console.log('   descartar partida OK');

  const allErrors = [].concat(blocked.errors, corrupt.errors, messyDom.errors, partialDom.errors, first.errors, resumed.errors, reloaded.errors, share.errors, nav.errors, quit.errors);
  assert.strictEqual(allErrors.length, 0, 'sin errores de consola en toda la batería: ' + JSON.stringify(allErrors));
  console.log('OK robustness.test');
})().catch((e) => { console.error(e); process.exit(1); });
