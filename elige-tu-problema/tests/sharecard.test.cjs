const H = require('./harness.cjs');
const assert = H.assert;

(async () => {
  const { window, document, errors } = await H.bootDom();
  await H.clickStart(window, document, 'normal');
  await H.playRun(window, document, 10, (i) => (i % 3 === 0 ? 'b' : 'a'));
  assert(H.visible(document, 'screen-result'), 'resultado visible');

  // Contexto 2D falso para verificar el dibujo de la tarjeta sin navegador gráfico
  const calls = [];
  const gradient = { addColorStop() { calls.push('colorStop'); } };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
    fillRect() { calls.push('fillRect'); },
    createLinearGradient() { calls.push('linear'); return gradient; },
    createRadialGradient() { calls.push('radial'); return gradient; },
    beginPath() { calls.push('begin'); },
    moveTo() {}, lineTo() {}, arcTo() {}, closePath() {},
    roundRect() { calls.push('roundRect'); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    fillText(t) { calls.push('text:' + String(t).slice(0, 24)); },
    measureText(t) { return { width: String(t).length * 11 }; }
  };
  const canvas = document.getElementById('share-canvas');
  window.HTMLCanvasElement.prototype.getContext = function () { return ctx; };
  canvas.toBlob = function (cb) { cb(new window.Blob(['fake'], { type: 'image/png' })); };
  window.URL.createObjectURL = () => 'blob:tarjeta';
  window.URL.revokeObjectURL = () => {};

  document.querySelector('[data-action="download-card"]').click();
  await H.tick(80);
  const note = document.querySelector('#share-note');
  assert(calls.length > 35, 'la tarjeta dibuja suficientes elementos (' + calls.length + ')');
  assert(calls.some((c) => /^text:.*ELIGE TU PROBLEMA/.test(c)), 'la tarjeta lleva la marca del juego');
  assert(calls.some((c) => /^text:.*Juega gratis|juego\.test/i.test(c)) || calls.some((c) => /juego\.test/.test(c)), 'la tarjeta incluye la dirección');
  assert(/descargada/i.test(note.textContent), 'informa de la descarga real: ' + note.textContent);
  console.log('   dibujo de tarjeta:', calls.length, 'operaciones; descarga confirmada');

  // Compartir con archivos (menú nativo simulado con éxito)
  let shared = null;
  window.navigator.canShare = () => true;
  window.navigator.share = (payload) => { shared = payload; return Promise.resolve(); };
  document.querySelector('[data-action="share"]').click();
  await H.tick(120);
  assert(shared, 'se invoca el menú nativo de compartir');
  assert(shared.files && shared.files.length === 1, 'se comparte la tarjeta como archivo');
  assert(/png/i.test(shared.files[0].type), 'el archivo compartido es PNG');
  assert(/Compartido/.test(note.textContent), 'solo afirma compartir cuando el menú resuelve: ' + note.textContent);
  console.log('   compartir con archivo PNG OK');

  // Compartir solo texto (sin soporte de archivos)
  shared = null;
  window.navigator.canShare = () => false;
  document.querySelector('[data-action="share"]').click();
  await H.tick(80);
  assert(shared && typeof shared.text === 'string' && shared.text.includes('ELIGE TU PROBLEMA'), 'comparte texto si no puede compartir archivos');
  assert(shared.text.includes('Resultado:'), 'el texto incluye el resultado');
  console.log('   compartir solo texto OK');

  // Copiar con portapapeles disponible
  let copied = null;
  window.navigator.clipboard = { writeText: (t) => { copied = t; return Promise.resolve(); } };
  document.querySelector('[data-action="copy"]').click();
  await H.tick(60);
  assert(copied && copied.includes('ELIGE TU PROBLEMA'), 'copia el resumen al portapapeles');
  assert(/copiado/i.test(note.textContent), 'confirma la copia');
  console.log('   copiar al portapapeles OK');

  assert.strictEqual(errors.length, 0, 'sin errores al dibujar o compartir: ' + JSON.stringify(errors));
  console.log('OK sharecard.test');
})().catch((e) => { console.error(e); process.exit(1); });
