const H = require('./harness.cjs');
const assert = H.assert;
const fs = require('fs');

(async () => {
  const html = H.HTML;
  const { window, document } = await H.bootDom();
  const ETP = window.ETP;

  // ids de HTML únicos
  const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.strictEqual(dup.length, 0, 'ids HTML únicos: ' + dup.join(','));

  // acciones y navegación declaradas
  const actions = new Set(['start', 'share', 'copy', 'download-card', 'replay', 'quit', 'reset-progress']);
  document.querySelectorAll('[data-action]').forEach((el) => {
    assert(actions.has(el.getAttribute('data-action')), 'acción conocida: ' + el.getAttribute('data-action'));
  });
  const pages = new Set(['inicio', 'coleccion', 'acerca', 'privacidad', 'contacto']);
  document.querySelectorAll('[data-go]').forEach((el) => {
    assert(pages.has(el.getAttribute('data-go')), 'destino conocido: ' + el.getAttribute('data-go'));
  });

  // todo botón tiene nombre accesible y no está vacío
  document.querySelectorAll('button').forEach((b) => {
    const text = (b.textContent || '').trim();
    const label = b.getAttribute('aria-label') || '';
    assert(text.length > 0 || label.length > 0, 'botón con nombre accesible: ' + b.outerHTML.slice(0, 90));
  });

  // enlaces con destino real
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    assert(!href.startsWith('#') || document.getElementById(href.slice(1)) || pages.has(href.slice(1)), 'ancla interna válida: ' + href);
    if (/^https?:/.test(href)) assert(/^https:\/\//.test(href), 'enlace externo seguro (https): ' + href);
  });

  // no hay formularios ni campos que simulen enviar datos
  assert.strictEqual(document.querySelectorAll('form, input, textarea, select').length, 0, 'sin formularios ni campos de entrada');

  // publicidad: estructura presente, sin anuncios reales
  const adsScript = document.querySelector('script[src*="adsbygoogle"], script[data-etp-ads]');
  assert(!adsScript, 'no se carga ningún script publicitario');
  assert.strictEqual(document.querySelectorAll('ins.adsbygoogle').length, 0, 'no hay bloques de anuncio reales');
  const adBoxes = document.querySelectorAll('.ad-box');
  assert(adBoxes.length >= 3, 'tres espacios reservados (izquierda, derecha, móvil)');
  adBoxes.forEach((box) => {
    assert(/Espacio publicitario/i.test(box.textContent), 'espacio identificado como publicitario');
    assert(/Sin anuncios activos/i.test(box.textContent), 'espacio declarado inactivo');
  });
  assert.strictEqual(ETP.config.ads.enabled, false, 'publicidad desactivada por defecto');
  assert.strictEqual(ETP.config.ads.client, '', 'sin identificador de editor inventado');
  assert(/no muestra anuncios/i.test(document.querySelector('#foot-ads').textContent), 'el pie informa de que no hay anuncios');
  assert(!document.querySelector('.ad-box[style*="position:fixed"]'), 'los espacios publicitarios no son flotantes');

  // privacidad y transparencia
  const priv = document.querySelector('#screen-privacy').textContent;
  assert(/localStorage/i.test(priv), 'la privacidad explica el almacenamiento local');
  assert(/sin anuncios/i.test(priv), 'la privacidad declara el estado publicitario');
  assert(/etp:v1/.test(priv), 'la privacidad indica la clave usada');
  const contact = document.querySelector('#screen-contact').textContent;
  assert(/Pendiente/i.test(contact), 'el contacto marca lo pendiente sin inventar datos');
  assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(contact), 'no hay correos inventados en contacto');
  assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(priv), 'no hay correos inventados en privacidad');

  // sin datos personales en el arranque
  const st = ETP.getState();
  assert.strictEqual(JSON.stringify(st).match(/@/), null, 'el estado guardado no contiene correos');

  // CSS adaptable y accesibilidad
  assert(/@media\s*\(max-width:720px\)/.test(html), 'hay adaptación a móvil (720px)');
  assert(/@media\s*\(max-width:1180px\)/.test(html), 'hay adaptación de escritorio a tablet (1180px)');
  assert(/prefers-reduced-motion/.test(html), 'respeta el movimiento reducido');
  assert(/overflow-x:hidden/.test(html), 'evita desplazamiento horizontal accidental');
  assert(/min-height:52px/.test(html), 'botones con área táctil suficiente');
  assert(/\.opt\{[^}]*min-height:210px/.test(html), 'tarjetas de opción amplias');
  assert(/focus-visible/.test(html), 'estilos de foco visibles');
  assert(/skip-link/.test(html), 'enlace para saltar al contenido');
  assert(/aria-live/.test(html), 'regiones en vivo para lectores de pantalla');
  assert(/role="progressbar"/.test(html), 'barra de progreso accesible');

  // recursos: solo dos URL externas previstas (enlace de issues y script de AdSense sin cargar)
  const urls = Array.from(new Set((html.match(/https?:\/\/[^\s"'<>)]+/g) || [])));
  console.log('   URLs en el archivo:', urls.length);
  urls.forEach((u) => console.log('     -', u));
  const allowed = [
    'http://www.w3.org/2000/svg',                                     // espacio de nombres SVG (no es una petición)
    'https://github.com/shonakamura06-stack/aa/issues',               // canal de contacto real
    'https://tudominio.com',                                          // ejemplo en un comentario de configuración
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'  // script publicitario, no cargado
  ];
  const external = urls.filter((u) => !allowed.some((a) => u.startsWith(a)));
  assert.strictEqual(external.length, 0, 'sin dependencias remotas inesperadas');
  assert(!/fonts\.googleapis|cdn\.|unpkg|jsdelivr/.test(html), 'sin CDN ni fuentes externas');

  // tamaño del archivo y ausencia de dependencias obvias
  const bytes = Buffer.byteLength(html, 'utf8');
  console.log('   tamaño de index.html:', (bytes / 1024).toFixed(1), 'KB');
  assert(bytes < 400 * 1024, 'página ligera (<400 KB)');
  assert(!/<script[^>]+src=|<link[^>]+href="http/i.test(html), 'sin frameworks ni hojas externas');
  assert(!/node_modules|require\(|import\s+.*from/i.test(html), 'sin módulos ni compilación');

  console.log('OK audit.test');
})().catch((e) => { console.error(e); process.exit(1); });
