#!/usr/bin/env node
// tokens.mjs — genera un sistema de diseño real (no adivinado) a partir de @radix-ui/colors
// + escalas tipográficas modulares + retícula de espaciado. Salida determinista y versionable.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseColor, contrastRatio, composite, luminance } from '../lib/color.mjs';

const require = createRequire(import.meta.url);
const radix = require('@radix-ui/colors');

const OUT = process.argv[2] || path.join(import.meta.dirname, '..', 'reference');
fs.mkdirSync(OUT, { recursive: true });

// Escalas modulares: ratio clásico por familia de uso.
const SCALES = {
  '1.125': { name: 'major-second', use: 'UI compacta / dashboards densos' },
  '1.200': { name: 'minor-third', use: 'app estándar' },
  '1.250': { name: 'major-third', use: 'marketing / editorial' },
  '1.333': { name: 'perfect-fourth', use: 'landing de impacto' },
};

function modular(base, ratio, steps = 9) {
  const out = {};
  const names = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
  // de -2 a +6 respecto de base
  for (let i = -2; i <= 6; i++) {
    const v = base * Math.pow(ratio, i);
    out[names[i + 2]] = Number(v.toFixed(2));
  }
  return out;
}

// Retícula de espaciado base 4 (line-height friendly), escala no lineal tipo Tailwind.
const SPACING = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];

// Radix: 12 pasos con semántica documentada (1-2 fondos, 3-5 componentes, 6-8 bordes,
// 9-10 sólidos, 11-12 texto).
const FAMILIES = ['gray', 'blue', 'violet', 'green', 'amber', 'red', 'cyan', 'pink'];

/** Oscurece un color paso a paso hasta que el contraste con el texto objetivo cumpla AA. */
function makeAccessible(hexColor, targetRatio = 4.5, fg = '#ffffff') {
  const fgC = composite(parseColor(fg), { r: 0, g: 0, b: 0, a: 1 });
  let c = parseColor(hexColor);
  let factor = 1;
  for (let i = 0; i < 60; i++) {
    const cur = { r: Math.round(c.r * factor), g: Math.round(c.g * factor), b: Math.round(c.b * factor) };
    if (contrastRatio(cur, fgC) >= targetRatio) {
      return { hex: '#' + [cur.r, cur.g, cur.b].map((v) => v.toString(16).padStart(2, '0')).join(''), ratio: Number(contrastRatio(cur, fgC).toFixed(2)), adjusted: factor !== 1 };
    }
    factor -= 0.02;
    if (factor <= 0.1) break;
  }
  return { hex: '#000000', ratio: 21, adjusted: true };
}

/** Elige texto blanco o negro, el que más contraste dé sobre el sólido. */
function bestFg(bg) {
  const c = parseColor(bg);
  const w = contrastRatio({ r: 255, g: 255, b: 255 }, c);
  const b = contrastRatio({ r: 0, g: 0, b: 0 }, c);
  return w >= b ? { fg: '#ffffff', ratio: Number(w.toFixed(2)) } : { fg: '#000000', ratio: Number(b.toFixed(2)) };
}

function buildSolids(colors) {
  const solids = {};
  for (const fam of FAMILIES) {
    const base = colors[`${fam}-9`];
    if (!base) continue;
    const c = parseColor(base);
    const onWhite = contrastRatio({ r: 255, g: 255, b: 255 }, c);
    const onBlack = contrastRatio({ r: 0, g: 0, b: 0 }, c);
    // Política: el texto blanco es la convención en superficies de acento.
    // Solo se usa negro cuando el color es tan claro que el blanco sería ilegible
    // (amarillos, limas) y el negro sí cumple.
    if (onWhite >= 4.5) {
      solids[fam] = { base, solid: base, fg: '#ffffff', ratio: Number(onWhite.toFixed(2)), adjusted: false, policy: 'white' };
    } else if (onBlack >= 4.5 && luminance(c) > 0.35) {
      solids[fam] = { base, solid: base, fg: '#000000', ratio: Number(onBlack.toFixed(2)), adjusted: false, policy: 'black' };
    } else {
      const acc = makeAccessible(base, 4.5, '#ffffff');
      solids[fam] = { base, solid: acc.hex, fg: '#ffffff', ratio: acc.ratio, adjusted: true, policy: 'darkened' };
    }
  }
  return solids;
}

function build() {
  const light = {};
  const dark = {};
  const semantic = {};
  for (const fam of FAMILIES) {
    const l = radix[fam];
    const d = radix[`${fam}Dark`];
    if (!l || !d) continue;
    const lk = Object.keys(l);
    const dk = Object.keys(d);
    for (let i = 0; i < 12; i++) {
      light[`${fam}-${i + 1}`] = l[lk[i]];
      dark[`${fam}-${i + 1}`] = d[dk[i]];
    }
  }
  // Semántica: mapeo explícito de los 12 pasos (documentado por Radix)
  const roles = {
    1: 'app-bg', 2: 'subtle-bg', 3: 'ui-bg', 4: 'ui-bg-hover', 5: 'ui-bg-active',
    6: 'border-subtle', 7: 'border', 8: 'border-strong',
    9: 'solid', 10: 'solid-hover', 11: 'text-subtle', 12: 'text',
  };
  for (const [step, role] of Object.entries(roles)) {
    semantic[`--${role}`] = `var(--gray-${step})`;
    semantic[`--${role}-accent`] = `var(--blue-${step})`;
  }
  // Los sólidos apuntan a la variante calculada que SÍ cumple AA con su texto.
  semantic['--solid-accent'] = 'var(--access-solid-blue)';
  semantic['--solid-hover-accent'] = 'var(--access-solid-hover-blue)';
  semantic['--solid-fg-accent'] = 'var(--access-fg-blue)';
  const solids = buildSolids(light);
  const solidsDark = buildSolids(dark);
  return { light, dark, semantic, solids, solidsDark };
}

const { light, dark, semantic, solids, solidsDark } = build();
const type = Object.fromEntries(Object.entries(SCALES).map(([r, m]) => [r, { ...m, scale: modular(16, Number(r)) }]));

let css = `/* GENERADO por devkit/bin/tokens.mjs — no editar a mano.\n   Fuente: @radix-ui/colors (MIT). Escalas modulares sobre base 16px. */\n:root{\n`;
for (const [k, v] of Object.entries(light)) css += `  --${k}: ${v};\n`;
css += `\n  /* sólidos accesibles: calculados para cumplir WCAG AA con su texto */\n`;
for (const [fam, s] of Object.entries(solids)) {
  css += `  --access-solid-${fam}: ${s.solid};\n  --access-fg-${fam}: ${s.fg};\n`;
  if (s.adjusted) {
    const darker = makeAccessible(s.solid, 5.5, s.fg);
    css += `  --access-solid-hover-${fam}: ${darker.hex};\n`;
  } else {
    css += `  --access-solid-hover-${fam}: ${s.solid};\n`;
  }
}
for (const [k, v] of Object.entries(semantic)) css += `  ${k}: ${v};\n`;
css += `\n  /* espaciado (4px grid) */\n`;
SPACING.forEach((v, i) => { css += `  --space-${i}: ${v}px;\n`; });
css += `  --space-px: 1px; --space-half: 2px; /* trazos y hairlines: fuera de la retícula a propósito */\n`;
css += `\n  /* tipografía: major-third (app estándar) */\n`;
for (const [k, v] of Object.entries(type['1.200'].scale)) css += `  --text-${k}: ${v}px;\n`;
css += `\n  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;\n  --font-mono: 'JetBrains Mono', ui-monospace, monospace;\n`;
css += `  --radius-sm: 6px; --radius: 10px; --radius-lg: 16px; --radius-xl: 24px; --radius-full: 9999px;\n`;
css += `  --shadow-sm: 0 1px 2px rgb(0 0 0 / .06), 0 1px 3px rgb(0 0 0 / .10);\n  --shadow: 0 4px 12px rgb(0 0 0 / .08), 0 2px 4px rgb(0 0 0 / .06);\n  --shadow-lg: 0 12px 32px rgb(0 0 0 / .14), 0 4px 8px rgb(0 0 0 / .08);\n`;
css += `  --ease-out: cubic-bezier(.16,1,.3,1); --ease-in-out: cubic-bezier(.65,0,.35,1);\n  --dur-fast: 120ms; --dur: 200ms; --dur-slow: 320ms;\n}\n\n[data-theme="dark"]{\n`;
for (const [k, v] of Object.entries(dark)) css += `  --${k}: ${v};\n`;
for (const [fam, s] of Object.entries(solidsDark)) css += `  --access-solid-${fam}: ${s.solid};\n  --access-fg-${fam}: ${s.fg};\n`;
css += `}\n\n@media (prefers-reduced-motion: reduce){\n  :root{--dur-fast:0ms;--dur:0ms;--dur-slow:0ms}\n}\n`;

fs.writeFileSync(path.join(OUT, 'tokens.css'), css);
fs.writeFileSync(path.join(OUT, 'tokens.json'), JSON.stringify({ colors: { light, dark }, semantic, solids, solidsDark, spacing: SPACING, type }, null, 2));

// Tarjeta visual del sistema, autogenerada: sirve como prueba de que los tokens son usables.
const families = FAMILIES.filter((f) => light[`${f}-9`]);
const swatchRows = families
  .map((f) => `<div class="row"><b>${f}</b>${Array.from({ length: 12 }, (_, i) => `<i style="background:var(--${f}-${i + 1})" title="${i + 1}"></i>`).join('')}</div>`)
  .join('\n');
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Design tokens</title>
<link rel="stylesheet" href="tokens.css">
<style>
body{margin:0;padding:48px;background:var(--app-bg);color:var(--text);font-family:var(--font-sans);max-width:1100px}
h1{font-size:var(--text-3xl);letter-spacing:-.02em;margin:0 0 8px}
p.lead{color:var(--text-subtle);font-size:var(--text-lg);margin:0 0 40px}
h2{font-size:var(--text-xl);margin:40px 0 16px}
.row{display:flex;align-items:center;gap:4px;margin-bottom:6px}
.row b{width:80px;font:600 13px var(--font-mono);color:var(--text-subtle)}
.row i{flex:1;height:36px;border-radius:var(--radius-sm);display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{background:var(--ui-bg);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow-sm)}
.card h3{margin:0 0 4px;font-size:var(--text-base)}.card p{margin:0;color:var(--text-subtle);font-size:var(--text-sm)}
.btn{display:inline-block;padding:10px 16px;border-radius:var(--radius);background:var(--solid-accent);color:#fff;font-weight:600;font-size:var(--text-sm)}
.scale{display:flex;align-items:baseline;gap:20px;flex-wrap:wrap}
</style></head><body>
<h1>Sistema de tokens</h1>
<p class="lead">${families.length} familias × 12 pasos semánticos · retícula 4px · escala modular 1.200</p>
<h2>Paleta (Radix, 12 pasos)</h2>
${swatchRows}
<h2>Escala tipográfica</h2>
<div class="scale">${Object.entries(type['1.200'].scale).map(([k, v]) => `<span style="font-size:${v}px">${k} ${v}</span>`).join('')}</div>
<h2>Componentes</h2>
<div class="grid">
  <div class="card"><h3>Card</h3><p>superficie + borde sutil + sombra</p></div>
  <div class="card"><h3>Botón</h3><p><span class="btn">Acción</span></p></div>
  <div class="card"><h3>Texto</h3><p>11 = secundario · 12 = principal</p></div>
</div>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'tokens.html'), html);

console.log(`tokens.css   ${(css.length / 1024).toFixed(1)} KB`);
console.log(`tokens.json  ${Object.keys(light).length} colores × 2 temas`);
console.log(`tokens.html  tarjeta visual`);
const fixed = Object.entries(solids).filter(([, s]) => s.adjusted);
console.log(`sólidos corregidos para AA: ${fixed.length}/${Object.keys(solids).length}`);
for (const [fam, s] of fixed) console.log(`  ${fam}: ${s.base} -> ${s.solid} (${s.ratio}:1 con ${s.fg})`);
