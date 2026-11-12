// ============================================================
// Lector de PNG y carga de corpus REAL de visión
// ============================================================
// Sin dependencias: el proyecto se ejecuta con `node` a secas. Estas pruebas
// comprueban que (a) el decodificador lee lo que el codificador escribe y
// rechaza lo que no soporta en vez de inventar píxeles, y (b) el cargador de
// corpus rechaza capturas sin etiqueta humana en lugar de evaluarlas a ciegas.

import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePng, decodePng, isPng, crc32 } from '../src/vision/png.js';
import {
  loadRealCorpus, loadRealCaseFromBuffer, evaluateCase, summarizeCorpus, renderReport,
} from '../src/vision/evaluation.js';

const img = (w, h, fn) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a === undefined ? 255 : a;
    }
  }
  return data;
};

test('PNG: ida y vuelta exacta en RGBA y en RGB', () => {
  const W = 7, H = 5;
  const data = img(W, H, (x, y) => [(x * 31 + y * 7) % 256, (x * 11 + y * 47) % 256, (x * 3 + y * 89) % 256]);
  for (const alpha of [true, false]) {
    const buf = encodePng({ data, width: W, height: H, alpha });
    assert.ok(isPng(buf), 'el codificador debe producir un PNG válido');
    const back = decodePng(buf);
    assert.equal(back.width, W);
    assert.equal(back.height, H);
    assert.equal(back.data.length, W * H * 4, 'la salida es siempre RGBA');
    for (let i = 0; i < W * H; i++) {
      assert.equal(back.data[i * 4], data[i * 4], `R en el píxel ${i}`);
      assert.equal(back.data[i * 4 + 1], data[i * 4 + 1], `G en el píxel ${i}`);
      assert.equal(back.data[i * 4 + 2], data[i * 4 + 2], `B en el píxel ${i}`);
      assert.equal(back.data[i * 4 + 3], 255, `A en el píxel ${i}`);
    }
  }
});

test('PNG: la firma y el CRC se validan de verdad', () => {
  assert.equal(isPng(Buffer.from('no soy un png')), false);
  assert.equal(isPng(Buffer.alloc(0)), false);
  const buf = encodePng({ data: img(4, 4, () => [10, 20, 30]), width: 4, height: 4 });
  assert.ok(isPng(buf));
  // CRC-32 conocido del estándar PNG para "IEND" sin datos.
  assert.equal(crc32(Buffer.from('IEND')), 0xae426082);
});

test('PNG: lo que no se soporta se rechaza con mensaje, no se aproxima', () => {
  const base = encodePng({ data: img(4, 4, () => [1, 2, 3]), width: 4, height: 4 });
  assert.throws(() => decodePng(Buffer.from('GIF89a')), /firma/i);

  // IHDR modificado a propósito: bit depth 16 y color type 3 (paleta).
  const conBitDepth16 = Buffer.from(base);
  conBitDepth16[24] = 16;
  assert.throws(() => decodePng(conBitDepth16), /8 bits|bits por canal/i);

  const conPaleta = Buffer.from(base);
  conPaleta[25] = 3;
  assert.throws(() => decodePng(conPaleta), /color type 3/i);

  const entrelazado = Buffer.from(base);
  entrelazado[28] = 1;
  assert.throws(() => decodePng(entrelazado), /entrelazado/i);

  // PNG truncado: se corta el final (se pierde IEND y parte de los datos).
  assert.throws(() => decodePng(base.subarray(0, base.length - 12)), /truncado|incompleto|IDAT|IEND/i);
  assert.throws(() => decodePng(base.subarray(0, base.length - 40)), /truncado|incompleto|IDAT|IEND/i);
});

test('corpus real: se carga un par PNG+JSON y se evalúa de verdad', () => {
  const data = img(96, 48, (x, y) => (x < 48 ? [196, 160, 110] : [60, 170, 220]));
  const png = encodePng({ data, width: 96, height: 48 });
  const descriptor = {
    id: 'N12',
    origen: 'humano',
    tema: 'mina',
    resolucion: { width: 96, height: 48 },
    etiqueta: [[{ type: 'empty' }, { type: 'gem' }]],
    notas: 'captura de prueba',
  };
  const { caso, warnings } = loadRealCaseFromBuffer({ id: 'N12', png, descriptor });
  assert.equal(caso.origen, 'humano');
  assert.equal(caso.resolucion.width, 96);
  assert.deepEqual(warnings, [], 'sin avisos cuando el descriptor cuadra');
  const r = evaluateCase(caso);
  assert.equal(r.ok, true);
  assert.equal(r.total, 2);
});

test('corpus real: una etiqueta que no cuadra con el PNG se avisa, no se corrige en silencio', () => {
  const png = encodePng({ data: img(40, 40, () => [1, 1, 1]), width: 40, height: 40 });
  const { warnings } = loadRealCaseFromBuffer({
    id: 'X',
    png,
    descriptor: { id: 'X', origen: 'humano', resolucion: { width: 100, height: 100 }, etiqueta: [[{ type: 'empty' }]] },
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /resolución declarada/i);
});

test('corpus real: sin etiqueta humana no se evalúa', () => {
  const png = encodePng({ data: img(8, 8, () => [1, 1, 1]), width: 8, height: 8 });
  assert.throws(() => loadRealCaseFromBuffer({ id: 'A', png, descriptor: { id: 'A', origen: 'humano' } }),
    /no tiene etiqueta/i);
  assert.throws(() => loadRealCaseFromBuffer({
    id: 'B', png, descriptor: { id: 'B', origen: 'humano', etiqueta: [[{ type: 'empty' }], []] },
  }), /no rectangular/i);
});

test('carga de carpeta: un caso roto no tumba el corpus, queda declarado', () => {
  const okPng = encodePng({ data: img(48, 48, (x) => (x < 24 ? [196, 160, 110] : [60, 170, 220])), width: 48, height: 48 });
  const files = {
    'a.png': okPng,
    'a.json': JSON.stringify({ id: 'a', origen: 'humano', resolucion: { width: 48, height: 48 }, etiqueta: [[{ type: 'empty' }, { type: 'gem' }]] }),
    'sin-etiqueta.png': okPng,
    'solo-json.json': JSON.stringify({ id: 'solo-json' }),
    'roto.png': Buffer.from('no soy png'),
    'roto.json': JSON.stringify({ id: 'roto', origen: 'humano', etiqueta: [[{ type: 'empty' }]] }),
  };
  const r = loadRealCorpus({
    dir: 'memoria',
    readDir: () => Object.keys(files),
    readFile: (p) => files[p.split('/')[1]],
  });
  assert.equal(r.casos.length, 1, 'sólo el par completo y legible entra al corpus');
  assert.equal(r.casos[0].id, 'a');
  const ids = r.errors.map((e) => e.id).sort();
  assert.deepEqual(ids, ['roto', 'sin-etiqueta', 'solo-json']);
  assert.match(r.errors.find((e) => e.id === 'roto').error, /firma|PNG/i);
});

test('el informe no dice «reales: 0» cuando hay capturas reales', () => {
  const png = encodePng({ data: img(48, 48, (x) => (x < 24 ? [196, 160, 110] : [60, 170, 220])), width: 48, height: 48 });
  const { caso } = loadRealCaseFromBuffer({
    id: 'R1',
    png,
    descriptor: { id: 'R1', origen: 'humano', resolucion: { width: 48, height: 48 }, etiqueta: [[{ type: 'empty' }, { type: 'gem' }]] },
  });
  const s = summarizeCorpus([evaluateCase(caso)]);
  const text = renderReport(s, [], { realImages: 1 });
  assert.match(text, /reales: 1/);
  assert.doesNotMatch(text, /no hay capturas reales/i);
});
