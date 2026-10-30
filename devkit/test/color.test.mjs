// Tests de la matemática de color contra valores conocidos (no autogenerados).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, composite, luminance, contrastRatio, wcagVerdict, apca, apcaVerdict, evaluatePair } from '../lib/color.mjs';

test('parseColor acepta los formatos que devuelve getComputedStyle', () => {
  assert.deepEqual(parseColor('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#0090ff'), { r: 0, g: 144, b: 255, a: 1 });
  assert.deepEqual(parseColor('#00000080').a, 128 / 255);
  assert.equal(parseColor('transparent').a, 0);
  assert.equal(parseColor('not-a-color'), null);
});

test('luminancia y contraste cumplen los valores de referencia WCAG', () => {
  assert.equal(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21);
  assert.equal(luminance({ r: 255, g: 255, b: 255 }), 1);
  assert.equal(luminance({ r: 0, g: 0, b: 0 }), 0);
  // #767676 sobre blanco es el gris mínimo AA documentado (4.54:1)
  const grey = parseColor('#767676');
  assert.ok(Math.abs(contrastRatio(grey, { r: 255, g: 255, b: 255 }) - 4.54) < 0.02);
});

test('el orden de los argumentos no altera el ratio', () => {
  const a = { r: 0, g: 144, b: 255 };
  const b = { r: 255, g: 255, b: 255 };
  assert.equal(contrastRatio(a, b), contrastRatio(b, a));
});

test('composite respeta el alfa', () => {
  const r = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(r, { r: 128, g: 128, b: 128, a: 1 });
  assert.deepEqual(composite({ r: 1, g: 2, b: 3, a: 1 }, { r: 9, g: 9, b: 9, a: 1 }), { r: 1, g: 2, b: 3, a: 1 });
});

test('wcagVerdict aplica el umbral de texto grande', () => {
  assert.equal(wcagVerdict(4.4).pass, false);
  assert.equal(wcagVerdict(4.4, { large: true }).pass, true);
  assert.equal(wcagVerdict(3.1, { large: true }).pass, true);
  assert.equal(wcagVerdict(3.1, { large: true, level: 'AAA' }).pass, false);
  assert.equal(wcagVerdict(7.1, { level: 'AAA' }).pass, true);
});

test('APCA da signo negativo con texto claro sobre fondo oscuro', () => {
  const blanco = { r: 255, g: 255, b: 255 };
  const negro = { r: 0, g: 0, b: 0 };
  const claroSobreOscuro = apca(blanco, negro);
  const oscuroSobreClaro = apca(negro, blanco);
  assert.ok(claroSobreOscuro < -90, `esperado < -90, fue ${claroSobreOscuro}`);
  assert.ok(oscuroSobreClaro > 90, `esperado > 90, fue ${oscuroSobreClaro}`);
  assert.equal(apca(negro, negro), 0);
});

test('APCA ordena correctamente grises intermedios', () => {
  const c = (v) => ({ r: v, g: v, b: v });
  const fuerte = Math.abs(apca(c(30), c(255)));
  const debil = Math.abs(apca(c(150), c(255)));
  assert.ok(fuerte > debil, 'más contraste debe dar Lc mayor');
  assert.match(apcaVerdict(95), /excelente/);
  assert.match(apcaVerdict(50), /titulares/);
  assert.match(apcaVerdict(10), /invisible/);
});

test('evaluatePair integra WCAG y APCA', () => {
  const r = evaluatePair('rgb(0, 144, 255)', 'rgb(255, 255, 255)');
  assert.ok(Math.abs(r.wcag.ratio - 3.26) < 0.02);
  assert.equal(r.wcag.pass, false);
  assert.ok(Number.isFinite(r.apca.lc));
  assert.equal(evaluatePair('nope', '#fff'), null);
});
