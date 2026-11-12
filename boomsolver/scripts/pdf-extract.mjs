#!/usr/bin/env node
// ============================================================
// Extrae las imágenes de un PDF a PNG, sin dependencias
// ============================================================
// POR QUÉ
// -------
// El corpus real de visión son capturas del juego que llegan dentro de un PDF.
// Este proyecto se ejecuta con `node` a secas (sin `node_modules`), así que no
// hay ninguna librería de PDF: aquí se lee el contenedor a mano.
//
// QUÉ HACE
// --------
//  · recorre los objetos del PDF buscando los que son imagen (`/Subtype /Image`)
//  · guarda el filtro de cada uno (`DCTDecode` = JPEG dentro del PDF)
//  · para `DCTDecode` escribe el JPEG tal cual (un JPEG válido es un flujo
//    válido: el PDF sólo lo envuelve)
//  · para `FlateDecode` con 8 bits por componente, reconstruye los píxeles y
//    los guarda como PNG con el codificador del proyecto (`src/vision/png.js`)
//
// QUÉ NO HACE (y por qué es importante decirlo)
// ---------------------------------------------
// No interpreta el contenido de la página: no hay renderizado de texto ni de
// vectores. Si un PDF tiene el tablero dibujado en vectores en vez de en una
// imagen, aquí no aparece — y el script lo dice, no devuelve una imagen vacía.
// Tampoco convierte JPEG2000 (`JPXDecode`) ni imágenes de 1 o 4 bits.
//
// USO
// ---
//   node scripts/pdf-extract.mjs capturas.pdf --out=corpus/real/extraidas
//
// Imprime, por cada imagen, página aproximada, tamaño, filtro y fichero.

import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { encodePng } from '../src/vision/png.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Uso: node scripts/pdf-extract.mjs <archivo.pdf> [--out=DIR]');
  process.exit(1);
}
const outDir = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || 'corpus/real/extraidas';

const buf = fs.readFileSync(file);
if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
  console.error('No parece un PDF: falta la cabecera %PDF-');
  process.exit(1);
}

/**
 * Recorre los objetos `n g obj ... endobj`.
 *
 * El flujo de un objeto de imagen es binario, así que NO se puede parsear el
 * fichero como texto: se busca con índices de bytes y `/Length` del diccionario.
 */
function findStreams(buffer) {
  const latin = buffer.toString('latin1');
  const out = [];
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(latin)) !== null) {
    const objStart = m.index;
    const dictStart = re.lastIndex;
    const endObj = latin.indexOf('endobj', dictStart);
    if (endObj < 0) continue;
    const dict = latin.slice(dictStart, Math.min(endObj, dictStart + 4000));
    if (!/\/Subtype\s*\/Image/.test(dict)) continue;
    const streamKw = latin.indexOf('stream', dictStart);
    if (streamKw < 0 || streamKw > endObj) continue;

    // El flujo empieza tras "stream" + EOL (CRLF o LF).
    let dataStart = streamKw + 'stream'.length;
    if (buffer[dataStart] === 0x0d) dataStart++;
    if (buffer[dataStart] === 0x0a) dataStart++;

    // `/Length` puede ser un número directo o una referencia indirecta.
    let length = null;
    const lenMatch = dict.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/);
    if (lenMatch) {
      if (lenMatch[2]) {
        // Referencia indirecta: se busca ese objeto y su valor.
        const refNum = Number(lenMatch[2].trim().split(/\s+/)[0]);
        const refRe = new RegExp(`(^|[^0-9])${refNum}\\s+0\\s+obj\\s*(\\d+)`);
        const refHit = latin.match(refRe);
        length = refHit ? Number(refHit[2]) : null;
      } else {
        length = Number(lenMatch[1]);
      }
    }
    if (!length || dataStart + length > buffer.length) {
      // Fallback: hasta "endstream" (menos fiable, pero acotado).
      const endStream = latin.indexOf('endstream', dataStart);
      if (endStream < 0) continue;
      length = endStream - dataStart;
      while (length > 0 && (buffer[dataStart + length - 1] === 0x0a || buffer[dataStart + length - 1] === 0x0d)) length--;
    }

    out.push({
      objNum: Number(m[1]),
      dict,
      data: buffer.subarray(dataStart, dataStart + length),
    });
  }
  return out;
}

function dictNumber(dict, key, fallback = null) {
  const m = dict.match(new RegExp(`/${key}\\s+(\\d+)`));
  return m ? Number(m[1]) : fallback;
}

const streams = findStreams(buf);
if (!streams.length) {
  console.error('No se encontró ninguna imagen (/Subtype /Image) en el PDF.');
  console.error('Si el tablero está dibujado en vectores, este script no lo puede extraer:');
  console.error('hace falta una captura de pantalla de la página.');
  process.exit(2);
}

fs.mkdirSync(outDir, { recursive: true });
const manifest = [];
let n = 0;

for (const s of streams) {
  const { dict, data } = s;
  const width = dictNumber(dict, 'Width');
  const height = dictNumber(dict, 'Height');
  const bpc = dictNumber(dict, 'BitsPerComponent', 8);
  const cs = (dict.match(/\/ColorSpace\s*(\/\w+|\[[^\]]*\])/) || [])[1] || '?';
  const filter = (dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/) || [])[1] || '(ninguno)';
  const name = (dict.match(/\/Name\s*\/(\w+)/) || [])[1] || null;
  n++;
  const base = `img-${String(n).padStart(2, '0')}${name ? '-' + name : ''}`;

  let archivo = null;
  let nota = '';

  // Un mismo flujo puede llevar VARIOS filtros, y se decodifican en el orden en
  // que aparecen (p. ej. `[/FlateDecode /DCTDecode]` = descomprimir y luego ya
  // es un JPEG). Tratarlos como excluyentes producía ficheros .jpg que en
  // realidad eran zlib: la imagen "se extraía" y no se podía abrir.
  let payload = data;
  const filters = [];
  for (const f of String(filter).match(/\/\w+/g) || []) filters.push(f.slice(1));
  let soloFlate = false;
  for (const f of filters) {
    if (f === 'FlateDecode') {
      try {
        payload = inflateSync(payload);
        soloFlate = true;
      } catch (err) {
        nota = `Flate ilegible: ${err.message}`;
        payload = null;
        break;
      }
    }
  }

  if (payload && filters.includes('DCTDecode')) {
    archivo = path.join(outDir, `${base}.jpg`);
    fs.writeFileSync(archivo, payload);
    nota = `JPEG extraído${soloFlate ? ' (tras descomprimir Flate)' : ''}`;
  } else if (payload && /DCTDecode/.test(filter)) {
    nota = nota || 'JPEG ilegible';
  } else if (/FlateDecode/.test(filter)) {
    let raw = payload;
    if (raw === null) nota = nota || 'flujo comprimido ilegible';
    const canales = /RGB/.test(cs) ? 3 : (/Gray/.test(cs) ? 1 : (/CMYK/.test(cs) ? 4 : null));
    if (raw && canales && bpc === 8 && width && height && raw.length >= width * height * canales) {
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0, total = width * height; i < total; i++) {
        if (canales === 4) {
          // CMYK directo: conversión estándar (sin perfil de color).
          const c = raw[i * 4] / 255, mm = raw[i * 4 + 1] / 255, y = raw[i * 4 + 2] / 255, k = raw[i * 4 + 3] / 255;
          rgba[i * 4] = 255 * (1 - c) * (1 - k);
          rgba[i * 4 + 1] = 255 * (1 - mm) * (1 - k);
          rgba[i * 4 + 2] = 255 * (1 - y) * (1 - k);
        } else if (canales === 3) {
          rgba[i * 4] = raw[i * 3]; rgba[i * 4 + 1] = raw[i * 3 + 1]; rgba[i * 4 + 2] = raw[i * 3 + 2];
        } else {
          const g = raw[i]; rgba[i * 4] = g; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = g;
        }
        rgba[i * 4 + 3] = 255;
      }
      archivo = path.join(outDir, `${base}.png`);
      fs.writeFileSync(archivo, encodePng({ data: rgba, width, height }));
      nota = 'flujo Flate reconstruido a PNG';
    } else if (!nota) {
      nota = `Flate no soportado (canales=${canales}, bits=${bpc})`;
    }
  } else {
    nota = `filtro ${filter} no soportado`;
  }

  manifest.push({ n, objNum: s.objNum, width, height, bpc, colorSpace: cs, filter, archivo: archivo ? path.basename(archivo) : null, nota });
  console.log(`${archivo ? '✔' : '✖'} ${base.padEnd(26)} ${String(width).padStart(5)}x${String(height).padEnd(5)} `
    + `bits=${bpc} cs=${cs.replace(/\s+/g, '')} filtro=${filter.replace(/\s+/g, '')} ${nota}`);
}

const manifiesto = path.join(outDir, 'manifest.json');
fs.writeFileSync(manifiesto, JSON.stringify({ source: path.basename(file), images: manifest }, null, 2));
const ok = manifest.filter((m) => m.archivo).length;
console.log(`\n${ok}/${manifest.length} imágenes extraídas en ${outDir}`);
console.log(`Manifiesto: ${manifiesto}`);
if (ok === 0) process.exit(3);
