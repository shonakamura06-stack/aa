import type { Engine } from "@/lib/types";
import { countBy, normalizedEntropy } from "@/lib/text/stats";
import { EN_FUNCTION_WORDS, ES_FUNCTION_WORDS } from "@/lib/text/lexicons";
import { evidenceFor, metric } from "./helpers";

/**
 * EXPERIMENTAL. Aproximación morfosintáctica por reglas y sufijos.
 * NO es etiquetado gramatical validado: no hay modelo entrenado, ni
 * desambiguación contextual. Se declara como heurística en toda la interfaz.
 */
const ES_NOUN_SUFFIX = ["ción","sión","dad","tad","eza","ismo","miento","ura","ancia","encia","ista","ólogo","aje","ero","era"];
const ES_ADJ_SUFFIX = ["oso","osa","able","ible","al","ico","ica","ivo","iva","ente","ado","ada","ido","ida"];
const ES_ADV_SUFFIX = ["mente"];
const ES_VERB_SUFFIX = ["ar","er","ir","ando","iendo","aba","aban","aron","ieron","amos","emos","imos","aste","iste"];
const EN_NOUN_SUFFIX = ["tion","sion","ment","ness","ity","ance","ence","ism","ist","er","or"];
const EN_ADJ_SUFFIX = ["ous","able","ible","al","ic","ive","ful","less","ary"];
const EN_ADV_SUFFIX = ["ly"];
const EN_VERB_SUFFIX = ["ing","ed","ize","ise","ate"];

export const morphosyntaxEngine: Engine = {
  meta: {
    id: "morphosyntax.profile",
    name: "Perfil morfosintáctico (experimental)",
    kind: "linguistic",
    family: "stylometric",
    version: "0.1.0-experimental",
    summary:
      "Distribución aproximada de categorías gramaticales por lista cerrada y sufijos. No es un etiquetador entrenado.",
    methodology:
      "Los tokens de clase cerrada se asignan por lista (determinantes, preposiciones, conjunciones, pronombres). El resto se aproxima por sufijos: nominalizaciones, adjetivos, adverbios en -mente y formas verbales. No existe desambiguación contextual.",
    variables: ["Sufijos derivativos", "Listas cerradas de funcionales", "Distribución de categorías aproximadas"],
    formulas: [
      { name: "Proporción de categoría", expression: "P_c = tokens_c / N" },
      { name: "Entropía del perfil", expression: "H = −Σ p_c log2 p_c" },
    ],
    limitations: [
      "Ambigüedad no resuelta: «la» puede ser artículo o pronombre; «como» preposición o conjunción.",
      "Los sufijos generan falsos positivos frecuentes (por ejemplo «real» como adjetivo y como sustantivo).",
      "Los participios en -ado/-ido se agrupan en una categoría ambigua aparte: sin contexto no puede decidirse si son verbo, adjetivo o sustantivo.",
      "No sustituye a un etiquetador como spaCy es_core_news_sm, que requeriría un modelo de ~12 MB y no está integrado en esta versión.",
      "No se debe usar para afirmar precisión morfosintáctica.",
    ],
    languages: ["es", "en"],
    minWords: 120,
    external: false,
    validation: "heuristic",
    directionality: "non-directional",
    dependenceCluster: "function-word-profile",
    sharesVarianceWith: [
      { engine: "stylometry.functionwords", reason: "Comparte las listas cerradas de funcionales." },
    ],
    supportsSegments: false,
  },
  run(ctx) {
    const isEn = ctx.language === "en";
    const closed = new Set(isEn ? EN_FUNCTION_WORDS : ES_FUNCTION_WORDS);
    const nounSuffix = isEn ? EN_NOUN_SUFFIX : ES_NOUN_SUFFIX;
    const adjSuffix = isEn ? EN_ADJ_SUFFIX : ES_ADJ_SUFFIX;
    const advSuffix = isEn ? EN_ADV_SUFFIX : ES_ADV_SUFFIX;
    const verbSuffix = isEn ? EN_VERB_SUFFIX : ES_VERB_SUFFIX;
    /**
     * «-ado/-ada/-ido/-ida» son participios: adjetivo, verbo o sustantivo según
     * el contexto. Como no hay desambiguación, se cuentan en una categoría
     * aparte en vez de atribuirlos al verbo (lo que inflaba esa clase).
     */
    const categories: Record<string, number> = {
      funcional: 0,
      nominal: 0,
      adjetivo: 0,
      adverbio: 0,
      verbo: 0,
      participio_ambiguo: 0,
      indeterminado: 0,
    };
    for (const w of ctx.lowerWords) {
      if (closed.has(w)) {
        categories.funcional++;
        continue;
      }
      if (advSuffix.some((s) => w.endsWith(s) && w.length > s.length + 2)) {
        categories.adverbio++;
        continue;
      }
      if (!isEn && /(ado|ada|ido|ida|idos|idas|ados|adas)$/.test(w) && w.length > 6) {
        categories.participio_ambiguo++;
        continue;
      }
      if (verbSuffix.some((s) => w.endsWith(s) && w.length > s.length + 2)) {
        categories.verbo++;
        continue;
      }
      if (nounSuffix.some((s) => w.endsWith(s) && w.length > s.length + 2)) {
        categories.nominal++;
        continue;
      }
      if (adjSuffix.some((s) => w.endsWith(s) && w.length > s.length + 2)) {
        categories.adjetivo++;
        continue;
      }
      categories.indeterminado++;
    }
    const n = Math.max(1, ctx.lowerWords.length);
    const counts = Object.values(categories);
    return {
      metrics: [
        ...Object.entries(categories).map(([k, v]) =>
          metric(`share_${k}`, `Proporción ${k}`, v / n, "0-1"),
        ),
        metric("categoryEntropy", "Entropía del perfil (normalizada)", normalizedEntropy(counts), "0-1"),
        metric("unresolvedShare", "Tokens sin categoría asignada", categories.indeterminado / n, "0-1"),
        metric("method", "Naturaleza del método", "heurística por sufijos y listas cerradas", undefined, "No es un etiquetador entrenado."),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "low", this.meta.minWords),
      notes: [
        "Módulo experimental: aporta contexto descriptivo y no vota en el índice agregado.",
        `Reparto: ${Object.entries(categories).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
      ],
      warnings: [
        "Sin desambiguación contextual. No interpretar como análisis morfosintáctico de precisión.",
      ],
      meta: { categories },
    };
  },
};
