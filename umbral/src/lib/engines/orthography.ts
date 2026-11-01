import type { Engine } from "@/lib/types";
import { countBy, normalizedEntropy } from "@/lib/text/stats";
import { evidenceFor, metric } from "./helpers";

const PUNCT = [".", ",", ";", ":", "?", "!", "…", "(", ")", "-", "–", "—", "«", "»", "\"", "'", "¿", "¡"];

export const orthographyEngine: Engine = {
  meta: {
    id: "orthography.punctuation",
    name: "Puntuación y ortografía",
    kind: "linguistic",
    family: "linguistic-surface",
    version: "1.0.0",
    summary: "Distribución de signos de puntuación, hábitos tipográficos y marcas de descuido mecánico.",
    methodology:
      "Se cuentan los signos de puntuación del texto y se calculan ratios por oración y por coma. Se detectan patrones tipográficos: espacios antes de signo, falta de espacio tras coma, espacios dobles, comillas mezcladas, puntuación repetida y uso de signos de apertura del español.",
    variables: ["Frecuencia por signo", "Ratios coma/oración", "Patrones tipográficos", "Uso de acentos"],
    formulas: [
      { name: "Densidad de puntuación", expression: "DP = signos / oraciones" },
      { name: "Entropía de signos", expression: "H_s = −Σ p(s) log2 p(s)" },
      { name: "Ratio coma/punto", expression: "RC = comas / puntos" },
    ],
    limitations: [
      "La puntuación correcta no es señal de texto artificial: no se interpreta en esa dirección.",
      "Los hábitos tipográficos varían por plataforma, corrector y registro.",
      "No se evalúa corrección gramatical ni ortográfica léxica: no hay diccionario integrado.",
    ],
    languages: ["es", "en"],
    minWords: 50,
    external: false,
    validation: "descriptive",
    directionality: "non-directional",
    dependenceCluster: "orthography",
    supportsSegments: false,
  },
  run(ctx) {
    const counts = new Map<string, number>();
    for (const sign of PUNCT) {
      const escaped = sign.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const c = (ctx.text.match(new RegExp(escaped, "gu")) ?? []).length;
      if (c > 0) counts.set(sign, c);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const sentences = Math.max(1, ctx.sentences.length);
    const commas = counts.get(",") ?? 0;
    const periods = counts.get(".") ?? 0;
    const spaceBefore = (ctx.text.match(/\s+[.,;:!?]/gu) ?? []).length;
    const missingSpaceAfter = (ctx.text.match(/[.,;:](?=[\p{L}])/gu) ?? []).length;
    const doubleSpaces = (ctx.text.match(/ {2,}/gu) ?? []).length;
    const repeated = (ctx.text.match(/[!?]{2,}|\.{4,}/gu) ?? []).length;
    const lowercaseStarts = ctx.sentences.filter((s) => /^[a-záéíóúñü]/.test(s)).length;
    const accents = (ctx.text.match(/[áéíóúüñÁÉÍÓÚÜÑ]/gu) ?? []).length;
    const spanishOpeners = (ctx.text.match(/[¿¡]/gu) ?? []).length;
    const spanishClosers = (ctx.text.match(/[?!]/gu) ?? []).length;
    const straightQuotes = (ctx.text.match(/"/g) ?? []).length;
    const typographicQuotes = (ctx.text.match(/[«»“”]/gu) ?? []).length;
    const emDashes = (ctx.text.match(/—/gu) ?? []).length;
    const digits = (ctx.text.match(/\d/gu) ?? []).length;
    return {
      metrics: [
        metric("punctuationTotal", "Signos de puntuación", total, "signos"),
        metric("punctuationPerSentence", "Signos por oración", total / sentences, "ratio"),
        metric("commaPerSentence", "Comas por oración", commas / sentences, "ratio"),
        metric("commaPeriodRatio", "Ratio coma/punto", periods ? commas / periods : 0, "ratio"),
        metric("symbolEntropy", "Entropía de signos (normalizada)", normalizedEntropy([...counts.values()]), "0-1"),
        metric("spaceBeforePunctuation", "Espacios antes de signo", spaceBefore, "ocurrencias"),
        metric("missingSpaceAfter", "Falta de espacio tras signo", missingSpaceAfter, "ocurrencias"),
        metric("doubleSpaces", "Espacios dobles", doubleSpaces, "ocurrencias"),
        metric("repeatedPunctuation", "Puntuación repetida (!!, ¿?)", repeated, "ocurrencias"),
        metric("lowercaseSentenceStarts", "Oraciones que empiezan en minúscula", lowercaseStarts, "oraciones"),
        metric("accentDensity", "Densidad de caracteres acentuados", accents / Math.max(1, ctx.characterCount), "por carácter"),
        metric("spanishOpeners", "Signos de apertura ¿ ¡", spanishOpeners, "ocurrencias"),
        metric("quoteStyles", "Comillas", `rectas: ${straightQuotes} · tipográficas: ${typographicQuotes}`),
        metric("emDashes", "Rayas (—)", emDashes, "ocurrencias"),
        metric("digitDensity", "Densidad de dígitos", digits / Math.max(1, ctx.characterCount), "por carácter"),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "Ninguno de estos indicadores se interpreta como prueba de autoría.",
        "Los patrones tipográficos sirven como diagnóstico de revisión editorial.",
      ],
      warnings: [
        ...(spaceBefore > 0 ? [`${spaceBefore} signo(s) con espacio previo.`] : []),
        ...(missingSpaceAfter > 0 ? [`${missingSpaceAfter} signo(s) sin espacio posterior.`] : []),
        ...(ctx.language === "es" && spanishClosers > spanishOpeners
          ? [`Hay ${spanishClosers} signos de cierre ?! y solo ${spanishOpeners} de apertura ¿¡.`]
          : []),
      ],
      meta: { counts: Object.fromEntries(counts) },
    };
  },
};
