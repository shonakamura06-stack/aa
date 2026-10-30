// poster.mjs — diseño gráfico real sin navegador: HTML-flexbox → SVG → PNG.
// Uso: node toolkit/templates/poster.mjs  (requiere: npm i satori @resvg/resvg-js)
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';

const F = '/home/user/lib/fonts';
const font = (f) => fs.readFileSync(`${F}/${f}`);
const fonts = [
  { name: 'Inter', data: font('inter-latin-400-normal.ttf'), weight: 400, style: 'normal' },
  { name: 'Inter', data: font('inter-latin-700-normal.ttf'), weight: 700, style: 'normal' },
  { name: 'Inter', data: font('inter-latin-900-normal.ttf'), weight: 900, style: 'normal' },
  { name: 'Space Grotesk', data: font('space-grotesk-latin-700-normal.ttf'), weight: 700, style: 'normal' },
];

// Satori acepta un subconjunto real de CSS: flexbox, gap, padding, gradientes, border-radius,
// box-shadow, opacity, transform, line-height, letter-spacing. NO acepta: grid, float, :hover.
const tree = {
  type: 'div',
  props: {
    style: {
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      background: 'linear-gradient(160deg,#05070d 0%,#101a3a 55%,#1e2a5e 100%)',
      padding: 64, justifyContent: 'space-between', color: '#fff', fontFamily: 'Inter',
      position: 'relative',
    },
    children: [
      { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [
        { type: 'div', props: { style: { display: 'flex', width: 14, height: 14, borderRadius: 4, background: '#4f7cff' } } },
        { type: 'div', props: { style: { display: 'flex', fontSize: 18, letterSpacing: 4, color: '#9fb3ff' }, children: 'ARENA · AGENT MODE' } },
      ] } },
      { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [
        { type: 'div', props: { style: { display: 'flex', fontFamily: 'Space Grotesk', fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }, children: 'Diseño renderizado' } },
        { type: 'div', props: { style: { display: 'flex', fontSize: 76, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2, color: '#4f7cff' }, children: 'sin navegador.' } },
        { type: 'div', props: { style: { display: 'flex', fontSize: 22, color: '#8ea0c9', marginTop: 16, maxWidth: 760 }, children: 'Satori interpreta flexbox y lo rasteriza con resvg. Mismo pipeline que usa Vercel para generar imágenes OG.' } },
      ] } },
      { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#5b6b93' }, children: [
        { type: 'div', props: { style: { display: 'flex' }, children: '1200 × 630 · PNG @1x' } },
        { type: 'div', props: { style: { display: 'flex' }, children: 'inter · space grotesk · resvg' } },
      ] } },
    ],
  },
};

const svg = await satori(tree, { width: 1200, height: 630, fonts });
fs.writeFileSync('/tmp/poster.svg', svg);
fs.writeFileSync('/tmp/poster.png', new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng());
console.log('listo: /tmp/poster.png');
