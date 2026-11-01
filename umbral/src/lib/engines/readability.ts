import type { Engine } from "@/lib/types";
import { mean } from "@/lib/text/stats";
import { evidenceFor, countSyllablesEs, countSyllablesEn, metric } from "./helpers";
import { wordCount } from "@/lib/text/tokenize";

function infleszBand(score: number): string {
  if (score >= 80) return "muy fácil (para lectores infantiles)";
  if (score >= 65) return "fácil";
  if (score >= 55) return "algo fácil";
  if (score >= 45) return "normal";
  if (score >= 35) return "algo difícil";
  if (score >= 25) return "difícil";
  return "muy difícil";
}

export const readabilityEngine: Engine = {
  meta: {
    id: "readability.indices",
    name: "Legibilidad (índices en español e inglés)",
    kind: "linguistic",
    family: "linguistic-surface",
    version: "1.0.0",
    summary: "Fernández-Huerta, Szigriszt-Pazos/INFLESZ y Flesch (inglés) con recuento silábico aproximado.",
    methodology:
      "Se estiman las sílabas por palabra agrupando vocales y aplicando reglas de hiato documentadas. Con sílabas por palabra y palabras por oración se aplican las fórmulas clásicas de legibilidad para español y, en inglés, Flesch Reading Ease y Flesch-Kincaid.",
    variables: ["Sílabas por palabra", "Palabras por oración", "Longitud del texto"],
    formulas: [
      { name: "Fernández-Huerta", expression: "L = 206.84 − 0.60·P − 1.02·F", note: "P = sílabas por 100 palabras; F = oraciones por 100 palabras." },
      { name: "Szigriszt-Pazos / INFLESZ", expression: "P = 206.835 − 62.3·(S/Pal) − (Pal/Frases)" },
      { name: "Flesch Reading Ease", expression: "206.835 − 1.015·(palabras/oración) − 84.6·(sílabas/palabra)" },
      { name: "Flesch-Kincaid", expression: "0.39·(palabras/oración) + 11.8·(sílabas/palabra) − 15.59" },
    ],
    limitations: [
      "El recuento silábico es aproximado: no aplica acentuación, diptongos irregulares ni triptongos completos.",
      "La legibilidad no mide calidad ni autoría; mide dificultad de lectura estimada.",
      "Las fórmulas están validadas para prosa expositiva, no para verso ni diálogo.",
    ],
    languages: ["es", "en"],
    minWords: 60,
    external: false,
    validation: "descriptive",
    directionality: "non-directional",
    dependenceCluster: "sentence-rhythm",
    sharesVarianceWith: [
      { engine: "burstiness", reason: "Palabras por oración es una de sus entradas." },
      { engine: "syntax.complexity", reason: "Longitud oracional compartida." },
    ],
    supportsSegments: false,
    references: [
      "Fernández Huerta, J. (1959). Medidas sencillas de lecturabilidad.",
      "Szigriszt Pazos, F. (1992). Sistemas predictivos de legibilidad del mensaje escrito.",
      "Barrio-Cantalejo et al. (2008). Validación de la escala INFLESZ.",
    ],
  },
  run(ctx) {
    const isEn = ctx.language === "en";
    const words = ctx.words;
    const sentenceLengths = ctx.sentences.map((s) => wordCount(s)).filter((n) => n > 0);
    const syllables = words.reduce(
      (acc, w) => acc + (isEn ? countSyllablesEn(w) : countSyllablesEs(w)),
      0,
    );
    const wordsPerSentence = sentenceLengths.length ? mean(sentenceLengths) : 0;
    const syllablesPerWord = words.length ? syllables / words.length : 0;
    const per100Words = (n: number) => (words.length ? (n / words.length) * 100 : 0);
    const fernandezHuerta = 206.84 - 0.6 * per100Words(syllables) - 1.02 * per100Words(sentenceLengths.length);
    const szigriszt = 206.835 - 62.3 * syllablesPerWord - (wordsPerSentence || 1);
    const fleschEn = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
    const fkGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
    return {
      metrics: [
        metric("syllablesPerWord", "Sílabas por palabra", syllablesPerWord, "sílabas"),
        metric("wordsPerSentence", "Palabras por oración", wordsPerSentence, "palabras"),
        metric("fernandezHuerta", "Fernández-Huerta", fernandezHuerta, "0-100", "Mayor = más fácil."),
        metric("szigrisztPazos", "Szigriszt-Pazos", szigriszt, "0-100", infleszBand(szigriszt)),
        metric("inflesz", "INFLESZ", szigriszt, "0-100", infleszBand(szigriszt)),
        ...(isEn
          ? [
              metric("fleschReadingEase", "Flesch Reading Ease", fleschEn, "0-100"),
              metric("fleschKincaidGrade", "Flesch-Kincaid Grade", fkGrade, "curso"),
            ]
          : []),
        metric("syllableMethod", "Método silábico", isEn ? "grupos vocálicos (inglés)" : "grupos vocálicos + reglas de hiato (español)", undefined, "Aproximación, no diccionario silábico."),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "La legibilidad no se usa como señal de autoría.",
        isEn ? "En inglés también se informan las dos métricas de Flesch." : "Las fórmulas de Flesch no se aplican al español.",
      ],
      warnings: [],
    };
  },
};
