// ============================================================
// BoomSolver — lector de PNG sin dependencias
// ============================================================
// POR QUÉ EXISTE
// -------------
// Para validar el detector hacen falta capturas REALES del juego, y las
// capturas llegan en PNG. El proyecto no tiene ni puede tener `node_modules`
// (se ejecuta con `node` a secas), así que no hay ninguna librería de imagen
// disponible.
//
// QUÉ SOPORTA (y qué no)
// ----------------------
//   · bit depth 8
//   · color types 0 (gris), 2 (RGB) y 6 (RGBA)
//   · sin entrelazado (interlace 0), que es lo que producen las capturas
//
// Todo lo demás (16 bits, paleta, gris+alfa, Adam7) lanza un error EXPLÍCITO.
// No se adivina ni se “aproxima”: una imagen mal leída produciría métricas
// falsas, que es exactamente lo que este proyecto intenta evitar.
//
// La decodificación usa `zlib.inflateSync` de Node y los cinco filtros del
// estándar PNG (None, Sub, Up, Average, Paeth).

import { inflateSync, deflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CHANNELS_BY_COLOR_TYPE = {
  0: 1, // gris
  2: 3, // RGB
  6: 4, // RGBA
};

/** Comprueba la firma PNG. Devuelve true/false sin lanzar. */
export function isPng(buffer) {
  if (!buffer || buffer.length < 8) return false;
  for (let i = 0; i < 8; i++) if (buffer[i] !== SIGNATURE[i]) return false;
  return true;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decodifica un PNG a RGBA de 8 bits.
 * @returns {{data: Uint8ClampedArray, width: number, height: number, colorType: number, hadAlpha: boolean}}
 */
export function decodePng(buffer) {
  if (!isPng(buffer)) throw new Error('No es un PNG: falta la firma de 8 bytes.');
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatChunks = [];
  let sawIhdr = false;
  let sawIend = false;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`PNG truncado en el chunk ${type}.`);

    if (type === 'IHDR') {
      if (length < 13) throw new Error('IHDR inválido.');
      sawIhdr = true;
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      const compression = buffer[dataStart + 10];
      const filter = buffer[dataStart + 11];
      interlace = buffer[dataStart + 12];
      if (compression !== 0) throw new Error('PNG con método de compresión desconocido.');
      if (filter !== 0) throw new Error('PNG con método de filtrado desconocido.');
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      sawIend = true;
      break;
    }
    // Los chunks críticos desconocidos (mayúscula inicial) invalidan la lectura.
    else if (type[0] === type[0].toUpperCase() && type !== 'PLTE') {
      throw new Error(`PNG con chunk crítico no soportado: ${type}.`);
    }
    offset = dataEnd + 4; // salta el CRC
  }

  if (!sawIhdr) throw new Error('PNG sin IHDR.');
  if (!idatChunks.length) throw new Error('PNG sin datos (IDAT).');
  if (bitDepth !== 8) {
    throw new Error(`PNG de ${bitDepth} bits por canal: sólo se admite 8. Convierte la captura a 8 bits RGB/RGBA.`);
  }
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels) {
    throw new Error(`PNG con color type ${colorType}: sólo se admiten 0 (gris), 2 (RGB) y 6 (RGBA). `
      + 'Convierte la captura a RGB/RGBA antes de evaluarla.');
  }
  if (interlace !== 0) {
    throw new Error('PNG entrelazado (Adam7): vuelve a guardar la captura sin entrelazado.');
  }
  if (!width || !height) throw new Error('PNG sin dimensiones.');

  // Un PNG sin IEND está incompleto aunque los datos se puedan inflar: puede
  // faltar el final de la imagen. Se rechaza en vez de devolver media captura
  // (media captura = métricas falsas).
  if (!sawIend) throw new Error('PNG sin IEND: el archivo está incompleto.');

  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    throw new Error(`PNG incompleto: se esperaban ${expected} bytes y llegaron ${raw.length}.`);
  }

  const pixels = new Uint8ClampedArray(width * height * channels);
  let prev = new Uint8ClampedArray(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filterType = raw[rowStart];
    const line = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    const out = new Uint8ClampedArray(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      const x = line[i];
      let value;
      switch (filterType) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: value = x + paeth(a, b, c); break;
        default:
          throw new Error(`PNG con filtro de fila ${filterType}: sólo 0..4.`);
      }
      out[i] = value & 0xff;
    }
    pixels.set(out, y * stride);
    prev = out;
  }

  // Salida SIEMPRE RGBA para que el detector tenga una sola forma de entrada.
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    if (channels === 4) {
      rgba[i * 4] = pixels[i * 4];
      rgba[i * 4 + 1] = pixels[i * 4 + 1];
      rgba[i * 4 + 2] = pixels[i * 4 + 2];
      rgba[i * 4 + 3] = pixels[i * 4 + 3];
    } else if (channels === 3) {
      rgba[i * 4] = pixels[i * 3];
      rgba[i * 4 + 1] = pixels[i * 3 + 1];
      rgba[i * 4 + 2] = pixels[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    } else {
      const g = pixels[i];
      rgba[i * 4] = g; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = 255;
    }
  }

  return { data: rgba, width, height, colorType, hadAlpha: channels === 4, sawIend };
}

/**
 * Codificador PNG mínimo (una sola IDAT, sin filtro). NO se usa en producción:
 * existe para poder generar imágenes de prueba dentro de los tests sin
 * dependencias ni ficheros binarios en el repositorio.
 */
export function encodePng({ data, width, height, alpha = true }) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (stride + 1) + 1 + x * channels;
      raw[dst] = data[src];
      raw[dst + 1] = data[src + 1];
      raw[dst + 2] = data[src + 2];
      if (alpha) raw[dst + 3] = data[src + 3];
    }
  }
  const chunk = (type, payload) => {
    const out = Buffer.alloc(payload.length + 12);
    out.writeUInt32BE(payload.length, 0);
    out.write(type, 4, 'ascii');
    payload.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), payload])), payload.length + 8);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** CRC-32 del estándar PNG (para que los PNG de prueba sean válidos). */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
