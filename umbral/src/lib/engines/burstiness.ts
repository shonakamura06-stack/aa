import type { Engine } from "@/lib/types";
import { coefficientOfVariation, interpolateAnchors, mean, median, quantile, sd } from "@/lib/text/stats";
import { evidenceFor, metric } from "./helpers";
import { wordCount } from "@/lib/text/tokenize";

export const burstinessEngine: Engine = {
  meta: {
    id: "rhythm.burstiness",
    name: "Burstiness (ritmo oracional)",
    kind: "statistical",
    family: "repetition-structure",
    version: "1.0.0",
    summary: "Variabilidad de la longitud de las oraciones: media, dispersión, B de Goh-Barabási y uniformidad.",
    methodology:
      "Se segmentan oraciones con Intl.Segmenter, se cuenta el número de palabras de cada una y se describe su distribución. La burstiness B compara desviación típica y media; la uniformidad mide qué fracción de oraciones se aleja menos de un 20 % de la media.",
    variables: ["Longitud de cada oración en palabras", "Media y desviación típica", "Cuartiles", "Fracción de oraciones cercanas a la media"],
    formulas: [
      { name: "Burstiness de Goh-Barabási", expression: "B = (σ − μ) / (σ + μ)", note: "Rango (−1, 1)." },
      { name: "Coeficiente de variación", expression: "CV = σ / μ" },
      {
        name: "Uniformidad",
        expression: "U = |{i : |Lᵢ − μ| ≤ 0.2μ}| / M",
        note: "M = número de oraciones. Alta U = longitudes muy homogéneas.",
      },
    ],
    limitations: [
      "La homogeneidad de longitudes puede deberse a un género textual pautado (informativo, académico).",
      "Con menos de 8 oraciones las medidas de dispersión son inestables.",
      "No considera el contenido ni la sintaxis interna de la oración.",
    ],
    languages: ["es", "en"],
    minWords: 80,
    external: false,
    validation: "unvalidated",
    directionality: "directional",
    signalAnchors: {
      metric: "burstinessB",
      rationale:
        "Textos con longitudes de oración muy homogéneas (B muy negativo) muestran menos variación de ritmo que la prosa humana espontánea. Anclas iniciales no calibradas.",
      points: [
        [-0.7, 0.85],
        [-0.4, 0.68],
        [-0.15, 0.48],
        [0.15, 0.3],
        [0.45, 0.18],
      ],
    },
    dependenceCluster: "sentence-rhythm",
    sharesVarianceWith: [
      { engine: "structure.regularity", reason: "Ambos describen la distribución de longitudes del texto (oraciones y párrafos)." },
      { engine: "syntax.complexity", reason: "La longitud oracional es la variable compartida." },
      { engine: "readability.indices", reason: "Las fórmulas de legibilidad usan palabras por oración." },
    ],
    supportsSegments: false,
  },
  run(ctx) {
    const lengths = ctx.sentences.map((s) => wordCount(s)).filter((n) => n > 0);
    const mu = mean(lengths);
    const sigma = sd(lengths);
    const b = sigma + mu === 0 ? 0 : (sigma - mu) / (sigma + mu);
    const nearMean = lengths.filter((l) => Math.abs(l - mu) <= 0.2 * mu).length;
    const uniformity = lengths.length ? nearMean / lengths.length : 0;
    const signal = lengths.length >= 8 ? interpolateAnchors(this.meta.signalAnchors!.points, b) : null;
    return {
      metrics: [
        metric("sentenceCount", "Oraciones", lengths.length, "oraciones"),
        metric("meanSentenceLength", "Longitud media", mu, "palabras"),
        metric("sdSentenceLength", "Desviación típica", sigma, "palabras"),
        metric("burstinessB", "Burstiness B", b, "(−1,1)", "Cercano a −1 = longitudes muy uniformes."),
        metric("cv", "Coeficiente de variación", coefficientOfVariation(lengths), "σ/μ"),
        metric("median", "Mediana", median(lengths), "palabras"),
        metric("p10", "Percentil 10", quantile(lengths, 0.1), "palabras"),
        metric("p90", "Percentil 90", quantile(lengths, 0.9), "palabras"),
        metric("uniformity", "Uniformidad (±20 % de la media)", uniformity, "0-1"),
        metric("longestSentence", "Oración más larga", Math.max(0, ...lengths), "palabras"),
        metric("shortestSentence", "Oración más corta", Math.min(...(lengths.length ? lengths : [0])), "palabras"),
      ],
      signal,
      signalLabel: "Ritmo oracional homogéneo",
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "La segmentación de oraciones usa Intl.Segmenter, consciente de abreviaturas y signos.",
        `Oraciones evaluadas: ${lengths.length}.`,
      ],
      warnings:
        lengths.length < 8
          ? ["Menos de 8 oraciones: la dispersión no es una medida fiable."]
          : [],
      meta: { lengths },
    };
  },
};
