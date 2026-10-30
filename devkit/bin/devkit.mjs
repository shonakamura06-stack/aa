#!/usr/bin/env node
// devkit — CLI del entorno de desarrollo del sandbox.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, open, VIEWPORTS, resolveChrome, resolveLibs, fontFaceCss } from '../lib/browser.mjs';
import { auditTarget } from '../lib/design-audit.mjs';
import { renderMarkdown, summarizeJson } from '../lib/report.mjs';
import { diffImages, saveBaseline, readBaseline } from '../lib/vdiff.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !arr[i - 1]?.startsWith('--'));
const ROOT = path.join(import.meta.dirname, '..');

function doctor() {
  const checks = [];
  const ok = (name, detail) => checks.push({ name, detail, status: 'ok' });
  const bad = (name, detail) => checks.push({ name, detail, status: 'fail' });
  const warn = (name, detail) => checks.push({ name, detail, status: 'warn' });

  try { resolveLibs(); ok('librerías NSS/NSPR', resolveLibs()); } catch (e) { bad('librerías NSS/NSPR', e.message); }
  try { ok('chromium', resolveChrome()); } catch (e) { bad('chromium', e.message); }
  const fonts = fs.existsSync('/home/user/lib/fonts') ? fs.readdirSync('/home/user/lib/fonts').length : 0;
  fonts ? ok('fuentes', `${fonts} TTF`) : warn('fuentes', 'sin fuentes locales');

  for (const mod of ['puppeteer-core', 'axe-core', 'pixelmatch', 'lighthouse', 'satori', '@resvg/resvg-js', '@ffmpeg-installer/ffmpeg']) {
    try {
      const p = path.join(ROOT, 'node_modules', mod, 'package.json');
      fs.existsSync(p) ? ok(mod, JSON.parse(fs.readFileSync(p)).version) : warn(mod, 'no instalado');
    } catch { warn(mod, 'no verificable'); }
  }
  const has = (bin) => {
    try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'pipe' }); return true; } catch { return false; }
  };
  for (const b of ['git', 'node', 'python3', 'gcc', 'gh']) has(b) ? ok(`bin ${b}`, 'presente') : bad(`bin ${b}`, 'ausente');
  for (const b of ['docker', 'ffmpeg', 'pandoc', 'psql']) has(b) ? ok(`bin ${b}`, 'presente') : warn(`bin ${b}`, 'ausente (ver toolkit/README)');

  const filt = flag('json');
  if (filt) { console.log(JSON.stringify(checks, null, 2)); return; }
  const icon = { ok: '✅', fail: '🔴', warn: '🟡' };
  for (const c of checks) console.log(`${icon[c.status]} ${c.name.padEnd(28)} ${c.detail}`);
  const fails = checks.filter((c) => c.status === 'fail').length;
  console.log(`\n${checks.length - fails}/${checks.length} verificaciones OK`);
  process.exitCode = fails ? 1 : 0;
}

async function shot() {
  const target = positional[0];
  if (!target) throw new Error('uso: devkit shot <url|archivo> [--viewport mobile] [--out x.png] [--full] [--dark]');
  const vpName = arg('viewport', 'desktop');
  const vp = VIEWPORTS[vpName] || VIEWPORTS.desktop;
  const out = arg('out', `/tmp/shot-${vpName}.png`);
  const b = await launch(vp);
  const page = await b.newPage();
  await page.addStyleTag({ content: fontFaceCss() }).catch(() => {});
  if (flag('dark')) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await open(page, target);
  const t0 = Date.now();
  await page.screenshot({ path: out, fullPage: flag('full') });
  await b.close();
  console.log(JSON.stringify({ out, viewport: vp, ms: Date.now() - t0, bytes: fs.statSync(out).size }));
}

async function audit() {
  const target = positional[0];
  if (!target) throw new Error('uso: devkit audit <url|archivo> [--viewport mobile] [--lighthouse] [--json]');
  const vpName = arg('viewport', 'desktop');
  const vp = VIEWPORTS[vpName] || VIEWPORTS.desktop;
  const b = await launch(vp);
  const page = await b.newPage();
  await open(page, target);
  const result = await auditTarget(page, target);
  const pngPath = `/tmp/audit-${vpName}.png`;
  await page.screenshot({ path: pngPath, fullPage: flag('full') });

  // axe-core: auditoría de accesibilidad de referencia
  let axe = null;
  try {
    const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
    await page.evaluate(axeSrc);
    axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'], runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
    });
  } catch (e) { axe = { error: e.message }; }
  await b.close();

  let lighthouse = null;
  if (flag('lighthouse')) lighthouse = await runLighthouse(target);

  const json = summarizeJson(result, { target, viewport: vp, lighthouse, axe, screenshot: pngPath });
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  const base = path.join(ROOT, 'reports', `audit-${Date.now()}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(json, null, 2));
  const md = renderMarkdown(result, { target, viewport: vp, lighthouse });
  const axeMd = axe && Array.isArray(axe) && axe.length
    ? `\n## axe-core (WCAG 2.1 AA)\n\n| Regla | Impacto | Nodos | Descripción |\n|---|---|---:|---|\n${axe.map((v) => `| \`${v.id}\` | ${v.impact} | ${v.nodes} | ${v.help} |`).join('\n')}\n`
    : axe && Array.isArray(axe) ? '\n## axe-core\n\nSin violaciones WCAG 2.1 AA.\n' : '';
  fs.writeFileSync(`${base}.md`, md + axeMd);
  console.log(flag('json') ? JSON.stringify(json, null, 2) : `${base}.md\n${base}.json\n${pngPath}\nscore ${result.summary.score}/100`);
}

async function runLighthouse(target) {
  const { default: lighthouse } = await import('lighthouse');
  const cl = await import('chrome-launcher');
  const libs = resolveLibs();
  process.env.LD_LIBRARY_PATH = `${libs}:${process.env.LD_LIBRARY_PATH || ''}`;
  const chrome = await cl.launch({ chromePath: resolveChrome(), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const url = /^https?:\/\//.test(target) ? target : null;
    if (!url) return { error: 'lighthouse requiere una URL http' };
    const r = await lighthouse(url, { port: chrome.port, output: 'json', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
    const a = r.lhr.audits;
    return {
      scores: Object.fromEntries(Object.entries(r.lhr.categories).map(([k, v]) => [k, v.score])),
      metrics: {
        LCP: a['largest-contentful-paint']?.displayValue,
        FCP: a['first-contentful-paint']?.displayValue,
        CLS: a['cumulative-layout-shift']?.displayValue,
        TBT: a['total-blocking-time']?.displayValue,
        'Speed Index': a['speed-index']?.displayValue,
      },
    };
  } finally { await chrome.kill(); }
}

async function vdiff() {
  const name = positional[0];
  const target = positional[1] || arg('target');
  if (!name || !target) throw new Error('uso: devkit vdiff <nombre> <url|archivo> [--update] [--viewport mobile] [--threshold 0.1]');
  const vpName = arg('viewport', 'desktop');
  const vp = VIEWPORTS[vpName] || VIEWPORTS.desktop;
  const b = await launch(vp);
  const page = await b.newPage();
  await page.addStyleTag({ content: fontFaceCss() }).catch(() => {});
  await open(page, target);
  const cur = `/tmp/vdiff-${name}-${vpName}.png`;
  await page.screenshot({ path: cur, fullPage: flag('full') });
  await b.close();
  const dir = path.join(ROOT, 'baselines');
  const bl = readBaseline(dir, `${name}-${vpName}`);
  if (!bl || flag('update')) {
    const dest = saveBaseline(dir, `${name}-${vpName}`, cur);
    console.log(JSON.stringify({ mode: bl ? 'updated' : 'created', baseline: dest, size: fs.statSync(dest).size }));
    return;
  }
  const res = diffImages(bl, cur, { threshold: Number(arg('threshold', '0.1')) });
  console.log(JSON.stringify({ ok: res.ok, mismatched: res.mismatched, ratio: res.ratio, diffPath: res.diffPath }));
  if (!res.ok) process.exitCode = 2;
}

async function pdf() {
  const target = positional[0];
  const out = arg('out', '/tmp/page.pdf');
  const b = await launch({ width: 1280, height: 900 });
  const page = await b.newPage();
  await open(page, target);
  await page.pdf({ path: out, format: arg('format', 'A4'), printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  await b.close();
  console.log(JSON.stringify({ out, bytes: fs.statSync(out).size }));
}

async function render() {
  // reutiliza la plantilla de cartel del toolkit
  const tpl = path.join(ROOT, 'templates', arg('template', 'poster.mjs'));
  execFileSync('node', [tpl, ...positional], { stdio: 'inherit', env: process.env });
}

async function check() {
  // Gate para CI: falla si empeora el umbral. Diseñado para ser el paso que bloquea un merge.
  const target = positional[0];
  if (!target) throw new Error('uso: devkit check <url|archivo> [--max-errors 0] [--min-score 90] [--viewport mobile]');
  const vpName = arg('viewport', 'desktop');
  const vp = VIEWPORTS[vpName] || VIEWPORTS.desktop;
  const maxErrors = Number(arg('max-errors', '0'));
  const maxWarnings = Number(arg('max-warnings', '9999'));
  const minScore = Number(arg('min-score', '0'));
  const b = await launch(vp);
  const page = await b.newPage();
  await open(page, target);
  const r = await auditTarget(page, target);
  await b.close();
  const { error, warning, score } = r.summary;
  const fallos = [];
  if (error > maxErrors) fallos.push(`${error} errores (máx ${maxErrors})`);
  if (warning > maxWarnings) fallos.push(`${warning} advertencias (máx ${maxWarnings})`);
  if (score < minScore) fallos.push(`puntuación ${score} < ${minScore}`);
  const detalle = r.findings.filter((f) => f.severity === 'error').map((f) => `  · ${f.id}: ${f.title}`).join('\n');
  if (fallos.length) {
    console.error(`FALLO en ${target} (${vpName}): ${fallos.join(' | ')}`);
    if (detalle) console.error(detalle);
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${target} (${vpName}) · errores ${error} · advertencias ${warning} · puntuación ${score}`);
}

const HELP = `devkit — entorno de desarrollo verificado del sandbox

  devkit doctor [--json]                 verifica navegador, librerías, fuentes y herramientas
  devkit shot <url|archivo> [opciones]   captura de pantalla real en Chromium
      --viewport desktop|laptop|tablet|mobile|mobile-lg|og   --out ruta.png  --full  --dark
  devkit audit <url|archivo> [opciones]  auditoría medida: contraste WCAG+APCA, escala tipográfica,
      retícula de espaciado, tap targets, overflow, foco, imágenes, estructura + axe-core
      --viewport <vp>  --lighthouse  --json  --full
  devkit check <url> [opciones]          gate de CI: falla si se superan umbrales
      --max-errors 0  --max-warnings 5  --min-score 90  --viewport <vp>
  devkit vdiff <nombre> <url>            regresión visual contra baseline (--update para fijarla)
  devkit pdf <url> [--out x.pdf]         PDF real de la página renderizada
  devkit render [--template poster.mjs]  diseño gráfico vía satori -> PNG
  devkit tokens                          regenera reference/tokens.{css,json,html}
  devkit list                            lista baselines y reportes
`;

const commands = {
  doctor, shot, audit, check, vdiff, pdf, render,
  tokens: () => execFileSync('node', [path.join(ROOT, 'bin/tokens.mjs')], { stdio: 'inherit' }),
  list: () => {
    for (const d of ['baselines', 'reports']) {
      const p = path.join(ROOT, d);
      const files = fs.existsSync(p) ? fs.readdirSync(p).filter((f) => !f.startsWith('.')) : [];
      console.log(`\n${d}/ (${files.length})\n  ${files.slice(-12).join('\n  ') || '(vacío)'}`);
    }
  },
};

if (!cmd || cmd === 'help' || cmd === '--help') { console.log(HELP); process.exit(0); }
if (!commands[cmd]) { console.error(`comando desconocido: ${cmd}\n\n${HELP}`); process.exit(1); }
Promise.resolve(commands[cmd]()).catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
