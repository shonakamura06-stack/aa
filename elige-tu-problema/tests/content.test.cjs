const { bootDom, assert } = require('./harness.cjs');

(async () => {
  const { window, errors, warnings } = await bootDom();
  const ETP = window.ETP;
  const problems = ETP.validateContent();
  assert.strictEqual(problems.length, 0, 'validateContent no debe reportar problemas: ' + JSON.stringify(Array.from(problems)));

  const D = ETP.data.dilemmas;
  const E = ETP.data.endings;
  const C = ETP.data.categories;
  assert(D.length >= 60, 'hay al menos 60 dilemas (hay ' + D.length + ')');
  console.log('   dilemas:', D.length, '| finales:', E.length, '| categorías:', Object.keys(C).length);

  // ids únicos y bien formados
  const ids = new Set();
  for (const d of D) {
    assert(/^d\d{2}$/.test(d.id), 'id con formato dNN: ' + d.id);
    assert(!ids.has(d.id), 'id único: ' + d.id);
    ids.add(d.id);
  }

  // categorías y equilibrio
  const perCat = {};
  D.forEach((d) => { perCat[d.cat] = (perCat[d.cat] || 0) + 1; });
  for (const cat of Object.keys(C)) {
    assert(perCat[cat] >= 5, 'categoría ' + cat + ' con contenido suficiente (tiene ' + (perCat[cat] || 0) + ')');
  }
  console.log('   reparto por categoría:', JSON.stringify(perCat));

  // absurdo variado en los tres niveles
  const abs = { 1: 0, 2: 0, 3: 0 };
  D.forEach((d) => { abs[d.abs] = (abs[d.abs] || 0) + 1; });
  assert(abs[1] >= 8 && abs[2] >= 8 && abs[3] >= 8, 'los tres niveles de absurdo están representados: ' + JSON.stringify(abs));
  console.log('   niveles de absurdo:', JSON.stringify(abs));

  // opciones completas, distintas y con consecuencias propias
  const textSeen = new Set();
  const consSeen = new Set();
  let minT = 999, minC = 999;
  for (const d of D) {
    assert(d.a && d.b, d.id + ' tiene dos opciones');
    assert(d.a.t !== d.b.t, d.id + ' las opciones son distintas');
    for (const k of ['a', 'b']) {
      const o = d[k];
      assert(o.t.length >= 25, d.id + '.' + k + ' texto de opción suficientemente desarrollado');
      assert(o.c.title.length >= 5, d.id + '.' + k + ' consecuencia con titular');
      assert(o.c.text.length >= 90, d.id + '.' + k + ' consecuencia suficientemente desarrollada');
      assert(!textSeen.has(o.t), 'texto de opción no repetido: ' + o.t.slice(0, 40));
      textSeen.add(o.t);
      assert(!consSeen.has(o.c.text), 'consecuencia no repetida: ' + o.c.text.slice(0, 40));
      consSeen.add(o.c.text);
      minT = Math.min(minT, o.t.length);
      minC = Math.min(minC, o.c.text.length);
      const keys = Object.keys(o.d);
      assert(keys.length >= 2, d.id + '.' + k + ' modifica al menos dos atributos');
      assert(ETP.data.attrs && Object.keys(ETP.data.attrs).every((x) => true));
      for (const key of keys) {
        assert(Object.prototype.hasOwnProperty.call(ETP.data.attrs, key), d.id + '.' + k + ' atributo válido (' + key + ')');
        assert(Number.isFinite(o.d[key]) && o.d[key] !== 0, d.id + '.' + k + ' delta numérico distinto de cero (' + key + ')');
        assert(Math.abs(o.d[key]) <= 20, d.id + '.' + k + ' delta razonable (' + key + '=' + o.d[key] + ')');
      }
    }
  }
  console.log('   longitud mínima opción/consecuencia:', minT + '/' + minC, 'caracteres');

  // los 10 finales son distintos y tienen todo
  const names = new Set();
  const ids2 = new Set();
  for (const e of E) {
    assert(!names.has(e.name), 'nombre de final único: ' + e.name);
    assert(!ids2.has(e.id), 'id de final único: ' + e.id);
    names.add(e.name); ids2.add(e.id);
    assert(e.quotes.length >= 3, e.id + ' tiene varias frases de compartir');
    assert(e.tagline && e.desc && e.desc.length > 80, e.id + ' descripción desarrollada');
    assert(Object.keys(e.weights).length >= 2, e.id + ' pesos suficientes');
    assert(Object.keys(e.cats).length >= 1, e.id + ' afinidad de categorías');
  }
  assert.strictEqual(E.length, 10, 'hay 10 finales');

  // comprobación de contenido seguro (sin términos problemáticos)
  const banned = [/\bsexo\b/i, /\bporno/i, /\bsangre\b/i, /\bmatar\b/i, /\bsuicid/i, /\bdroga/i, /\barma de fuego\b/i];
  for (const d of D) {
    const all = [d.a.t, d.a.c.title, d.a.c.text, d.b.t, d.b.c.title, d.b.c.text].join(' ');
    for (const rx of banned) assert(!rx.test(all), 'sin término problemático ' + rx + ' en ' + d.id);
  }

  // sin recursos externos en el marcado (salvo enlaces de texto y la config publicitaria)
  const html = require('./harness.cjs').HTML;
  const externalScripts = (html.match(/<script[^>]+src=/gi) || []).length;
  const imports = (html.match(/@import/gi) || []).length;
  const srcAttrs = (html.match(/\ssrc="(https?:)?\/\//gi) || []).length;
  assert.strictEqual(externalScripts, 0, 'ningún script externo en el HTML');
  assert.strictEqual(imports, 0, 'ninguna importación CSS externa');
  assert.strictEqual(srcAttrs, 0, 'ningún recurso remoto con src');
  assert(/<html lang="es">/.test(html), 'idioma declarado');
  assert(/name="viewport"[^>]+width=device-width/.test(html), 'viewport adaptable');
  assert((html.match(/<h1/g) || []).length === 1, 'un único h1');

  assert.strictEqual(errors.length, 0, 'sin errores de consola en el arranque: ' + JSON.stringify(errors));
  console.log('   avisos de jsdom (no del juego):', warnings.filter((w) => w !== 'css-parse').length);
  console.log('OK content.test');
})();
