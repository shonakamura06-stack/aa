// color.mjs — matemática de color para auditoría de accesibilidad.
// Implementa WCAG 2.1 (ratio de contraste) y APCA 0.98G (perceptual, draft W3C).
// Sin dependencias: todo verificable con los tests de test/color.test.mjs.

/** Parsea `rgb()`, `rgba()`, `#rgb`, `#rrggbb`, `#rrggbbaa` → {r,g,b,a} 0-255 / a 0-1. */
export function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  }
  m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length >= 8 ? n(6) / 255 : 1 };
  }
  return null;
}

/** Compone `fg` (con alfa) sobre `bg` opaco. */
export function composite(fg, bg) {
  const a = fg.a ?? 1;
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

/** Luminancia relativa WCAG 2.1 §relative-luminance. */
export function luminance({ r, g, b }) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Ratio de contraste WCAG: (L1+0.05)/(L2+0.05), 1..21. */
export function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function wcagVerdict(ratio, { large = false, level = 'AA' } = {}) {
  const min = level === 'AAA' ? (large ? 4.5 : 7) : large ? 3 : 4.5;
  return { ratio: Number(ratio.toFixed(2)), min, pass: ratio >= min, level };
}

/**
 * APCA 0.98G — contraste perceptual (el que usan navegadores y WCAG 3 en borrador).
 * Devuelve Lc: >60 apto para texto de cuerpo, >75 para texto fino, <45 no usar.
 */
export function apca(fg, bg) {
  const Y = (c) => {
    const f = (v) => Math.pow(v / 255, 2.4);
    let y = 0.2126729 * f(c.r) + 0.7151522 * f(c.g) + 0.072175 * f(c.b);
    if (y < 0.022) y += Math.pow(0.022 - y, 1.414);
    return y;
  };
  const Ytxt = Y(fg);
  const Ybg = Y(bg);
  const blkThrs = 0.022, blkClmp = 1.414, deltaYmin = 0.0005, scale = 1.14;
  if (Math.abs(Ybg - Ytxt) < deltaYmin) return 0;
  let S, out;
  if (Ybg > Ytxt) {
    // texto oscuro sobre fondo claro
    S = (Math.pow(Ybg, 0.56) - Math.pow(Ytxt, 0.57)) * scale;
    out = S < 0.1 ? 0 : (S - 0.027) * 100;
  } else {
    // texto claro sobre fondo oscuro
    S = (Math.pow(Ybg, 0.65) - Math.pow(Ytxt, 0.62)) * scale;
    out = S > -0.1 ? 0 : (S + 0.027) * 100;
  }
  return Number(out.toFixed(1));
}

export function apcaVerdict(lc) {
  // Umbrales de uso (APCA 0.98G, tabla de uso de contenido)
  if (Math.abs(lc) >= 90) return 'excelente (texto fino/pequeño)';
  if (Math.abs(lc) >= 75) return 'bueno (cuerpo de texto)';
  if (Math.abs(lc) >= 60) return 'mínimo (cuerpo grande / ≥18px)';
  if (Math.abs(lc) >= 45) return 'solo titulares grandes';
  if (Math.abs(lc) >= 30) return 'decorativo, no legible';
  return 'invisible / no usar';
}

/** Contraste de un par de strings CSS ya compuestos. */
export function evaluatePair(fgCss, bgCss, { fontSize = 16, bold = false } = {}) {
  const fgRaw = parseColor(fgCss);
  const bgRaw = parseColor(bgCss);
  if (!fgRaw || !bgRaw) return null;
  const bg = composite(bgRaw, { r: 255, g: 255, b: 255, a: 1 });
  const fg = composite(fgRaw, bg);
  const large = fontSize >= 24 || (bold && fontSize >= 18.66);
  const ratio = contrastRatio(fg, bg);
  const lc = apca(fg, bg);
  return {
    fg: fgCss, bg: bgCss, fontSize,
    wcag: wcagVerdict(ratio, { large }),
    apca: { lc, usage: apcaVerdict(lc) },
  };
}
