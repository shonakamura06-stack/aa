// ============================================================
// Pruebas de la INFRAESTRUCTURA de evaluación de visión (§5)
// ============================================================
// Estas pruebas no dicen "el detector es bueno": comprueban que las métricas se
// calculan bien y que la abstención se respeta. El corpus real está pendiente y
// se declara como tal en todo informe.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCase, summarizeCorpus, watchedConfusionReport, splitTrainEval,
  renderReport, synthCase, evaluatePortalColors, loadRealCase, normalizeLabelGrid,
  WATCHED_CONFUSIONS,
} from '../src/vision/evaluation.js';
import { REVIEW } from '../src/vision/detector.js';

const simpleCase = () => synthCase({
  id: 'S1',
  layout: [['empty', 'gem', 'empty'], ['empty', 'empty', 'wall']],
  cellPx: 48,
  seed: 3,
});

test('una captura etiquetada se compara casilla a casilla con confianza y evidencia', () => {
  const r = evaluateCase(simpleCase());
  assert.equal(r.ok, true);
  assert.equal(r.total, 6, 'todas las casillas se comparan, no sólo las que el detector responde');
  for (const c of r.cells) {
    assert.ok(typeof c.x === 'number' && typeof c.y === 'number');
    assert.ok('real' in c && 'detected' in c);
    assert.ok(typeof c.confidence === 'number');
    assert.ok(typeof c.abstained === 'boolean');
    assert.ok(Array.isArray(c.alternatives));
  }
});

test('la abstención no cuenta como error pero sí reduce la cobertura', () => {
  const r = evaluateCase(simpleCase());
  const s = summarizeCorpus([r]);
  // `coverage` se publica redondeada a 3 decimales; la suma se compara con
  // tolerancia de redondeo (no se relaja la regla: cobertura = respondidas/total).
  const answered = r.cells.filter((c) => !c.abstained).length;
  assert.equal(s.coverage, +(answered / s.cells).toFixed(3), 'cobertura = respondidas / total');
  assert.ok(Math.abs(s.coverage + (s.abstentions / s.cells) - 1) < 1e-3,
    `cobertura + abstención = 1 (${s.coverage} + ${s.abstentions}/${s.cells})`);
  assert.ok(s.abstentions >= 0);
  // El acierto sobre respondidas ignora las abstenciones, que es lo correcto:
  // abstenerse nunca debe premiar ni penalizar la precisión.
  if (s.accuracyOverAnswered !== null) {
    const answered = r.cells.filter((c) => !c.abstained);
    const hits = answered.filter((c) => c.hit).length;
    assert.equal(s.accuracyOverAnswered, answered.length ? +(hits / answered.length).toFixed(3) : null);
  }
});

test('una casilla ambigua etiquetada a mano no penaliza si el detector elige otra alternativa', () => {
  // Etiqueta ambigua: el humano no sabe si es cristal o gema; ambas valen.
  const caso = synthCase({
    id: 'AMB',
    layout: [['gem']],
    etiqueta: [[{ type: 'crystal', ambiguous: true, alternativas: ['gem'] }]],
    cellPx: 60,
  });
  const r = evaluateCase(caso);
  assert.equal(r.ambiguous, 1);
  assert.equal(r.cells[0].typeMatches, true,
    'acertar cualquiera de las alternativas declaradas cuenta como coincidencia de tipo');
  // El detector no confirma 'gem' con ese dibujo, así que se abstiene. Eso es
  // correcto y no debe contarse ni como error ni como acierto de precisión.
  assert.equal(r.cells[0].abstained, true);
  assert.equal(r.cells[0].hit, false, 'una abstención no es un acierto');
  assert.equal(r.correct, 0);
  const s = summarizeCorpus([r]);
  assert.equal(s.perClass.crystal.wrong, 0, 'abstenerse en un caso ambiguo no es un error');
});

test('la matriz de confusión separa errores de abstención', () => {
  // Se dibuja un cristal pero el humano lo etiqueta como 'cat' (etiqueta errónea a
  // propósito): así se comprueba que una discrepancia va a ERROR o a ABSTENCIÓN,
  // nunca a las dos, y que la abstención no se cuenta como fallo de precisión.
  const caso = synthCase({
    id: 'M1',
    layout: [['gem', 'crystal']],
    etiqueta: [[{ type: 'gem' }, { type: 'cat' }]],
    cellPx: 60,
  });
  const r = evaluateCase(caso);
  const s = summarizeCorpus([r]);
  const cat = r.cells[1];
  const row = s.matrix.cat;
  const total = Object.values(row).reduce((a, v) => a + v, 0);
  assert.equal(total, 1, 'la casilla aparece exactamente una vez en su fila');
  if (cat.abstained) {
    assert.equal(row.ABSTENCIÓN, 1, JSON.stringify(row));
    assert.equal(s.perClass.cat.wrong, 0, 'abstenerse no es un error');
    assert.equal(s.perClass.cat.abstained, 1);
  } else {
    assert.equal(row[cat.detected], 1, JSON.stringify(row));
    assert.equal(s.perClass.cat.wrong, 1);
  }
});

test('los pares de confusión exigidos por el encargo están todos declarados', () => {
  const pairs = WATCHED_CONFUSIONS.map(([a, b]) => `${a}|${b}`);
  for (const want of [
    'chest_wood|chest_iron',
    'crystal|gem',
    'rock_soft|rock_hard',
    'dynamite|detonator',
    'switch|bomb',
    'geyser|switch',
    'portal|portal',
    'mirror_slash|mirror_backslash',
    'enemy_1|enemy_2',
    'enemy_3|enemy_4',
  ]) {
    assert.ok(pairs.includes(want), `falta el par vigilado ${want}`);
  }
});

test('el par portal azul/morado se marca como no evaluable por tipo y se mide por color', () => {
  const s = summarizeCorpus([evaluateCase(simpleCase())]);
  const watched = watchedConfusionReport(s);
  const portalPair = watched.find((w) => w.a === 'portal' && w.b === 'portal');
  assert.equal(portalPair.detectable, false, 'no puede resolverse con la matriz de tipos');
  assert.match(portalPair.note, /color/i);

  const caso = synthCase({
    id: 'PC',
    layout: [['portal:blue', 'portal:purple']],
    etiqueta: [[{ type: 'portal', color: 'blue' }, { type: 'portal', color: 'purple' }]],
    cellPx: 60,
  });
  const det = evaluateCase(caso);
  assert.equal(det.portalColor.labeled, 2);
  assert.ok(det.portalColor.correct >= 1, `color detectado: ${JSON.stringify(det.portalColor.cells)}`);
  if (det.portalColor.wrong > 0) {
    assert.ok(Object.keys(det.portalColor.confusion).length > 0, 'un error de color debe aparecer en la confusión');
  }
});

test('el canal de color se abstiene si la saturación es demasiado baja', () => {
  // Gris neutro: no debe clasificarse como azul ni morado.
  const W = 40, H = 40;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 128; data[i * 4 + 3] = 255;
  }
  const caso = {
    id: 'gris',
    image: { data, width: W, height: H },
    etiqueta: [[{ type: 'portal', color: 'blue' }]],
    resolucion: { width: W, height: H },
    origen: 'sintetico',
  };
  const r = evaluateCase(caso, { cols: 1, rows: 1, region: { x0: 0, y0: 0, width: W, height: H, warnings: [] } });
  assert.equal(r.portalColor.cells[0].result, 'abstención', JSON.stringify(r.portalColor.cells[0]));
});

test('sin dibujo dentro de la casilla el detector se abstiene: es una limitación honesta, no un acierto', () => {
  // Con `iconos:false` cada casilla es un color plano. El clasificador mide
  // textura interna y no confirma ninguna clase, así que el corpus entero queda
  // en abstención. Este test fija ese comportamiento: sirve para documentar que
  // el `0 aciertos` histórico del corpus era un artefacto del corpus, no del
  // evaluador, y para que nadie "arregle" las métricas forzando el tipo.
  const plano = synthCase({
    id: 'plano',
    layout: [['gem', 'crystal'], ['empty', 'wall']],
    cellPx: 48,
    seed: 5,
    iconos: false,
  });
  const r = evaluateCase(plano);
  assert.equal(r.ok, true, 'la imagen se detecta; lo que falta es la confianza por casilla');
  assert.equal(r.correct, 0);
  assert.equal(r.abstentions, r.total, 'todas las casillas quedan en revisión');
  const s = summarizeCorpus([r]);
  assert.equal(s.perClass.gem.wrong, 0, 'abstenerse no cuenta como error');
});

test('con dibujo dentro de la casilla el evaluador registra aciertos reales', () => {
  // El corpus por defecto SÍ dibuja un emblema por objeto. Lo que se comprueba
  // aquí es que la cadena imagen→rejilla→casilla→clase→métrica funciona de
  // punta a punta; NO que el detector reconozca el arte del juego.
  const caso = synthCase({
    id: 'conIconos',
    layout: [['gem', 'crystal', 'cat'], ['portal', 'empty', 'wall']],
    cellPx: 48,
    seed: 9,
  });
  const r = evaluateCase(caso);
  assert.equal(r.total, 6);
  assert.ok(r.correct >= 3, `aciertos ${r.correct}/6 (${r.cells.map((c) => `${c.real}→${c.detected}`).join(', ')})`);
  assert.ok(r.abstentions < r.total, 'alguna casilla debe confirmarse');
});

test('el corpus sintético declara siempre que no es una captura del juego', () => {
  const caso = synthCase({ id: 'X', layout: [['empty']] });
  assert.equal(caso.origen, 'sintetico');
  assert.match(caso.notas, /NO es una captura del juego/);
});

test('separación train/eval reproducible y disjunta', () => {
  const casos = Array.from({ length: 10 }, (_, i) => synthCase({ id: `C${i}`, layout: [['empty']], seed: i }));
  const a = splitTrainEval(casos, { seed: 7 });
  const b = splitTrainEval(casos, { seed: 7 });
  assert.deepEqual(a.train.map((c) => c.id), b.train.map((c) => c.id), 'misma semilla, mismo corte');
  const overlap = a.train.filter((c) => a.eval.some((e) => e.id === c.id));
  assert.equal(overlap.length, 0, 'train y eval no pueden compartir imágenes');
  assert.equal(a.train.length + a.eval.length, casos.length);
});

test('un caso real sin etiqueta se rechaza: no se evalúa a ciegas', () => {
  const pixels = { data: new Uint8ClampedArray(16 * 16 * 4), width: 16, height: 16 };
  assert.throws(() => loadRealCase({ id: 'X', origen: 'humano', resolucion: { width: 16, height: 16 } }, pixels),
    /no tiene etiqueta/);
  assert.throws(() => loadRealCase({ id: 'X', origen: 'otro', etiqueta: [['empty']] }, pixels),
    /origen/);
  assert.throws(() => loadRealCase({ id: 'X', origen: 'humano', etiqueta: [['empty']] }, pixels),
    /resolución/);
});

test('el informe declara cero capturas reales cuando no las hay', () => {
  const s = summarizeCorpus([evaluateCase(simpleCase())]);
  const text = renderReport(s, watchedConfusionReport(s), { realImages: 0 });
  assert.match(text, /no hay capturas reales/i);
  assert.match(text, /NO validan/i);
  assert.match(text, /PDF/i);
  const withReal = renderReport(s, watchedConfusionReport(s), { realImages: 3 });
  assert.doesNotMatch(withReal, /no hay capturas reales/i);
});

test('una imagen ilegible no inventa métricas: se cuenta como fallo de imagen', () => {
  const W = 10, H = 10;
  const data = new Uint8ClampedArray(W * H * 4).fill(0);
  const r = evaluateCase({
    id: 'negra',
    image: { data, width: W, height: H },
    etiqueta: [[{ type: 'empty' }]],
    resolucion: { width: W, height: H },
    origen: 'sintetico',
  });
  assert.equal(r.ok, false);
  assert.equal(r.cells.length, 0);
  const s = summarizeCorpus([r]);
  assert.equal(s.imagesFailed, 1);
  assert.equal(s.accuracyOverAnswered, null, 'sin casillas evaluables no hay precisión que declarar');
});

test('discrepancia de dimensiones entre etiqueta y detección se informa', () => {
  const caso = synthCase({ id: 'DIM', layout: [['empty', 'gem']], cellPx: 48 });
  const wrong = { ...caso, etiqueta: [[{ type: 'empty' }]] };
  const r = evaluateCase(wrong);
  assert.ok(r.dimensionMismatch, 'debe detectarse que la etiqueta no encaja con la rejilla');
  assert.equal(r.dimensionMismatch.etiqueta, '1x1');
});

test('normalizeLabelGrid acepta etiquetas cortas y objetos completos', () => {
  const g = normalizeLabelGrid([['gem', { type: 'chest_wood', ambiguous: true, alternativas: ['chest_iron'] }]]);
  assert.deepEqual(g[0][0], { type: 'gem' });
  assert.equal(g[0][1].ambiguous, true);
});
