import type { Engine } from "@/lib/types";
import { EN_CONNECTORS, ES_CONNECTORS } from "@/lib/text/lexicons";
import { evidenceFor, metric } from "./helpers";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countPhrase(haystack: string, phrase: string): number {
  const pattern = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(phrase)}(?![\\p{L}\\p{M}])`, "giu");
  return (haystack.match(pattern) ?? []).length;
}

export const connectorsEngine: Engine = {
  meta: {
    id: "discourse.connectors",
    name: "Conectores discursivos",
    kind: "linguistic",
    family: "linguistic-surface",
    version: "1.0.0",
    summary: "Frecuencia, posición, diversidad y concentración de conectores discursivos por función retórica.",
    methodology:
      "Se busca cada conector de una lista cerrada por función (adición, contraste, causa, consecuencia, ejemplificación, orden, conclusión, finalidad, condición, temporal) con límites de palabra. Se mide frecuencia por 100 palabras, proporción en posición inicial de oración, número de conectores distintos y concentración en el conector más usado.",
    variables: ["Apariciones por conector", "Función retórica", "Posición en la oración", "Conectores distintos"],
    formulas: [
      { name: "Densidad", expression: "CD = 100 · apariciones / palabras" },
      { name: "Inicialidad", expression: "CI = apariciones en inicio de oración / apariciones" },
      { name: "Diversidad", expression: "CDiv = conectores distintos / apariciones" },
      { name: "Concentración", expression: "CC = máximo de apariciones / total" },
    ],
    limitations: [
      "La lista es finita: no cubre todas las locuciones conectivas posibles.",
      "Un uso alto de conectores es un rasgo de registro académico, no una prueba de autoría.",
      "La detección de posición inicial es aproximada (primeros 12 caracteres de la oración).",
    ],
    languages: ["es", "en"],
    minWords: 80,
    external: false,
    validation: "unvalidated",
    directionality: "non-directional",
    dependenceCluster: "discourse-markers",
    sharesVarianceWith: [
      { engine: "stylometry.functionwords", reason: "Los conectores son un subconjunto de las palabras funcionales contadas por la estilometría." },
    ],
    supportsSegments: false,
  },
  run(ctx) {
    const table = ctx.language === "en" ? EN_CONNECTORS : ES_CONNECTORS;
    const lower = ctx.text.toLocaleLowerCase("es");
    const counts = new Map<string, number>();
    const byFunction: Record<string, number> = {};
    for (const [fn, list] of Object.entries(table)) {
      let total = 0;
      for (const phrase of list) {
        const c = countPhrase(lower, phrase);
        if (c > 0) counts.set(phrase, (counts.get(phrase) ?? 0) + c);
        total += c;
      }
      byFunction[fn] = total;
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const per100 = (100 * total) / Math.max(1, ctx.wordCount);
    /**
     * Auditoría: se comprobaba cada conector contra el inicio de la oración y
     * se sumaba 1 por coincidencia, de modo que «por lo tanto» podía contar
     * también como «por» si ambas formas están en la lista. Ahora se prueba de
     * la frase más larga a la más corta y se corta en la primera coincidencia:
     * una oración como máximo aporta una inicial.
     */
    const phrasesByLength = [...counts.keys()].sort((a, b) => b.length - a.length);
    let initial = 0;
    for (const sentence of ctx.sentences) {
      const head = sentence
        .toLocaleLowerCase("es")
        .replace(/^[\s«"“'¿¡(]+/u, "");
      const matched = phrasesByLength.find((phrase) => head.startsWith(phrase));
      if (matched) initial++;
    }
    const maxCount = Math.max(0, ...counts.values());
    const distinct = counts.size;
    const sentenceInitialRate = total ? Math.min(1, initial / total) : 0;
    return {
      metrics: [
        metric("connectorCount", "Conectores detectados", total, "apariciones"),
        metric("connectorDensity", "Densidad por 100 palabras", per100, "por 100 palabras"),
        metric("sentenceInitialRate", "Proporción en posición inicial", sentenceInitialRate, "0-1"),
        metric("distinctConnectors", "Conectores distintos", distinct, "tipos"),
        metric("connectorDiversity", "Diversidad de conectores", total ? distinct / total : 0, "0-1"),
        metric("topConnectorShare", "Concentración en el más usado", total ? maxCount / total : 0, "0-1"),
        metric("topConnectors", "Conectores más usados", [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, c]) => `${p} (${c})`).join(", ") || "ninguno"),
        metric("byFunction", "Reparto por función", Object.entries(byFunction).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(" · ") || "sin conectores"),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "Se informa la distribución completa porque la diversidad de conectores es tan relevante como su frecuencia.",
        per100 > 6 ? "Densidad alta: puede reflejar registro academicista o uso mecánico de conectores." : "Densidad dentro de rangos habituales de prosa argumentativa.",
      ],
      warnings: [],
      meta: { byFunction },
    };
  },
};
