import type { Engine } from "@/lib/types";
import { mean, shannonEntropy, countBy } from "@/lib/text/stats";
import { EN_SUBORDINATORS, ES_SUBORDINATORS } from "@/lib/text/lexicons";
import { evidenceFor, metric } from "./helpers";
import { wordCount } from "@/lib/text/tokenize";

/** Longitud y densidad de marcadores: medida superficial, no árbol sintáctico. */
export const syntaxComplexityEngine: Engine = {
  meta: {
    id: "syntax.complexity",
    name: "Complejidad sintáctica (superficial)",
    kind: "linguistic",
    family: "linguistic-surface",
    version: "1.0.0",
    summary:
      "Longitud oracional, densidad de marcadores de subordinación y coordinación, y dispersión de la longitud.",
    methodology:
      "Sobre las oraciones segmentadas se cuentan palabras y marcadores de subordinación de una lista cerrada. Se calcula una densidad de subordinación por oración y se describe la distribución de longitudes. No se construye árbol sintáctico ni se hace etiquetado gramatical: es una medida de superficie.",
    variables: ["Palabras por oración", "Marcadores de subordinación", "Marcadores de coordinación", "Distribución de longitudes"],
    formulas: [
      { name: "Densidad de subordinación", expression: "DS = marcadores_subordinación / oraciones" },
      { name: "Palabras por oración", expression: "PO = palabras / oraciones" },
      { name: "Entropía de longitudes", expression: "H_L = −Σ p(L) log2 p(L)" },
    ],
    limitations: [
      "No es un análisis sintáctico: no identifica funciones, dependencias ni profundidad real de anidamiento.",
      "Los marcadores tienen usos no subordinantes (por ejemplo «que» como relativo o conjunción).",
      "La comparación entre géneros textuales requiere referencia propia de cada género.",
    ],
    languages: ["es", "en"],
    minWords: 80,
    external: false,
    validation: "heuristic",
    directionality: "non-directional",
    dependenceCluster: "sentence-rhythm",
    sharesVarianceWith: [
      { engine: "burstiness", reason: "Comparte la distribución de longitudes de oración." },
      { engine: "readability.indices", reason: "Ambos parten de palabras por oración." },
    ],
    supportsSegments: false,
  },
  run(ctx) {
    const markers = new Set((ctx.language === "en" ? EN_SUBORDINATORS : ES_SUBORDINATORS).map((m) => m.toLowerCase()));
    const coordinators = new Set(ctx.language === "en" ? ["and", "or", "but"] : ["y", "e", "o", "u", "pero", "sino"]);
    const lengths: number[] = [];
    let subordinators = 0;
    let coordinations = 0;
    let longSentences = 0;
    for (const sentence of ctx.sentences) {
      const words = (sentence.toLocaleLowerCase("es").match(/[\p{L}\p{M}]+/gu) ?? []);
      const len = wordCount(sentence);
      lengths.push(len);
      if (len > 30) longSentences++;
      for (const w of words) {
        if (markers.has(w)) subordinators++;
        if (coordinators.has(w)) coordinations++;
      }
    }
    const sentenceCount = Math.max(1, ctx.sentences.length);
    const lengthBins = countBy(lengths.map((l) => String(Math.floor(l / 5))), (k) => k);
    return {
      metrics: [
        metric("sentences", "Oraciones", ctx.sentences.length, "oraciones"),
        metric("meanWordsPerSentence", "Palabras por oración", mean(lengths), "palabras"),
        metric("subordinationDensity", "Densidad de subordinación", subordinators / sentenceCount, "marcadores/oración"),
        metric("coordinationDensity", "Densidad de coordinación", coordinations / sentenceCount, "marcadores/oración"),
        metric("markersPer100Words", "Marcadores por 100 palabras", (100 * (subordinators + coordinations)) / Math.max(1, ctx.wordCount), "por 100 palabras"),
        metric("longSentenceShare", "Oraciones de más de 30 palabras", longSentences / sentenceCount, "0-1"),
        metric("sentenceLengthEntropy", "Entropía de longitudes (tramos de 5)", shannonEntropy([...lengthBins.values()]), "bits"),
        metric("longestSentenceWords", "Oración más larga", Math.max(0, ...lengths), "palabras"),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "Medida de superficie: cuenta marcadores, no dependencias sintácticas.",
        "Un valor alto de densidad no implica mejor calidad; en exceso suele indicar prosa recargada.",
      ],
      warnings: [],
    };
  },
};
