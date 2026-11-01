import type { Engine } from "@/lib/types";
import { countBy, honoreR, simpsonsD, yulesK } from "@/lib/text/stats";
import { evidenceFor, metric } from "./helpers";

export const yuleRichnessEngine: Engine = {
  meta: {
    id: "richness.yule",
    name: "Riqueza léxica estilométrica",
    kind: "statistical",
    family: "stylometric",
    version: "1.0.0",
    summary: "Índice K de Yule, R de Honoré y D de Simpson: riqueza independiente de la longitud.",
    methodology:
      "Se construye la distribución de frecuencias de tipos léxicos y se calculan tres índices clásicos de estilometría que penalizan la concentración de repeticiones sin depender linealmente de la longitud del texto.",
    variables: ["Distribución de frecuencias de tipos", "Número total de palabras", "Tipos con frecuencia 1"],
    formulas: [
      { name: "K de Yule", expression: "K = 10⁴ · (Σ nᵢ² − N) / N²", note: "Menor K = mayor diversidad." },
      { name: "R de Honoré", expression: "R = 100 · log(N) / (1 − V1/V)", note: "Solo si V1 < V." },
      { name: "D de Simpson", expression: "D = Σ nᵢ(nᵢ−1) / (N(N−1))", note: "Probabilidad de repetir tipo al azar." },
    ],
    limitations: [
      "Los índices de riqueza siguen siendo sensibles al género textual y al tema.",
      "No existe evidencia de que discriminen autoría humana frente a generada.",
      "Con menos de 100 palabras los índices son inestables.",
    ],
    languages: ["es", "en"],
    minWords: 100,
    external: false,
    validation: "unvalidated",
    directionality: "non-directional",
    dependenceCluster: "lexical-richness",
    sharesVarianceWith: [
      { engine: "diversity.lexical", reason: "Misma distribución de frecuencias de tipos." },
    ],
    supportsSegments: false,
    references: ["Yule, G. U. (1944). The Statistical Study of Literary Vocabulary.", "Honoré, A. (1979). Some simple measures of richness of vocabulary."],
  },
  run(ctx) {
    const counts = [...countBy(ctx.lowerWords, (w) => w).values()];
    const n = ctx.lowerWords.length;
    const v = counts.length;
    const hapax = counts.filter((c) => c === 1).length;
    const r = honoreR(counts);
    return {
      metrics: [
        metric("yulesK", "Índice K de Yule", yulesK(counts), "K", "Menor K = vocabulario más diverso."),
        metric("honoreR", "R de Honoré", r, "R", r === null ? "No calculable: todo el vocabulario es hapax." : undefined),
        metric("simpsonsD", "D de Simpson", simpsonsD(counts), "0-1"),
        metric("vocabularySize", "Tipos observados", v, "tipos"),
        metric("hapaxShare", "Hapax sobre tipos", v ? hapax / v : 0, "0-1"),
        metric("tokensPerType", "Palabras por tipo", n / Math.max(1, v), "ratio"),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "Los tres índices se informan juntos porque cada uno penaliza de forma distinta la repetición.",
        "Medida descriptiva: no se traduce en señal de autoría.",
      ],
      warnings: n < this.meta.minWords ? ["Menos de 100 palabras: índices de riqueza poco fiables."] : [],
    };
  },
};
