import type { Engine } from "@/lib/types";
import { interpolateAnchors } from "@/lib/text/stats";
import { evidenceFor, metric } from "./helpers";

function ngrams(words: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  return out;
}

function repetitionStats(seq: string[]) {
  const counts = new Map<string, number>();
  for (const g of seq) counts.set(g, (counts.get(g) ?? 0) + 1);
  const distinct = counts.size;
  const total = seq.length;
  let repeatedInstances = 0;
  let topGram = "";
  let topCount = 0;
  for (const [g, c] of counts) {
    if (c > 1) repeatedInstances += c;
    if (c > topCount) {
      topCount = c;
      topGram = g;
    }
  }
  return {
    total,
    distinct,
    distinctRatio: total ? distinct / total : 0,
    repeatedShare: total ? repeatedInstances / total : 0,
    topGram,
    topCount,
  };
}

export const ngramRepetitionEngine: Engine = {
  meta: {
    id: "repetition.ngram",
    name: "Repetición de n-gramas",
    kind: "statistical",
    family: "repetition-structure",
    version: "1.0.0",
    summary: "Repetición de unigramas, bigramas, trigramas y 4-gramas, y repeticiones consecutivas.",
    methodology:
      "Se extraen secuencias de n palabras consecutivas sobre tokens normalizados. Para cada orden n se calcula la proporción de instancias que pertenecen a n-gramas repetidos y el n-grama más repetido. También se cuentan repeticiones inmediatas de la misma palabra.",
    variables: ["n-gramas de orden 1 a 4", "Repeticiones consecutivas de un token", "Trigramas repetidos"],
    formulas: [
      { name: "Proporción repetida", expression: "R_n = (Σ_{c>1} c) / T_n", note: "T_n = total de n-gramas." },
      { name: "Distinción léxica", expression: "D_n = V_n / T_n" },
      { name: "Repetición consecutiva", expression: "C = |{i : wᵢ = wᵢ₊₁}| / N" },
    ],
    limitations: [
      "La repetición es legítima en textos técnicos, jurídicos o con estribillos.",
      "No distingue repetición retórica de repetición mecánica.",
      "En textos cortos la proporción de trigramas repetidos es casi siempre 0.",
    ],
    languages: ["es", "en"],
    minWords: 80,
    external: false,
    validation: "unvalidated",
    directionality: "directional",
    signalAnchors: {
      metric: "trigramRepeatedShare",
      rationale:
        "La reutilización literal de secuencias de tres palabras por encima de lo esperable indica generación repetitiva o plantillas. Anclas iniciales no calibradas.",
      points: [
        [0, 0.3],
        [0.03, 0.5],
        [0.1, 0.72],
        [0.25, 0.9],
      ],
    },
    dependenceCluster: "sequence-repetition",
    sharesVarianceWith: [
      { engine: "redundancy.similarity", reason: "La similitud entre oraciones se apoya en el mismo solapamiento de n-gramas que la repetición." },
    ],
    supportsSegments: false,
  },
  run(ctx) {
    const w = ctx.lowerWords;
    const orders = [1, 2, 3, 4].map((n) => ({ n, ...repetitionStats(ngrams(w, n)) }));
    let consecutive = 0;
    for (let i = 1; i < w.length; i++) if (w[i] === w[i - 1]) consecutive++;
    const tri = orders.find((o) => o.n === 3)!;
    const signal =
      ctx.wordCount >= this.meta.minWords
        ? interpolateAnchors(this.meta.signalAnchors!.points, tri.repeatedShare)
        : null;
    return {
      metrics: [
        ...orders.map((o) =>
          metric(
            `repeatedShare_${o.n}`,
            `Proporción repetida (n=${o.n})`,
            o.repeatedShare,
            "0-1",
            o.n === 1 ? "Incluye toda palabra que aparece más de una vez." : undefined,
          ),
        ),
        metric("trigramRepeatedShare", "Repetición de trigramas", tri.repeatedShare, "0-1"),
        metric("distinctRatio_2", "Bigramas distintos / total", orders[1].distinctRatio, "0-1"),
        metric("consecutiveRepeatRate", "Repeticiones consecutivas", w.length ? consecutive / w.length : 0, "0-1"),
        metric(
          "mostRepeatedTrigram",
          "Trigramas más repetidos",
          orders[2].topCount > 1 ? `${orders[2].topGram} (${orders[2].topCount})` : "ninguno repetido",
        ),
        metric("totalTrigrams", "Trigramas analizados", tri.total, "n-gramas"),
      ],
      signal,
      signalLabel: "Reutilización literal de secuencias",
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "Los n-gramas se construyen sobre palabras normalizadas, sin puntuación.",
        `Repeticiones consecutivas detectadas: ${consecutive}.`,
      ],
      warnings:
        ctx.wordCount < this.meta.minWords
          ? ["Texto corto: la repetición de trigramas no es estimable de forma estable."]
          : [],
      meta: { orders },
    };
  },
};
