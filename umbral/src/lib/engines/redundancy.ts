import type { Engine } from "@/lib/types";
import { cosineSparse, interpolateAnchors, jaccard, mean } from "@/lib/text/stats";
import { ES_FUNCTION_WORDS, EN_FUNCTION_WORDS } from "@/lib/text/lexicons";
import { evidenceFor, metric } from "./helpers";

const ES_STOP = new Set(ES_FUNCTION_WORDS);
const EN_STOP = new Set(EN_FUNCTION_WORDS);

export const redundancyEngine: Engine = {
  meta: {
    id: "redundancy.similarity",
    name: "Redundancia entre oraciones",
    kind: "statistical",
    family: "repetition-structure",
    version: "1.0.0",
    summary: "Similitud léxica entre pares de oraciones y detección de oraciones casi duplicadas.",
    methodology:
      "Se eliminan palabras funcionales y se representa cada oración como un vector de frecuencias de palabras de contenido. Se calcula la similitud de coseno y la de Jaccard entre todos los pares de oraciones, más la proporción de pares con similitud ≥ 0.8. No se usan embeddings: es similitud léxica, no semántica.",
    variables: ["Pares de oraciones", "Palabras de contenido por oración", "Coseno y Jaccard por par"],
    formulas: [
      { name: "Coseno léxico", expression: "cos(q,d) = (q·d) / (‖q‖‖d‖)" },
      { name: "Jaccard", expression: "J(A,B) = |A∩B| / |A∪B|" },
      {
        name: "Redundancia media",
        expression: "R̄ = media de coseno sobre todos los pares",
        note: "Se descartan pares con menos de 3 palabras de contenido en común.",
      },
    ],
    limitations: [
      "Sin embeddings no detecta paráfrasis: dos oraciones pueden repetir la misma idea con vocabulario distinto.",
      "Textos con muchas oraciones cortas producen similitudes bajas por falta de solapamiento.",
      "No distingue redundancia de progresión temática legítima.",
    ],
    languages: ["es", "en"],
    minWords: 100,
    external: false,
    validation: "unvalidated",
    directionality: "directional",
    signalAnchors: {
      metric: "meanPairSimilarity",
      rationale:
        "Una similitud léxica media alta entre oraciones indica que el texto reformula el mismo contenido con el mismo vocabulario. Anclas iniciales no calibradas.",
      points: [
        [0.05, 0.3],
        [0.15, 0.45],
        [0.3, 0.7],
        [0.5, 0.85],
      ],
    },
    dependenceCluster: "sequence-repetition",
    sharesVarianceWith: [
      { engine: "repetition.ngram", reason: "Mide solapamiento léxico, que es una forma de repetición de n-gramas entre oraciones." },
    ],
    supportsSegments: false,
  },
  run(ctx) {
    const stop = ctx.language === "en" ? EN_STOP : ES_STOP;
    const vectors = ctx.sentences.map((s) => {
      const words = (s.toLocaleLowerCase("es").match(/[\p{L}\p{M}]+/gu) ?? []).filter(
        (w) => w.length > 2 && !stop.has(w),
      );
      const vec = new Map<string, number>();
      for (const w of words) vec.set(w, (vec.get(w) ?? 0) + 1);
      return { words, vec, set: new Set(words) };
    });
    /**
     * Auditoría: antes solo se conservaban los pares con ≥3 palabras de
     * contenido en común y la media se calculaba sobre esos pares. Eso es
     * condicionar la muestra al resultado (sesgo de selección): descarta los
     * pares no relacionados y eleva artificialmente la similitud media.
     * Ahora se calcula la media sobre TODOS los pares; el subconjunto con
     * solapamiento se informa aparte como diagnóstico.
     */
    const allPairs: Array<{ i: number; j: number; cosine: number; jaccard: number; textA: string; textB: string }> = [];
    const pairs: Array<{ i: number; j: number; cosine: number; jaccard: number; textA: string; textB: string }> = [];
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const entry = {
          i,
          j,
          cosine: cosineSparse(vectors[i].vec, vectors[j].vec),
          jaccard: jaccard(vectors[i].set, vectors[j].set),
          textA: ctx.sentences[i],
          textB: ctx.sentences[j],
        };
        allPairs.push(entry);
        const overlap = [...vectors[i].set].filter((w) => vectors[j].set.has(w)).length;
        if (overlap >= 3) pairs.push(entry);
      }
    }
    const cosines = allPairs.map((p) => p.cosine);
    const meanSim = mean(cosines);
    const maxSim = allPairs.length ? Math.max(...cosines) : 0;
    const nearDuplicates = pairs.filter((p) => p.cosine >= 0.8);
    const top = [...pairs].sort((a, b) => b.cosine - a.cosine).slice(0, 3);
    const usable = allPairs.length >= 3;
    const signal = usable ? interpolateAnchors(this.meta.signalAnchors!.points, meanSim) : null;
    return {
      metrics: [
        metric("sentencePairs", "Pares de oraciones (todos)", allPairs.length, "pares"),
        metric("pairsWithOverlap", "Pares con ≥3 palabras en común", pairs.length, "pares"),
        metric(
          "meanPairSimilarity",
          "Similitud media (coseno, todos los pares)",
          meanSim,
          "0-1",
          "Incluye los pares sin solapamiento (similitud 0): no está condicionada al resultado.",
        ),
        metric(
          "meanPairSimilarityOverlapping",
          "Similitud media (solo pares con solapamiento)",
          pairs.length ? mean(pairs.map((p) => p.cosine)) : null,
          "0-1",
          "Diagnóstico; sesgada al alza por construcción.",
        ),
        metric("maxPairSimilarity", "Similitud máxima", maxSim, "0-1"),
        metric("nearDuplicateCount", "Oraciones casi duplicadas (≥0,8)", nearDuplicates.length, "oraciones"),
        metric("meanJaccard", "Jaccard medio", mean(pairs.map((p) => p.jaccard)), "0-1"),
        metric("topPairs", "Pares más similares", top.map((p) => `${p.cosine.toFixed(2)}: «${p.textA.slice(0, 60)}…» ↔ «${p.textB.slice(0, 60)}…»`).join(" | ") || "sin pares comparables"),
      ],
      signal,
      signalLabel: "Reformulación repetitiva del mismo contenido",
      evidence: evidenceFor(ctx, usable ? "medium" : "low", this.meta.minWords),
      notes: [
        "Similitud léxica (bolsa de palabras y coseno), no comprensión semántica.",
        `Pares con solapamiento insuficiente: ${allPairs.length - pairs.length} de ${allPairs.length}. La señal usa la media sobre todos los pares.`,
      ],
      warnings: usable ? [] : ["Menos de 3 pares comparables: la redundancia no es estimable."],
      meta: { topPairs: top.map(({ i, j, cosine }) => ({ i, j, cosine })) },
    };
  },
};
