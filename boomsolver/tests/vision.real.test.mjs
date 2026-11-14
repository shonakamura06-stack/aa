// ============================================================
// Pruebas del reconocimiento sobre arte REAL (Fase 2.1)
// ============================================================
// Qué se comprueba aquí y qué NO
// ------------------------------
// Estas pruebas fijan el COMPORTAMIENTO del módulo, no su precisión. La
// precisión se mide con el corpus real (`node scripts/cli.mjs vision
// --real=./corpus/real`) y se publica con su abstención al lado. Poner aquí un
// umbral de precisión convertiría el test en un contrato que se puede cumplir
// degradando la abstención, que es justo lo contrario de lo que se busca.
//
// Las imágenes son sintéticas y minúsculas, generadas en el propio test: así no
// hay binarios en el repositorio y el test no depende del corpus.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  objectMask,
  maskComponents,
  pickObject,
  realCellFeatures,
  featureVector,
  trainModel,
  classifyRealCell,
  CLASSES_UNSEPARABLE,
  FLOOR_DISTANCE,
} from '../src/vision/realClassifier.js';
import { classificarCapturaReal, extraerMuestras, entrenarModelo } from '../src/vision/realPipeline.js';
import { REVIEW } from '../src/vision/detector.js';

// ------------------------------------------------------------
// Utilidades de imagen
// ------------------------------------------------------------
/** Lienzo de color plano con un rectángulo de otro color en el centro. */
function canvas(w, h, floor, rect = null) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = floor[0];
    data[i * 4 + 1] = floor[1];
    data[i * 4 + 2] = floor[2];
    data[i * 4 + 3] = 255;
  }
  if (rect) {
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = (y * w + x) * 4;
        data[i] = rect.rgb[0]; data[i + 1] = rect.rgb[1]; data[i + 2] = rect.rgb[2];
      }
    }
  }
  return { data, width: w, height: h };
}

const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

// ------------------------------------------------------------
// Máscara y componentes
// ------------------------------------------------------------
test('la máscara separa el objeto del suelo y no se lo inventa si todo es suelo', () => {
  const liso = canvas(40, 40, [120, 160, 90]);
  const m0 = objectMask(liso.data, liso.width, box(0, 0, 39, 39));
  assert.equal(m0.n, 0, 'un suelo plano no produce máscara');
  assert.ok(m0.groundFraction > 0.9);

  const conObjeto = canvas(40, 40, [120, 160, 90], { x0: 12, y0: 14, x1: 27, y1: 25, rgb: [230, 40, 180] });
  const m1 = objectMask(conObjeto.data, conObjeto.width, box(0, 0, 39, 39));
  assert.ok(m1.n > 100, `esperaba máscara, hay ${m1.n}`);
  assert.deepEqual(m1.floor, [120, 160, 90], 'el suelo se estima del anillo');
});

test('la componente elegida es el objeto, no un trozo de arte pegado al borde', () => {
  const img = canvas(40, 40, [120, 160, 90], { x0: 12, y0: 14, x1: 27, y1: 25, rgb: [230, 40, 180] });
  // intruso: arte del vecino pegado al borde derecho
  for (let y = 0; y < 40; y++) {
    for (let x = 37; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      img.data[i] = 20; img.data[i + 1] = 210; img.data[i + 2] = 230;
    }
  }
  const m = objectMask(img.data, img.width, box(0, 0, 39, 39));
  const comps = maskComponents(m.mask, m.w, m.h, { minArea: 8 });
  assert.equal(comps.length, 2, 'hay dos manchas separadas');
  const obj = pickObject(comps, m.w, m.h);
  assert.ok(obj.cx > 8 && obj.cx < 32, `eligió la mancha centrada (cx=${obj.cx})`);
});

test('las componentes conexas miden área, caja y centro como se espera', () => {
  const img = canvas(30, 30, [0, 0, 0], { x0: 5, y0: 6, x1: 14, y1: 16, rgb: [255, 255, 255] });
  const m = objectMask(img.data, img.width, box(0, 0, 29, 29), { ring: 0.1 });
  const comps = maskComponents(m.mask, m.w, m.h, { minArea: 4 });
  assert.equal(comps.length, 1);
  assert.equal(comps[0].n, 10 * 11);
  assert.deepEqual(comps[0].bbox, { minx: 5, miny: 6, maxx: 14, maxy: 16, w: 10, h: 11 });
});

// ------------------------------------------------------------
// Rasgos
// ------------------------------------------------------------
test('una casilla sin objeto se marca vacía con todos los rasgos a cero', () => {
  const img = canvas(30, 30, [90, 140, 100]);
  const f = realCellFeatures(img.data, img.width, box(0, 0, 29, 29));
  assert.equal(f.empty, true);
  assert.equal(f.frac, 0);
  assert.equal(f.colors.blue, undefined, 'sin objeto no hay reparto de color');
});

test('los rasgos describen el color y la forma del objeto', () => {
  const img = canvas(40, 40, [120, 160, 90], { x0: 14, y0: 8, x1: 25, y1: 31, rgb: [240, 60, 170] });
  const f = realCellFeatures(img.data, img.width, box(0, 0, 39, 39));
  assert.equal(f.empty, false);
  assert.ok(f.colors.pink > 0.5, `esperaba predomino rosa, ${JSON.stringify(f.colors)}`);
  assert.ok(f.bboxH > f.bboxW, 'la caja es más alta que ancha');
  assert.ok(f.fill > 0.9, 'un rectángulo llena su caja');
});

// ------------------------------------------------------------
// Modelo y abstención
// ------------------------------------------------------------
/**
 * Casillas sintéticas de dos clases bien separadas por color.
 *
 * El tamaño del objeto VARÍA a propósito (de 12 a 24 px): un conjunto de
 * desarrollo con todos los objetos idénticos tiene desviación casi nula y
 * cualquier muestra nueva sale "rarísima" en unidades normalizadas. Es un
 * artefacto del juguete, no del método, pero conviene tenerlo imitado aquí
 * para que el test mida el mecanismo y no la falta de variedad.
 */
function muestrasSinteticas() {
  const out = [];
  const add = (type, rgb) => {
    for (const size of [12, 15, 18, 21, 24]) {
      const c = Math.floor(40 / 2);
      const img = canvas(40, 40, [120, 160, 90], {
        x0: c - Math.floor(size / 2), y0: c - Math.floor(size / 2),
        x1: c + Math.floor(size / 2), y1: c + Math.floor(size / 2), rgb,
      });
      out.push({ type, features: realCellFeatures(img.data, img.width, box(0, 0, 39, 39)) });
    }
  };
  add('azul', [40, 90, 230]);
  add('rosa', [235, 70, 180]);
  return out;
}

test('el modelo aprende una clase por prototipo y normaliza con los datos de desarrollo', () => {
  const modelo = trainModel(muestrasSinteticas());
  assert.deepEqual(modelo.classes, ['azul', 'rosa']);
  assert.equal(modelo.n, 10);
  assert.equal(modelo.mu.length, featureVector(realCellFeatures(canvas(20, 20, [1, 2, 3]).data, 20, box(0, 0, 19, 19))).length);
  for (const c of modelo.classes) assert.equal(modelo.prototypes[c].length, modelo.mu.length);
});

test('el clasificador acierta una casilla nueva de cada clase', () => {
  const modelo = trainModel(muestrasSinteticas());
  const azul = canvas(40, 40, [120, 160, 90], { x0: 13, y0: 13, x1: 26, y1: 26, rgb: [45, 88, 225] });
  // `maxDistance` se mide sobre el corpus real (ver README). Con un modelo de
  // juguete de 3 muestras por clase las desviaciones son minúsculas y las
  // distancias normalizadas salen grandes: aquí se holga el umbral a propósito,
  // porque lo que se prueba es el mecanismo, no la calibración.
  const r = classifyRealCell(azul.data, azul.width, box(0, 0, 39, 39), modelo, { maxDistance: 8 });
  assert.equal(r.type, 'azul');
  assert.equal(r.status, REVIEW.CONFIRMED);
  assert.ok(r.confidence > 0 && r.confidence <= 1);
  assert.ok(Array.isArray(r.evidence) && r.evidence.length, 'siempre da evidencia');
});

test('sin parecido suficiente se abstiene en vez de adivinar', () => {
  const modelo = trainModel(muestrasSinteticas());
  // Un objeto que no se parece a ninguno de los dos prototipos.
  const raro = canvas(40, 40, [120, 160, 90], { x0: 4, y0: 4, x1: 35, y1: 8, rgb: [250, 240, 60] });
  const r = classifyRealCell(raro.data, raro.width, box(0, 0, 39, 39), modelo, { maxDistance: 8 });
  assert.equal(r.type, null, 'no debe devolver una clase');
  assert.equal(r.status, REVIEW.UNKNOWN);
});

test('una casilla vacía se declara vacía y no consume el modelo', () => {
  const modelo = trainModel(muestrasSinteticas());
  const vacia = canvas(40, 40, [120, 160, 90]);
  const r = classifyRealCell(vacia.data, vacia.width, box(0, 0, 39, 39), modelo);
  assert.equal(r.type, 'empty');
  assert.equal(r.status, REVIEW.CONFIRMED);
});

test('un parche de terreno que llena la casilla no se toma por un objeto', () => {
  const modelo = trainModel(muestrasSinteticas());
  const parche = canvas(40, 40, [70, 55, 50]);
  const r = classifyRealCell(parche.data, parche.width, box(0, 0, 39, 39), modelo);
  assert.equal(r.type, 'empty');
  assert.match(r.evidence.join(' '), /terreno|sin objeto/);
});

test('si el anillo de la casilla no es suelo, se avisa en vez de clasificar', () => {
  // Un tablero de rayas verticales de 2 px: el anillo de CUALQUIER casilla
  // contiene las dos mitades de la raya, así que no hay un suelo del que fiarse.
  const w = 40, h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const on = Math.floor(x / 2) % 2 === 0;
      data[i] = on ? 20 : 240; data[i + 1] = on ? 30 : 250; data[i + 2] = on ? 40 : 255; data[i + 3] = 255;
    }
  }
  const modelo = trainModel(muestrasSinteticas());
  const r = classifyRealCell(data, w, box(0, 0, 39, 39), modelo);
  assert.equal(r.status, REVIEW.NEEDS_REVIEW);
  assert.match(r.evidence.join(' '), /anillo|recorte/);
});

test('el umbral de suelo y las familias confusas están declarados como constantes', () => {
  assert.equal(typeof FLOOR_DISTANCE, 'number');
  assert.ok(Array.isArray(CLASSES_UNSEPARABLE));
  for (const fam of CLASSES_UNSEPARABLE) assert.equal(fam.length, 2);
});

// ------------------------------------------------------------
// Tubería de captura completa
// ------------------------------------------------------------
test('la tubería trocea, clasifica y conserva la forma de salida del detector', () => {
  const modelo = trainModel(muestrasSinteticas());
  const w = 80, h = 40;
  const img = canvas(w, h, [120, 160, 90], null);
  // casilla izquierda azul, casilla derecha rosa
  for (let y = 10; y <= 29; y++) {
    for (let x = 10; x <= 29; x++) {
      const i = (y * w + x) * 4; img.data[i] = 40; img.data[i + 1] = 90; img.data[i + 2] = 230;
    }
    for (let x = 50; x <= 69; x++) {
      const i = (y * w + x) * 4; img.data[i] = 235; img.data[i + 1] = 70; img.data[i + 2] = 180;
    }
  }
  const cellGrid = [[box(0, 0, 39, 39), box(40, 0, 79, 39)]];
  const out = classificarCapturaReal({ data: img.data, width: w, height: h, cellGrid, modelo, opciones: { maxDistance: 8 } });
  assert.equal(out.ok, true);
  assert.equal(out.cols, 2);
  assert.equal(out.rows, 1);
  assert.equal(out.cells[0][0].type, 'azul');
  assert.equal(out.cells[0][1].type, 'rosa');
  // la forma que espera `compareObjects`
  assert.ok('status' in out.cells[0][0] && 'confidence' in out.cells[0][0]);
});

test('la tubería se niega a trabajar sin modelo o con rejilla vacía', () => {
  const img = canvas(20, 20, [1, 1, 1]);
  assert.equal(classificarCapturaReal({ ...img, cellGrid: [[box(0, 0, 19, 19)]], modelo: null }).ok, false);
  assert.equal(classificarCapturaReal({ ...img, cellGrid: [], modelo: {} }).ok, false);
});

test('una casilla que se sale de la captura se marca para revisión, no se inventa', () => {
  const modelo = trainModel(muestrasSinteticas());
  const img = canvas(40, 40, [120, 160, 90]);
  const out = classificarCapturaReal({
    data: img.data, width: img.width, height: img.height, modelo,
    cellGrid: [[box(0, 0, 39, 39), box(60, 0, 99, 39)]],
  });
  assert.equal(out.cells[0][0].type, 'empty');
  assert.equal(out.cells[0][1].status, REVIEW.NEEDS_REVIEW);
  assert.match(out.cells[0][1].evidence.join(' '), /se sale/);
});

test('`extraerMuestras` etiqueta cada casilla y deja «empty» las no anotadas', () => {
  const img = canvas(80, 40, [120, 160, 90]);
  const cellGrid = [[box(0, 0, 39, 39), box(40, 0, 79, 39)]];
  const muestras = extraerMuestras({
    data: img.data, width: img.width, height: img.height, cellGrid,
    etiquetas: [{ x: 1, y: 0, type: 'gem' }],
  });
  assert.equal(muestras.length, 2);
  assert.equal(muestras[0].type, 'empty');
  assert.equal(muestras[1].type, 'gem');
});

test('`entrenarModelo` no aprende los objetos de clase desconocida (`*`)', () => {
  const img = canvas(80, 40, [120, 160, 90], { x0: 8, y0: 8, x1: 31, y1: 31, rgb: [40, 90, 230] });
  const cellGrid = [[box(0, 0, 39, 39), box(40, 0, 79, 39)]];
  const modelo = entrenarModelo([{
    id: 'x', image: img, cellGrid,
    objetos: [{ x: 0, y: 0, type: 'gem' }, { x: 1, y: 0, type: '*' }],
  }]);
  assert.deepEqual(modelo.classes, ['gem'], 'sólo aprende gem');
  assert.equal(modelo.capturas[0], 'x');
});

test('el prototipo de una clase con una sola muestra es esa muestra normalizada', () => {
  const img = canvas(40, 40, [120, 160, 90], { x0: 12, y0: 12, x1: 27, y1: 27, rgb: [40, 90, 230] });
  const modelo = entrenarModelo([{ id: 'a', image: img, cellGrid: [[box(0, 0, 39, 39)]], objetos: [{ x: 0, y: 0, type: 'gem' }] }]);
  const f = realCellFeatures(img.data, img.width, box(0, 0, 39, 39));
  const v = featureVector(f).map((x, i) => (x - modelo.mu[i]) / modelo.sd[i]);
  assert.deepEqual(modelo.prototypes.gem, v);
  assert.equal(modelo.spread.gem, 0);
});

// ------------------------------------------------------------
// Evaluación completa del corpus (validación cruzada)
// ------------------------------------------------------------
test('`crossValidateByLevel` nunca evalúa una captura con su propio nivel', async () => {
  const { crossValidateByLevel } = await import('../src/vision/realEval.js');
  const casos = [
    { id: 'a', nivel: 1 }, { id: 'b', nivel: 1 }, { id: 'c', nivel: 2 }, { id: 'd', nivel: null },
  ];
  const pliegues = crossValidateByLevel(casos);
  assert.equal(pliegues.length, 3, 'un pliegue por nivel (y uno por caso sin nivel)');
  const porGrupo = Object.fromEntries(pliegues.map((p) => [p.grupo, p]));
  // las dos capturas del nivel 1 van juntas y ninguna está en su desarrollo
  assert.deepEqual(porGrupo['n:1'].eval.map((c) => c.id), ['a', 'b']);
  assert.deepEqual(porGrupo['n:1'].dev.map((c) => c.id), ['c', 'd']);
  for (const p of pliegues) {
    for (const c of p.eval) {
      assert.ok(!p.dev.some((d) => d.id === c.id), `${c.id} no puede estar en su propio desarrollo`);
    }
  }
});

test('`splitByLevel` es determinista y no separa capturas del mismo nivel', async () => {
  const { splitByLevel } = await import('../src/vision/realEval.js');
  const casos = [1, 2, 3, 4, 5].flatMap((n) => [
    { id: `x${n}a`, nivel: n }, { id: `x${n}b`, nivel: n },
  ]);
  const a = splitByLevel(casos, { evalRatio: 0.4 });
  const b = splitByLevel(casos, { evalRatio: 0.4 });
  assert.deepEqual(a.nivelesEval, b.nivelesEval, 'el reparto no se sortea');
  for (const n of a.nivelesEval) {
    const enEval = a.eval.filter((c) => c.nivel === n).length;
    assert.equal(enEval, 2, `el nivel ${n} entra entero en evaluación o no entra`);
  }
});

// ------------------------------------------------------------
// Rejilla estimada por DAMERO (Fase 2.2)
// ------------------------------------------------------------
// El tablero real es un damero de dos tonos planos. Sobre un damero sintético
// la rejilla tiene que salir EXACTA —paso, columnas, filas y origen—, y sobre
// una imagen sin damero tiene que devolver `null` en vez de inventarla.
/** Damero de `cols`×`rows` casillas de lado `L`, con fase (`ox`,`oy`). */
function damero({ cols, rows, L, ox = 0, oy = 0, a = [160, 200, 120], b = [140, 180, 104] }) {
  const w = Math.round(cols * L + ox);
  const h = Math.round(rows * L + oy);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = Math.floor((x - ox) / L);
      const r = Math.floor((y - oy) / L);
      const t = (c + r) % 2 === 0 ? a : b;
      const i = (y * w + x) * 4;
      data[i] = t[0]; data[i + 1] = t[1]; data[i + 2] = t[2]; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

test('`estimateGridFromFloor` mide un damero sintético exacto', async () => {
  const { estimateGridFromFloor } = await import('../src/vision/grid.js');
  const img = damero({ cols: 8, rows: 5, L: 74.5 });
  const g = estimateGridFromFloor(img.data, img.width, img.height);
  assert.ok(g, 'debe encontrar rejilla');
  assert.equal(g.cols, 8);
  assert.equal(g.rows, 5);
  assert.ok(Math.abs(g.cell - 74.5) <= 1.0, `paso ${g.cell}`);
  assert.equal(g.afinado, true, 'el ajuste por mínimos cuadrados debe aplicarse');
  // El origen es modular: -L/2 < origen <= L/2.
  assert.ok(g.origin.x > -g.cell / 2 && g.origin.x <= g.cell / 2, `origen.x ${g.origin.x}`);
  assert.ok(g.origin.y > -g.cell / 2 && g.origin.y <= g.cell / 2, `origen.y ${g.origin.y}`);
  // Y con el damero empezando en 0, el origen tiene que caer ahí (±2 px).
  assert.ok(Math.abs(g.origin.x) <= 2, `origen.x ${g.origin.x}`);
  assert.ok(Math.abs(g.origin.y) <= 2, `origen.y ${g.origin.y}`);
});

test('`estimateGridFromFloor` recupera una captura que empieza a media casilla', async () => {
  const { estimateGridFromFloor } = await import('../src/vision/grid.js');
  // El tablero ocupa sólo una parte del lienzo: una casilla (60 px) se sale por
  // la izquierda y otra por arriba. El número de casillas se cuenta por el ancho
  // del lienzo, así que se espera 400/60 → 7 y 343/60 → 6.
  const img = damero({ cols: 7, rows: 6, L: 60, ox: 20, oy: 17 });
  const g = estimateGridFromFloor(img.data, img.width, img.height);
  assert.ok(g);
  assert.equal(g.cols, 7);
  assert.equal(g.rows, 6);
  // La frontera real está en +20/+17; canonizada, en 20 y 17.
  assert.ok(Math.abs(g.origin.x - 20) <= 2, `origen.x ${g.origin.x}`);
  assert.ok(Math.abs(g.origin.y - 17) <= 2, `origen.y ${g.origin.y}`);
});

test('`estimateGridFromFloor` devuelve `null` si no hay damero', async () => {
  const { estimateGridFromFloor } = await import('../src/vision/grid.js');
  // Ruido uniforme: no hay dos tonos dominantes ni periodicidad.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
  const w = 200, h = 200;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rnd(); data[i * 4 + 1] = rnd(); data[i * 4 + 2] = rnd(); data[i * 4 + 3] = 255;
  }
  assert.equal(estimateGridFromFloor(data, w, h), null);
  // Un lienzo de un solo color tampoco es un damero.
  const plano = canvas(200, 200, [120, 160, 90]);
  assert.equal(estimateGridFromFloor(plano.data, 200, 200), null);
});

test('el modo `estimada` no usa la cuadrícula humana', async () => {
  const { evaluateRealCase } = await import('../src/vision/realEval.js');
  // 7×6 para que la rejilla tenga evidencia suficiente: con muy pocas casillas
  // el estimador es prudente y devuelve `null` (que es lo correcto).
  const img = damero({ cols: 7, rows: 6, L: 50 });
  const base = {
    id: 'x', nivel: 1, nombre: 'x', image: img,
    cuadricula: { cols: 7, rows: 6 },
    geometria: { lado: 50, origen_recorte: { x: 0, y: 0 }, fase_casilla: { x: 0, y: 0 } },
    objetos: [], bandeja: null, temporizadores: null, enlaces: [],
  };
  // Un modelo con una clase cualquiera: aquí interesa la rejilla, no el acierto.
  const dev = damero({ cols: 4, rows: 3, L: 50 });
  for (let y = 120; y < 145; y++) {
    for (let x = 120; x < 145; x++) {
      const i = (y * dev.width + x) * 4;
      dev.data[i] = 40; dev.data[i + 1] = 90; dev.data[i + 2] = 220;
    }
  }
  const modelo = entrenarModelo([{
    id: 'dev', image: dev,
    cellGrid: [
      [box(0, 0, 49, 49), box(50, 0, 99, 49), box(100, 0, 149, 49), box(150, 0, 199, 49)],
      [box(0, 50, 49, 99), box(50, 50, 99, 99), box(100, 50, 149, 99), box(150, 50, 199, 99)],
      [box(0, 100, 49, 149), box(50, 100, 99, 149), box(100, 100, 149, 149), box(150, 100, 199, 149)],
    ],
    objetos: [{ x: 2, y: 2, type: 'gem' }],
  }]);
  // Con una geometría humana ABSURDA, el modo `estimada` tiene que ignorarla
  // y sacar la rejilla de la imagen.
  const roto = { ...base, geometria: { lado: 999, origen_recorte: { x: 700, y: 900 }, fase_casilla: { x: 33, y: 44 } } };
  const r = evaluateRealCase(roto, { mode: 'estimada', modelo });
  assert.equal(r.modo, 'estimada');
  assert.equal(r.rejilla.metodo, 'damero (captura completa)');
  assert.equal(r.rejilla.estimado, '7x6');
  assert.equal(r.rejilla.acierto, true);
  // Y el modo `clasificador` sí la usa (aquí, para mal).
  const r2 = evaluateRealCase(roto, { mode: 'clasificador', modelo });
  assert.equal(r2.rejilla.estimado, 'dada (humana)');
});
