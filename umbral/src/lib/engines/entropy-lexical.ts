import { interpolateAnchors, round, shannonEntropy, normalizedEntropy } from "@/lib/text/stats";
import { countBy } from "@/lib/text/stats";
import type { Engine } from "@/lib/types";
import { evidenceFor, metric, topEntries } from "./helpers";

/**
 * Entropía léxica: mide la dispersión de la distribución de palabras
 * (entropía de Shannon del unigrama) y la incertidumbre del siguiente token
 * (entropía condicional del bigrama).
 */
export const lexicalEntropyEngine: Engine = {
  meta: {
    id: "entropy.lexical",
    name: "Entropía léxica",
    kind: "statistical",
    family: "information-theoretic",
    version: "1.0.0",
    summary:
      "Entropía de Shannon de la distribución de palabras y entropía condicional de bigramas.",
    methodology:
      "Se tokeniza con Intl.Segmenter, se normalizan las palabras a minúsculas y se calcula la entropía de la distribución empírica de unigramas y la entropía condicional H(siguiente|actual) del modelo de bigramas del propio texto.",
    variables: [
      "Frecuencia absoluta de cada tipo léxico",
      "Pares de palabras consecutivas",
      "Distribución de probabilidad empírica",
    ],
    formulas: [
      { name: "Entropía de Shannon", expression: "H = -Σ p(w) · log2 p(w)", note: "En bits por palabra." },
      {
        name: "Entropía normalizada",
        expression: "H_norm = H / log2(V)",
        note: "V = número de tipos distintos; permite comparar textos de distinto vocabulario.",
      },
      {
        name: "Entropía condicional de bigramas",
        expression: "H(B|A) = -Σ p(a,b) · log2 p(b|a)",
        note: "Mide la incertidumbre del siguiente token dado el anterior.",
      },
    ],
    limitations: [
      "Depende de la longitud: en textos cortos la entropía se subestima.",
      "Un texto muy técnico tiene entropía alta sin relación con la autoría.",
      "No distingue autoría: solo cuantifica dispersión del vocabulario.",
    ],
    languages: ["es", "en"],
    minWords: 80,
    external: false,
    validation: "unvalidated",
    directionality: "directional",
    signalAnchors: {
      metric: "normalizedEntropy",
      rationale:
        "Una entropía léxica normalizada baja indica un vocabulario concentrado en pocos tipos, patrón frecuente en texto muy predecible. Anclas iniciales, no calibradas con corpus etiquetado; se declaran como no validadas.",
      points: [
        [0.7, 0.8],
        [0.85, 0.55],
        [0.93, 0.35],
        [0.98, 0.22],
      ],
    },
    dependenceCluster: "information-theoretic",
    sharesVarianceWith: [
      { engine: "predictability.perplexity", reason: "Usa la misma distribución de tokens del documento; la entropía condicional y la perplejidad de bigramas son transformaciones de los mismos conteos." },
      { engine: "compression.complexity", reason: "Ambos resumen el contenido informacional del mismo texto con métodos distintos." },
    ],
    supportsSegments: false,
    references: ["Shannon, C. E. (1948). A Mathematical Theory of Communication."],
  },
  run(ctx) {
    const counts = [...countBy(ctx.lowerWords, (w) => w).values()];
    const H = shannonEntropy(counts);
    const Hn = normalizedEntropy(counts);

    const bigrams = countBy(
      ctx.lowerWords.slice(1).map((w, i) => `${ctx.lowerWords[i]}\u0000${w}`),
      (k) => k,
    );
    const prevCounts = new Map<string, number>();
    for (let i = 1; i < ctx.lowerWords.length; i++) {
      const prev = ctx.lowerWords[i - 1];
      prevCounts.set(prev, (prevCounts.get(prev) ?? 0) + 1);
    }
    // Cálculo directo y estable de H(B|A) para evitar acumulación de errores.
    let hBA = 0;
    const totalBigrams = Math.max(1, ctx.lowerWords.length - 1);
    for (const [key, c] of bigrams) {
      const prev = key.split("\u0000")[0];
      const pPrevCount = prevCounts.get(prev) ?? 0;
      if (pPrevCount === 0) continue;
      const pJoint = c / totalBigrams;
      hBA -= pJoint * Math.log2(c / pPrevCount);
    }

    const signal =
      ctx.wordCount >= this.meta.minWords
        ? interpolateAnchors(this.meta.signalAnchors!.points, Hn)
        : null;

    const top = topEntries(countBy(ctx.lowerWords, (w) => w), 5);
    return {
      metrics: [
        metric("unigramEntropyBits", "Entropía de unigramas", H, "bits", "Dispersión del vocabulario."),
        metric(
          "normalizedEntropy",
          "Entropía normalizada",
          Hn,
          "0-1",
          "Cercano a 1 = vocabulario muy repartido; cercano a 0 = pocas palabras dominantes.",
        ),
        metric(
          "bigramConditionalEntropy",
          "Entropía condicional de bigramas",
          hBA,
          "bits",
          "Incertidumbre del siguiente token dado el anterior.",
        ),
        metric("types", "Tipos léxicos", counts.length, "tipos"),
        metric("topWordShare", "Peso de la palabra más frecuente", (top[0]?.[1] ?? 0) / Math.max(1, ctx.wordCount), "proporción"),
        metric("topWords", "Palabras más frecuentes", top.map(([w, c]) => `${w} (${c})`).join(", ")),
      ],
      signal,
      signalLabel: "Patrones de vocabulario concentrado y predecible",
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        `Bigramas distintos analizados: ${bigrams.size}.`,
        "La entropía condicional se calcula con los bigramas observados en este texto, sin modelo externo.",
      ],
      warnings:
        ctx.wordCount < this.meta.minWords
          ? ["Texto corto: la entropía léxica es inestable por debajo de 80 palabras; no se emite señal."]
          : [],
      meta: { topWords: top, hBA: round(hBA, 4) },
    };
  },
};
