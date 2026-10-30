// Tests de integración: el motor debe encontrar los defectos sembrados en bad.html
// y no debe inventar ninguno en good.html. Se saltan si no hay navegador disponible.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

let browserMod;
let disponible = true;
try {
  browserMod = await import('../lib/browser.mjs');
  browserMod.resolveChrome(); // basta con tener un navegador: las libs son opcionales
  // comprobar que el lanzador funciona de verdad, no solo que el binario exista
  const probe = await browserMod.launch({ width: 400, height: 300 });
  await probe.close();
} catch {
  disponible = false;
}
const t = disponible ? test : test.skip;
const FIX = path.join(import.meta.dirname, 'fixtures');

async function auditar(file, vp = { width: 390, height: 844 }) {
  const { launch, open } = browserMod;
  const { auditTarget } = await import('../lib/design-audit.mjs');
  const b = await launch(vp);
  const page = await b.newPage();
  await open(page, path.join(FIX, file));
  const r = await auditTarget(page, file);
  await b.close();
  return r;
}

t('detecta los defectos sembrados en la interfaz mala', async () => {
  const r = await auditar('bad.html');
  const ids = new Set(r.findings.map((f) => f.id));
  for (const esperado of [
    'contrast-wcag', 'tap-targets-aa', 'img-alt', 'heading-skip',
    'h-scroll', 'no-viewport-meta', 'no-lang', 'no-meta-description', 'spacing-no-grid', 'no-focus',
  ]) {
    assert.ok(ids.has(esperado), `no detectó ${esperado}. Encontró: ${[...ids].join(', ')}`);
  }
  assert.ok(r.summary.score < 20, `la interfaz mala debería puntuar bajo, puntuó ${r.summary.score}`);
  assert.ok(r.summary.error >= 6, `esperados ≥6 errores, hubo ${r.summary.error}`);
});

t('el contraste detectado coincide con la matemática WCAG', async () => {
  const r = await auditar('bad.html');
  const c = r.findings.find((f) => f.id === 'contrast-wcag');
  assert.ok(c, 'no hay hallazgo de contraste');
  const m = c.title.match(/([\d.]+):1/);
  assert.ok(m, `no se pudo leer el ratio de "${c.title}"`);
  const ratio = Number(m[1]);
  assert.ok(ratio > 1 && ratio < 4.5, `ratio fuera de rango esperado: ${ratio}`);
});

t('la interfaz construida con tokens no tiene errores', async () => {
  const r = await auditar('good.html');
  const errores = r.findings.filter((f) => f.severity === 'error');
  assert.deepEqual(errores.map((e) => `${e.id}: ${e.title}`), []);
  assert.equal(r.summary.score, 100, `esperado 100, fue ${r.summary.score}`);
});

t('el análisis es determinista entre ejecuciones', async () => {
  const a = await auditar('good.html', { width: 1280, height: 800 });
  const b = await auditar('good.html', { width: 1280, height: 800 });
  assert.deepEqual(a.findings, b.findings);
  assert.deepEqual(a.summary, b.summary);
});

t('rechaza analizar un objetivo inexistente en vez de fingir éxito', async () => {
  if (!disponible) return;
  const { launch } = browserMod;
  const b = await launch({ width: 800, height: 600 });
  const page = await b.newPage();
  await assert.rejects(() => page.goto(`file://${path.join(FIX, 'no-existe.html')}`));
  await b.close();
});

t('reporta métricas estructurales reales del documento', async () => {
  const r = await auditar('good.html', { width: 1280, height: 800 });
  assert.ok(r.raw.counts.elements > 20);
  assert.ok(Object.keys(r.raw.sizes).length >= 5, 'debería haber varios tamaños de texto');
  assert.equal(r.raw.doc.horizontalScroll, false);
  assert.ok(r.raw.focus.withFocusStyle > 0, 'good.html define :focus-visible');
  assert.ok(r.raw.meta.viewportMeta.includes('width=device-width'));
});
