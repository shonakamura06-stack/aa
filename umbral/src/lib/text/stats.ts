/** Utilidades estadísticas puras y verificables (sin dependencias externas). */

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Varianza muestral (n-1). Devuelve 0 para n < 2. */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return sum(values.map((v) => (v - m) ** 2)) / (values.length - 1);
}

export function sd(values: number[]): number {
  return Math.sqrt(variance(values));
}

/** Coeficiente de variación: desviación típica / media. */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  return m === 0 ? 0 : sd(values) / m;
}

export function median(values: number[]): number {
  return quantile(values, 0.5);
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

/** Entropía de Shannon en bits a partir de conteos de frecuencias. */
export function shannonEntropy(counts: number[]): number {
  const total = sum(counts);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Entropía normalizada H / log2(V), en [0,1]. V = número de tipos distintos. */
export function normalizedEntropy(counts: number[]): number {
  const types = counts.filter((c) => c > 0).length;
  if (types <= 1) return 0;
  return shannonEntropy(counts) / Math.log2(types);
}

/** Índice K de Yule: riqueza léxica independiente de la longitud del texto. */
export function yulesK(counts: number[]): number {
  const n = sum(counts);
  if (n <= 1) return 0;
  const sumSquares = sum(counts.map((c) => c * c));
  return (10000 * (sumSquares - n)) / (n * n);
}

/** D de Simpson: probabilidad de que dos palabras al azar sean iguales. */
export function simpsonsD(counts: number[]): number {
  const n = sum(counts);
  if (n <= 1) return 0;
  return sum(counts.map((c) => c * (c - 1))) / (n * (n - 1));
}

/** R de Honoré: riqueza léxica basada en hapax. null si no hay vocabulario nuevo. */
export function honoreR(counts: number[]): number | null {
  const n = sum(counts);
  const v = counts.filter((c) => c > 0).length;
  const hapax = counts.filter((c) => c === 1).length;
  if (n === 0 || v === 0 || v === hapax) return null;
  return (100 * Math.log(n)) / (1 - hapax / v);
}

/** Hapax legomena: palabras que aparecen exactamente una vez. */
export function hapaxLegomena(counts: number[]): number {
  return counts.filter((c) => c === 1).length;
}

/**
 * Interpolación lineal por tramos sobre anclas documentadas.
 * Nunca se usa para inventar precisión: las anclas y su procedencia se
 * publican en /api/engines y en docs/METHODS.md.
 */
export function interpolateAnchors(points: Array<[number, number]>, x: number): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= sorted[0][0]) return clamp01(sorted[0][1]);
  const last = sorted[sorted.length - 1];
  if (x >= last[0]) return clamp01(last[1]);
  for (let i = 0; i < sorted.length - 1; i++) {
    const [x0, y0] = sorted[i];
    const [x1, y1] = sorted[i + 1];
    if (x >= x0 && x <= x1) {
      if (x1 === x0) return clamp01(y1);
      const t = (x - x0) / (x1 - x0);
      return clamp01(y0 + t * (y1 - y0));
    }
  }
  return clamp01(last[1]);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Redondeo estable para presentar cifras sin ruido de coma flotante. */
export function round(value: number, decimals = 3): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** Similitud de Jaccard entre dos conjuntos. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Coseno entre dos vectores dispersos (Map índice->peso). */
export function cosineSparse(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    const bv = b.get(k);
    if (bv !== undefined) dot += v * bv;
  }
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function zipfSlope(counts: number[]): number {
  const freqs = counts.filter((c) => c > 0).sort((a, b) => b - a);
  if (freqs.length < 3) return 0;
  const xs = freqs.map((_, i) => Math.log10(i + 1));
  const ys = freqs.map((f) => Math.log10(f));
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}
