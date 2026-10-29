const H = require('./harness.cjs');
const assert = H.assert;

(async () => {
  const { window, document, errors } = await H.bootDom();
  const ETP = window.ETP;
  const D = ETP.data.dilemmas;
  const byId = Object.fromEntries(D.map((d) => [d.id, d]));

  // 1. inicio
  assert(H.visible(document, 'screen-home'), 'inicio visible');
  assert(!H.visible(document, 'screen-game'), 'juego oculto al inicio');
  assert(/ELIGE TU PROBLEMA/i.test(document.title), 'título del documento');
  assert(document.querySelectorAll('.mode-card').length === 3, 'tres modalidades en el inicio');
  assert(document.querySelectorAll('[data-action="start"]').length >= 3, 'botones de inicio');
  console.log('   inicio OK');

  // 2. iniciar partida normal
  await H.clickStart(window, document, 'normal');
  assert(H.visible(document, 'screen-game'), 'pantalla de juego visible');
  assert(!H.visible(document, 'screen-home'), 'inicio oculto durante la partida');
  let st = H.state(window);
  assert(st.run && st.run.mode === 'normal', 'partida normal creada');
  assert(st.run.order.length === 10, '10 dilemas en partida normal');
  assert(new Set(st.run.order).size === 10, 'sin dilemas repetidos en la partida');
  assert(document.querySelectorAll('#options .opt').length === 2, 'dos opciones visibles');
  assert(document.querySelectorAll('#attrs-grid .attr').length === 6, 'seis atributos visibles');
  assert(/Dilema 1 de 10/.test(document.querySelector('#game-count').textContent), 'contador del primer dilema');
  assert(document.querySelector('#progress-fill').style.width === '0%', 'progreso al 0%');
  const firstId = st.run.order[0];
  const firstD = byId[firstId];
  assert(document.querySelector('#q-cat').textContent.includes(ETP.data.categories[firstD.cat].name), 'categoría mostrada');
  console.log('   primer dilema OK:', firstId, firstD.cat);

  // 3. elegir A
  const before = st.run.attrs;
  const cons = await H.answer(window, document, 'a');
  assert(cons, 'aparece la consecuencia');
  st = H.state(window);
  assert.strictEqual(st.run.answers.length, 1, 'una única respuesta registrada');
  assert.strictEqual(st.run.idx, 0, 'el índice no avanza hasta pulsar siguiente');
  assert(cons.textContent.includes(firstD.a.c.title), 'titular de la consecuencia correcta');
  assert(cons.textContent.includes(firstD.a.c.text), 'texto de la consecuencia correcta');
  assert(!H.visible(document, 'screen-home'), 'sigue en el juego');
  const expected = Object.assign({}, before);
  Object.keys(firstD.a.d).forEach((k) => { expected[k] = Math.max(0, Math.min(100, expected[k] + firstD.a.d[k])); });
  Object.keys(expected).forEach((k) => {
    assert.strictEqual(st.run.attrs[k], expected[k], 'atributo ' + k + ' actualizado a ' + expected[k]);
  });
  const chips = cons.querySelectorAll('.delta');
  assert.strictEqual(chips.length, Object.keys(firstD.a.d).length, 'un chip por atributo modificado');
  console.log('   consecuencia y atributos OK');

  // 4. siguiente dilema
  await H.nextBtn(window, document);
  st = H.state(window);
  assert.strictEqual(st.run.idx, 1, 'avanza al dilema 2');
  assert(document.querySelectorAll('#options .opt').length === 2, 'nuevas opciones');
  assert(!H.visible(document, 'consequence-area'), 'consecuencia oculta en el dilema nuevo');
  assert(/Dilema 2 de 10/.test(document.querySelector('#game-count').textContent), 'contador actualizado');
  assert(document.querySelector('#progress-fill').style.width === '10%', 'progreso al 10%');

  // 5. doble clic en una opción: sólo una decisión
  const opt = document.querySelector('#options [data-choice="b"]');
  opt.click(); opt.click(); opt.click();
  await H.tick(30);
  st = H.state(window);
  assert.strictEqual(st.run.answers.length, 2, 'tres clics seguidos registran una sola decisión');
  // 6. doble clic en siguiente: sólo un avance
  const nb = document.querySelector('#next-btn');
  nb.click(); nb.click(); nb.click();
  await H.tick(20);
  st = H.state(window);
  assert.strictEqual(st.run.idx, 2, 'tres clics en siguiente avanzan un único dilema');
  console.log('   protección de doble clic OK');

  // 7. terminar la partida
  for (let i = 2; i < 10; i++) {
    await H.answer(window, document, i % 2 ? 'a' : 'b');
    await H.nextBtn(window, document);
  }
  assert(H.visible(document, 'screen-result'), 'pantalla de resultado visible');
  st = H.state(window);
  assert(st.run.completed === true, 'partida marcada como completada');
  assert.strictEqual(st.stats.games, 1, 'estadística de partidas = 1');
  assert.strictEqual(st.history.length, 1, 'historial con una partida');
  assert.strictEqual(st.run.answers.length, 10, 'diez decisiones guardadas');
  const endingIds = ETP.data.endings.map((e) => e.id);
  assert(endingIds.includes(st.run.endingId), 'final válido: ' + st.run.endingId);
  assert.strictEqual(st.stats.ends[st.run.endingId], 1, 'final registrado en la colección');
  const title = document.querySelector('#result-title').textContent;
  const ending = ETP.data.endings.find((e) => e.id === st.run.endingId);
  assert.strictEqual(title, ending.name, 'nombre del final mostrado');
  assert(document.querySelectorAll('#result-stats .stat').length === 6, 'seis estadísticas en el resultado');
  assert(document.querySelectorAll('#result-attrs .attr').length === 6, 'atributos finales visibles');
  assert(document.querySelector('#result-quote').textContent.length > 20, 'frase cómica presente');
  console.log('   resultado OK:', ending.name, '| atributos:', JSON.stringify(st.run.attrs));

  // 8. colección
  document.querySelector('.nav-link[data-go="coleccion"]').click();
  await H.tick(15);
  assert(H.visible(document, 'screen-collection'), 'colección visible');
  assert(document.querySelectorAll('#col-ends .end-card').length === 10, 'diez finales en la colección');
  assert(document.querySelectorAll('#col-ends .end-card.unlocked').length === 1, 'un final descubierto');
  assert(document.querySelectorAll('#col-cats .chip').length === 10, 'diez categorías');
  assert(document.querySelectorAll('#col-history li').length === 1, 'historial visible');
  assert(document.querySelector('#col-stats').textContent.includes('1'), 'estadísticas de colección');
  console.log('   colección OK');

  // 9. volver a jugar conserva la colección
  await H.clickStart(window, document, 'quick');
  st = H.state(window);
  assert.strictEqual(st.run.order.length, 5, 'partida rápida de 5 dilemas');
  await H.playRun(window, document, 5, () => 'b');
  st = H.state(window);
  assert.strictEqual(st.stats.games, 2, 'segunda partida contabilizada');
  assert.strictEqual(st.history.length, 2, 'historial con dos partidas');
  assert(H.visible(document, 'screen-result'), 'resultado de la segunda partida');
  console.log('   segunda partida OK');

  // 10. partida larga
  document.querySelector('.nav-link[data-go="inicio"]').click();
  await H.tick(10);
  await H.clickStart(window, document, 'long');
  st = H.state(window);
  assert.strictEqual(st.run.order.length, 20, 'partida larga de 20 dilemas');
  assert.strictEqual(new Set(st.run.order).size, 20, 'sin repeticiones en 20 dilemas');

  // 11. salir guardando y continuar
  document.querySelector('[data-action="quit"]').click();
  await H.tick(10);
  assert(document.querySelector('.modal'), 'modal de salida visible');
  const saveBtn = Array.from(document.querySelectorAll('.modal .btn')).find((b) => /Guardar y salir/.test(b.textContent));
  assert(saveBtn, 'existe botón de guardar y salir');
  saveBtn.click();
  await H.tick(10);
  assert(H.visible(document, 'screen-home'), 'vuelve al inicio');
  assert(document.querySelector('#resume-slot').hidden === false, 'aviso de partida en curso');
  const cont = Array.from(document.querySelectorAll('#resume-slot button')).find((b) => /Continuar/.test(b.textContent));
  assert(cont, 'botón continuar partida');
  cont.click();
  await H.tick(12);
  assert(H.visible(document, 'screen-game'), 'continúa la partida guardada');
  assert.strictEqual(H.state(window).run.idx, 0, 'mantiene el dilema pendiente');

  // 12. teclado 1/2
  document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1', bubbles: true }));
  await H.tick(25);
  assert.strictEqual(H.state(window).run.answers.length, 1, 'tecla 1 elige la opción A');
  await H.nextBtn(window, document);
  document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true }));
  await H.tick(25);
  assert.strictEqual(H.state(window).run.answers.length, 2, 'tecla B elige la opción B');
  const idxBeforeEnter = H.state(window).run.idx;
  document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await H.tick(20);
  assert.strictEqual(H.state(window).run.idx, idxBeforeEnter + 1, 'Enter avanza tras la consecuencia');
  console.log('   teclado OK');

  assert.strictEqual(errors.length, 0, 'sin errores de consola durante todo el flujo: ' + JSON.stringify(errors));
  console.log('OK flow.test');
})().catch((e) => { console.error(e); process.exit(1); });
