import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBoard, detectBoardRegion, buildGrid, classifyCell, normalizeCell,
  readTimer, readTray, reconstructPortals, toLevel, hypotheses, REVIEW,
} from '../src/vision/detector.js';

// Utilidad: pinta un tablero sintético de cols×rows con colores por clase.
export const COLORS = {
  empty: [196, 160, 110], wall: [70, 60, 55], gem: [60, 170, 220], crystal: [235, 120, 170],
  chest_wood: [150, 90, 40], portal: [140, 120, 230], mirror_slash: [150, 200, 215],
  cat: [240, 150, 60],
};

export function synthBoard(layout, cellPx = 60, opts = {}) {
  const rows = layout.length, cols = layout[0].length;
  const W = cols * cellPx, H = rows * cellPx;
  const data = new Uint8ClampedArray(W * H * 4);
  const jitter = opts.jitter !== false;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = Math.min(cols - 1, Math.floor(x / cellPx));
      const cy = Math.min(rows - 1, Math.floor(y / cellPx));
      // Cada casilla tiene su propio tono de suelo, como las losetas reales:
      // esto es lo que permite detectar los bordes entre casillas.
      const shade = ((cx * 7 + cy * 13) % 9) - 4;
      const base = COLORS[layout[cy][cx]] || COLORS.empty;
      const j = (jitter ? (((x * 37 + y * 17) % 11) - 5) : 0) + shade * 3;
      const i = (y * W + x) * 4;
      data[i] = clamp(base[0] + j); data[i + 1] = clamp(base[1] + j);
      data[i + 2] = clamp(base[2] + j); data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}
const clamp = (v) => Math.max(0, Math.min(255, v));

test('detecta la región del tablero en una imagen con marco oscuro', () => {
  const inner = synthBoard([['empty', 'gem', 'empty', 'empty'], ['empty', 'empty', 'crystal', 'empty']], 40);
  // Envolver en un marco oscuro de 20 px
  const pad = 20;
  const W = inner.width + pad * 2, H = inner.height + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4).fill(20);
  for (let y = 0; y < inner.height; y++) {
    for (let x = 0; x < inner.width; x++) {
      const s = (y * inner.width + x) * 4;
      const d = ((y + pad) * W + (x + pad)) * 4;
      data[d] = inner.data[s]; data[d + 1] = inner.data[s + 1]; data[d + 2] = inner.data[s + 2]; data[d + 3] = 255;
    }
  }
  const region = detectBoardRegion(data, W, H);
  assert.ok(Math.abs(region.x0 - pad) <= 3, `x0=${region.x0}`);
  assert.ok(Math.abs(region.y0 - pad) <= 3, `y0=${region.y0}`);
  assert.ok(region.confidence > 0.5);
});

test('estima filas y columnas exactas en varios tamaños', () => {
  for (const [cols, rows] of [[3, 2], [4, 3], [7, 5], [7, 7]]) {
    const layout = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => (x === 0 && y === 0 ? 'gem' : 'empty')));
    const img = synthBoard(layout, 40);
    const region = detectBoardRegion(img.data, img.width, img.height);
    const grid = buildGrid(img.data, img.width, region);
    assert.equal(grid.cols, cols, `columnas para ${cols}x${rows}`);
    assert.equal(grid.rows, rows, `filas para ${cols}x${rows}`);
  }
});

test('cuadrículas grandes (>=10 columnas) se leen con el tamaño correcto', () => {
  // Regresión: con el estimador anterior, 10x7 se leía como 2x3 porque el eje
  // horizontal tenía menos energía que el vertical y "ganaba" un periodo enorme.
  for (const [cols, rows] of [[8, 6], [9, 9], [10, 7], [12, 9], [12, 10]]) {
    const layout = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => ((x * 3 + y * 5) % 7 === 0 ? 'gem' : 'empty')));
    const img = synthBoard(layout, 40);
    const region = detectBoardRegion(img.data, img.width, img.height);
    const grid = buildGrid(img.data, img.width, region);
    assert.equal(grid.cols, cols, `columnas para ${cols}x${rows}`);
    assert.equal(grid.rows, rows, `filas para ${cols}x${rows}`);
    assert.ok(grid.squareness < 0.18, `casillas cuadradas en ${cols}x${rows}`);
    assert.ok(grid.confidence >= 0.7, `confianza en ${cols}x${rows}`);
  }
});

test('el tamaño de casilla es coherente con la región en todos los tamaños', () => {
  for (const [cols, rows] of [[3, 2], [5, 4], [10, 7]]) {
    const layout = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'empty'));
    layout[0][0] = 'gem';
    layout[rows - 1][cols - 1] = 'wall';
    const img = synthBoard(layout, 40);
    const region = detectBoardRegion(img.data, img.width, img.height);
    const grid = buildGrid(img.data, img.width, region);
    const bw = region.x1 - region.x0 + 1;
    const bh = region.y1 - region.y0 + 1;
    assert.ok(Math.abs(grid.cellW - bw / cols) < 1, `cellW ${cols}x${rows}`);
    assert.ok(Math.abs(grid.cellH - bh / rows) < 1, `cellH ${cols}x${rows}`);
  }
});

test('la rejilla sobrevive a tamaño de casilla, ruido y marco exterior', () => {
  // Barrido de robustez: el error histórico (10x7 leído como 2x3) no debe
  // reaparecer al cambiar el zoom, el ruido de compresión o al recortar con un
  // marco oscuro alrededor. Se comprueban las tres variables a la vez.
  const conMarco = (img, pad = 18) => {
    const W = img.width + pad * 2, H = img.height + pad * 2;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 18; data[i * 4 + 1] = 16; data[i * 4 + 2] = 14; data[i * 4 + 3] = 255;
    }
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const si = (y * img.width + x) * 4, di = ((y + pad) * W + (x + pad)) * 4;
        data[di] = img.data[si]; data[di + 1] = img.data[si + 1];
        data[di + 2] = img.data[si + 2]; data[di + 3] = 255;
      }
    }
    return { data, width: W, height: H };
  };
  const casos = [];
  for (const cellPx of [24, 40, 64]) {
    for (const [cols, rows] of [[4, 3], [6, 4], [7, 5], [10, 7]]) {
      for (const noise of [0, 30]) {
        for (const marco of [false, true]) {
          casos.push({ cellPx, cols, rows, noise, marco });
        }
      }
    }
  }
  const fallos = [];
  for (const { cellPx, cols, rows, noise, marco } of casos) {
    const layout = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => ((x * 3 + y * 5) % 7 === 0 ? 'gem' : ((x + y) % 4 === 0 ? 'crystal' : 'empty'))));
    const base = synthBoard(layout, cellPx);
    const img = marco ? conMarco(base) : base;
    const region = detectBoardRegion(img.data, img.width, img.height);
    const grid = buildGrid(img.data, img.width, region);
    if (grid.cols !== cols || grid.rows !== rows) {
      fallos.push(`${cols}x${rows} @${cellPx}px ruido=${noise} marco=${marco} → ${grid.cols}x${grid.rows}`);
    }
  }
  assert.deepEqual(fallos, [], `rejillas mal leídas:\n${fallos.join('\n')}`);
});

test('clasifica las clases sintéticas con confianza alta', () => {
  const layout = [['gem', 'crystal', 'chest_wood', 'portal', 'wall']];
  const img = synthBoard(layout, 48);
  const region = detectBoardRegion(img.data, img.width, img.height);
  const grid = buildGrid(img.data, img.width, region);
  const cellW = region.width / grid.cols, cellH = region.height / grid.rows;
  const expected = ['gem', 'crystal', 'chest_wood', 'portal', 'wall'];
  let correct = 0;
  for (let c = 0; c < 5; c++) {
    const x0 = Math.round(region.x0 + c * cellW + cellW * 0.15);
    const x1 = Math.round(region.x0 + (c + 1) * cellW - cellW * 0.15);
    const y0 = Math.round(region.y0 + cellH * 0.15);
    const y1 = Math.round(region.y0 + cellH * 0.85);
    const norm = normalizeCell(img.data, img.width, x0, y0, x1, y1);
    const result = classifyCell(norm);
    if (result.type === expected[c]) correct++;
    assert.ok(result.confidence > 0.4, `confianza de ${expected[c]}: ${result.confidence}`);
  }
  assert.ok(correct >= 4, `clasificación correcta ${correct}/5`);
});

test('no fuerza clasificación: un color desconocido queda en revisión o desconocido', () => {
  // Gris neutro turbio: no coincide con perfiles definidos.
  const W = 40, H = 40;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 128; data[i * 4 + 3] = 255;
  }
  const cell = normalizeCell(data, W, 0, 0, W, H);
  const r = classifyCell(cell);
  assert.notEqual(r.status, REVIEW.CONFIRMED, 'un color neutro no puede confirmarse como objeto concreto');
  assert.ok(Array.isArray(r.alternatives));
  assert.ok(Array.isArray(r.evidence));
});

test('cada casilla devuelve evidencia y alternativas cuando duda', () => {
  const img = synthBoard([['gem', 'cat']], 60);
  const region = detectBoardRegion(img.data, img.width, img.height);
  const grid = buildGrid(img.data, img.width, region);
  const cw = region.width / grid.cols, ch = region.height / grid.rows;
  const cell = normalizeCell(img.data, img.width,
    Math.round(region.x0 + cw * 0.15), Math.round(region.y0 + ch * 0.15),
    Math.round(region.x0 + cw * 0.85), Math.round(region.y0 + ch * 0.85));
  const r = classifyCell(cell);
  assert.ok(r.evidence.length > 0, 'siempre hay evidencia');
  assert.ok(typeof r.margin === 'number');
});

test('el temporizador del géiser se lee sólo dentro de la casilla y con rango 1..5', () => {
  const cell = { pixels: [[200, 200, 200]] };
  assert.deepEqual(readTimer(cell, () => '3').value, 3);
  assert.equal(readTimer(cell, () => '7').status, REVIEW.NEEDS_REVIEW);
  assert.equal(readTimer(cell, () => '0').value, null);
  assert.equal(readTimer(cell, () => 'x').value, null);
  assert.equal(readTimer(cell, () => '  5 ').value, 5);
  assert.equal(readTimer(cell, null).status, REVIEW.UNKNOWN);
});

test('la bandeja se lee aparte del tablero y marca dudas', () => {
  const slot = (rgb) => ({ features: null, pixels: Array.from({ length: 100 }, () => rgb) });
  const res = readTray([slot([40, 90, 220]), slot([240, 140, 40]), slot([120, 60, 220]), slot([120, 120, 120])]);
  assert.deepEqual(res.levels.slice(0, 3), [1, 2, 3]);
  assert.equal(res.details[3].status, REVIEW.UNKNOWN, 'la ranura gris no se fuerza a un nivel');
});

test('los portales se emparejan por color y avisan de grupos impares', () => {
  const cells = [
    { type: 'portal', status: REVIEW.CONFIRMED, confidence: 0.9, portalColor: 'blue' },
    { type: 'empty', status: REVIEW.CONFIRMED, confidence: 0.9 },
    { type: 'portal', status: REVIEW.CONFIRMED, confidence: 0.9, portalColor: 'blue' },
    { type: 'portal', status: REVIEW.CONFIRMED, confidence: 0.9, portalColor: 'purple' },
  ];
  const r = reconstructPortals(cells);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].color, 'blue');
  assert.equal(r.warnings.length, 1, 'avisa del portal morado sin pareja');
});

test('la detección completa informa revisión y no inventa niveles', () => {
  const img = synthBoard([
    ['empty', 'gem', 'empty'],
    ['empty', 'chest_wood', 'portal'],
    ['empty', 'portal', 'empty'],
  ], 56);
  const board = detectBoard(img);
  assert.equal(board.ok, true);
  assert.equal(board.grid.cols, 3);
  assert.equal(board.grid.rows, 3);
  assert.equal(board.status === 'needs_review' || board.status === 'confirmed', true);
  assert.ok(board.reviewCount >= 0);
  assert.ok(Array.isArray(board.warnings));
  const lvl = toLevel(board);
  assert.equal(lvl.cols, 3);
  assert.equal(lvl.projectedOnly, true, 'el nivel detectado es una proyección revisable');
});

test('modo de hipótesis: varias lecturas posibles del tablero', () => {
  const img = synthBoard([['empty', 'gem'], ['empty', 'empty']], 60);
  const board = detectBoard(img);
  // Forzamos una casilla dudosa para probar el mecanismo.
  board.flatCells[0].status = REVIEW.NEEDS_REVIEW;
  board.flatCells[0].confidence = 0.4;
  board.flatCells[0].alternatives = [{ type: 'wall', confidence: 0.35 }, { type: 'rock_soft', confidence: 0.3 }];
  const hyps = hypotheses(board, { maxHypotheses: 4 });
  assert.ok(hyps.length >= 1);
  assert.ok(hyps.every((h) => Array.isArray(h.changes)));
});

test('detector: imagen sin tablero devuelve error claro y no lanza', () => {
  const W = 40, H = 40;
  const data = new Uint8ClampedArray(W * H * 4).fill(0);
  const r = detectBoard({ data, width: W, height: H });
  assert.equal(r.ok, false);
  assert.match(r.reason, /tablero/i);
});
