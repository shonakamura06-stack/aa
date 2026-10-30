// Verifica que el sistema de tokens generado sea internamente coherente y accesible.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { contrastRatio, parseColor } from '../lib/color.mjs';

const REF = path.join(import.meta.dirname, '..', 'reference');
const tokens = JSON.parse(fs.readFileSync(path.join(REF, 'tokens.json'), 'utf8'));
const css = fs.readFileSync(path.join(REF, 'tokens.css'), 'utf8');

test('cada familia aporta 12 pasos en ambos temas', () => {
  const light = Object.keys(tokens.colors.light);
  assert.ok(light.length >= 96, `esperado ≥96 colores, hay ${light.length}`);
  for (const fam of ['gray', 'blue', 'green']) {
    for (let i = 1; i <= 12; i++) {
      assert.ok(tokens.colors.light[`${fam}-${i}`], `falta ${fam}-${i} en claro`);
      assert.ok(tokens.colors.dark[`${fam}-${i}`], `falta ${fam}-${i} en oscuro`);
    }
  }
});

test('todos los sólidos generados cumplen AA con su texto asignado', () => {
  for (const theme of ['solids', 'solidsDark']) {
    for (const [fam, s] of Object.entries(tokens[theme])) {
      const fg = parseColor(s.fg);
      const bg = parseColor(s.solid);
      const ratio = contrastRatio(fg, bg);
      assert.ok(ratio >= 4.5, `${theme}/${fam}: ${s.solid} con ${s.fg} = ${ratio.toFixed(2)}:1`);
      // el valor declarado debe coincidir con el recalculado
      assert.ok(Math.abs(ratio - s.ratio) < 0.05, `${fam}: ratio declarado ${s.ratio} != ${ratio.toFixed(2)}`);
    }
  }
});

test('el CSS declara las variables que consume la semántica', () => {
  const declared = new Set([...css.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
  const used = [...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
  const missing = used.filter((v) => !declared.has(v));
  assert.deepEqual(missing, [], `variables usadas pero no declaradas: ${missing.join(', ')}`);
});

test('la escala tipográfica es monótona y sin colisiones', () => {
  const scale = Object.entries(tokens.type['1.200'].scale);
  for (let i = 1; i < scale.length; i++) {
    assert.ok(scale[i][1] > scale[i - 1][1], `${scale[i][0]} no supera a ${scale[i - 1][0]}`);
    const ratio = scale[i][1] / scale[i - 1][1];
    assert.ok(ratio >= 1.15, `paso ${scale[i][0]} demasiado próximo (${ratio.toFixed(2)})`);
  }
});

test('el espaciado es una retícula de 4px creciente', () => {
  const s = tokens.spacing;
  assert.equal(s[0], 0);
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i] > s[i - 1], 'el espaciado debe crecer');
    assert.equal(s[i] % 4, 0, `${s[i]} no es múltiplo de 4`);
  }
});

test('el tema oscuro redefine los colores de superficie y texto', () => {
  // En Radix los pasos 9–10 (sólidos) son idénticos en ambos temas por diseño;
  // los pasos 1–8 y 11–12 deben cambiar para que el tema sea real.
  let redefinidos = 0;
  for (const k of Object.keys(tokens.colors.light)) {
    assert.ok(tokens.colors.dark[k], `falta ${k} en el tema oscuro`);
    const step = Number(k.split('-')[1]);
    if (step === 9 || step === 10) continue;
    assert.notEqual(tokens.colors.light[k], tokens.colors.dark[k], `${k} es idéntico en ambos temas`);
    redefinidos++;
  }
  assert.ok(redefinidos >= 64, `esperados ≥64 colores redefinidos, hubo ${redefinidos}`);
});
