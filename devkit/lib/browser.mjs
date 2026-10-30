// browser.mjs — lanzador único de Chromium para todo el devkit.
// Resuelve el binario, las librerías NSS/NSPR compiladas y las fuentes del repo.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const CANDIDATE_LIBS = ['/home/user/lib', '/tmp/toolkit/lib'];
const CANDIDATE_CHROME = ['/tmp/chromium', '/tmp/toolkit/chromium'];
// Orden de búsqueda: permite que CI use exactamente las mismas fuentes que el sandbox.
const FONT_DIRS = [
  process.env.FONT_DIR,
  '/home/user/lib/fonts',
  path.resolve(import.meta.dirname, '../../toolkit/fonts'),
].filter(Boolean);
const FONT_DIR = FONT_DIRS.find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.ttf'))) || FONT_DIRS[1];

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
  'mobile-lg': { width: 430, height: 932 },
  og: { width: 1200, height: 630 },
};

export function resolveLibs() {
  for (const d of CANDIDATE_LIBS) {
    if (fs.existsSync(path.join(d, 'libnspr4.so'))) return d;
  }
  throw new Error(
    'Librerías NSS/NSPR no encontradas. Ejecuta: bash toolkit/bootstrap.sh',
  );
}

export function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const c of CANDIDATE_CHROME) if (fs.existsSync(c)) return c;
  // portabilidad: CI o máquinas con Chromium del sistema
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const p = execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'pipe' }).toString().trim();
      if (p) return p;
    } catch { /* sigue */ }
  }
  throw new Error('Chromium no encontrado. Ejecuta: bash toolkit/bootstrap.sh o define CHROME_PATH');
}

/** @font-face con cada TTF del repo, para que las capturas no usen la fuente por defecto del sandbox. */
export function fontFaceCss() {
  if (!fs.existsSync(FONT_DIR)) return '';
  // También expone la ruta usada, para poder auditarla en CI.
  fontFaceCss.dir = FONT_DIR;
  return fs.readdirSync(FONT_DIR)
    .filter((f) => f.endsWith('.ttf'))
    .map((f) => {
      const family = f.replace(/-latin-.*$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const weight = Number((f.match(/latin-(\d+)-/) || [])[1] || 400);
      return `@font-face{font-family:'${family}';src:url('file://${FONT_DIR}/${f}');font-weight:${weight};font-display:block}`;
    })
    .join('\n');
}

export async function launch({ width = 1440, height = 900, dpr = 1, lang = 'es-ES' } = {}) {
  const libs = resolveLibs();
  const executablePath = resolveChrome();
  process.env.LD_LIBRARY_PATH = [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const args = [
    ...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none',
    // permite que una página file:// cargue las fuentes locales del repo
    '--allow-file-access-from-files',
  ];
  const browser = await puppeteer.launch({
    args, executablePath, headless: 'shell', protocolTimeout: 120000,
    defaultViewport: { width, height, deviceScaleFactor: dpr },
  });
  return {
    browser,
    async newPage(extra = {}) {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: dpr, ...extra });
      await page.setExtraHTTPHeaders({ 'Accept-Language': lang });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      return page;
    },
    async close() { await browser.close(); },
  };
}

/** Carga una URL o un archivo local, esperando red y fuentes. */
export async function open(page, target) {
  const url = /^https?:\/\//.test(target) || target.startsWith('file://')
    ? target
    : `file://${path.resolve(target)}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return url;
}
