import type { EngineContext, EvidenceLevel, Metric, SegmentScore } from "@/lib/types";
import { round } from "@/lib/text/stats";

export function metric(
  key: string,
  label: string,
  value: number | string | null,
  unit?: string,
  interpretation?: string,
): Metric {
  // Un NaN o un Infinity es un fallo de cálculo, no un cero. Se publica como
  // «no calculable» para que la interfaz no muestre una cifra falsa.
  const finite = typeof value === "number" ? Number.isFinite(value) : true;
  const resolved = typeof value === "number" ? (finite ? round(value, 4) : null) : value;
  return {
    key,
    label,
    value: resolved,
    ...(unit ? { unit } : {}),
    ...(finite ? (interpretation ? { interpretation } : {}) : { interpretation: "No calculable: el cálculo produjo un valor no finito." }),
  };
}

/**
 * La calidad de evidencia no es la "confianza" del método: combina la
 * naturaleza del método con la cantidad de texto disponible.
 */
export function evidenceFor(
  ctx: EngineContext,
  base: EvidenceLevel,
  minWords: number,
): EvidenceLevel {
  const order: EvidenceLevel[] = ["insufficient", "low", "medium", "high"];
  const idx = order.indexOf(base);
  if (ctx.wordCount < minWords) return order[Math.max(0, idx - 2)];
  if (ctx.wordCount < minWords * 2.5) return order[Math.max(0, idx - 1)];
  return base;
}

export function languagesMismatch(ctx: EngineContext, supported: string[]): boolean {
  return ctx.language !== "unknown" && !supported.includes(ctx.language);
}

export function topEntries(counts: Map<string, number>, n: number): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function sentenceIndexFor(ctx: EngineContext, offset: number): number {
  for (let i = 0; i < ctx.sentenceSpans.length; i++) {
    if (offset < ctx.sentenceSpans[i].end) return i;
  }
  return Math.max(0, ctx.sentenceSpans.length - 1);
}

export function segmentsFrom(
  ctx: EngineContext,
  scores: Array<{ start: number; end: number; text: string; score: number }>,
  engineId: string,
): SegmentScore[] {
  return scores.map((s) => ({ ...s, score: round(s.score, 4), engines: [engineId] }));
}

export function countSyllablesEs(word: string): number {
  const w = word.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}+/gu, "").replace(/[^a-z]/g, "");
  if (!w) return 0;
  const vowels = new Set(["a", "e", "i", "o", "u", "y"]);
  // Separación aproximada en grupos vocálicos con reglas de hiato documentadas.
  const groups: string[] = [];
  let current = "";
  for (const ch of w) {
    if (vowels.has(ch)) {
      current += ch;
    } else if (current) {
      groups.push(current);
      current = "";
    }
  }
  if (current) groups.push(current);
  let syllables = 0;
  for (const g of groups) {
    if (g.length <= 2) {
      syllables += 1;
      continue;
    }
    // Grupos largos: se separan en hiatos entre vocales fuertes y en vocales repetidas.
    let count = 1;
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1];
      const b = g[i];
      const strongA = "aeo".includes(a);
      const strongB = "aeo".includes(b);
      if ((strongA && strongB) || a === b) count++;
    }
    syllables += count;
  }
  return Math.max(1, syllables);
}

export function countSyllablesEn(word: string): number {
  const w = word.toLocaleLowerCase("en").replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Generador pseudoaleatorio determinista (para líneas base reproducibles). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
