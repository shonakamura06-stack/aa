// vdiff.mjs — regresión visual real: baseline en disco, diff por píxel, umbral configurable.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export function diffImages(aPath, bPath, { out, threshold = 0.1, includeAA = false, alpha = 0.15 } = {}) {
  const a = PNG.sync.read(fs.readFileSync(aPath));
  const b = PNG.sync.read(fs.readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    return {
      ok: false, reason: 'size-mismatch',
      a: { w: a.width, h: a.height }, b: { w: b.width, h: b.height },
      mismatched: -1, ratio: 1,
    };
  }
  const outPng = new PNG({ width: a.width, height: a.height });
  const mismatched = pixelmatch(a.data, b.data, outPng.data, a.width, a.height, { threshold, includeAA, alpha, diffColor: [255, 0, 80] });
  const tag = out || `${aPath.replace(/\.png$/, '')}.diff.png`;
  fs.writeFileSync(tag, PNG.sync.write(outPng));
  const total = a.width * a.height;
  return {
    ok: mismatched === 0, mismatched, total, ratio: Number((mismatched / total).toFixed(6)), diffPath: tag,
    size: { w: a.width, h: a.height },
  };
}

/** Guarda/actualiza una baseline. */
export function saveBaseline(dir, name, pngPath) {
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${name}.png`);
  fs.copyFileSync(pngPath, dest);
  return dest;
}

export function readBaseline(dir, name) {
  const p = path.join(dir, `${name}.png`);
  return fs.existsSync(p) ? p : null;
}
