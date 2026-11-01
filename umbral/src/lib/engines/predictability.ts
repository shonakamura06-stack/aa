import type { Engine } from "@/lib/types";
import { interpolateAnchors } from "@/lib/text/stats";
import { evidenceFor, metric } from "./helpers";

/**
 * Previsibilidad estadística mediante estimación *leave-one-out* suavizada.
 *
 * Para cada token se estima su probabilidad con los conteos del propio texto
 * EXCLUYENDO la instancia evaluada (deleted estimation):
 *
 *   p₁(w)    = (c(w) − 1 + α) / (N − 1 + αV)
 *   p₂(w|a)  = (c(a,w) − 1 + α) / (c(a) − 1 + αV)      si c(a) > 1
 *   p(w|a)   = 0.6·p₂ + 0.4·p₁
 *
 * No hay fuga de información: el token evaluado no contribuye a su propia
 * probabilidad. La perplejidad informada es la de ESTE modelo de bigramas,
 * nunca la de un modelo de lenguaje neuronal.
 */
const ALPHA = 0.1;
const LAMBDA_BIGRAM = 0.6;
const LAMBDA_UNIGRAM = 0.4;

interface Counts {
  unigram: Map<string, number>;
  bigram: Map<string, number>;
  prev: Map<string, number>;
  total: number;
  vocabSize: number;
}

function buildCounts(tokens: string[]): Counts {
  const unigram = new Map<string, number>();
  const bigram = new Map<string, number>();
  const prev = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    unigram.set(tokens[i], (unigram.get(tokens[i]) ?? 0) + 1);
    if (i > 0) {
      const key = `${tokens[i - 1]} ${tokens[i]}`;
      bigram.set(key, (bigram.get(key) ?? 0) + 1);
      prev.set(tokens[i - 1], (prev.get(tokens[i - 1]) ?? 0) + 1);
    }
  }
  return { unigram, bigram, prev, total: tokens.length, vocabSize: unigram.size };
}

function probabilities(counts: Counts, a: string | null, w: string): { p1: number; mix: number; bigramSeen: boolean } {
  const { unigram, bigram, prev, total, vocabSize } = counts;
  const p1 = Math.max(1e-12, ((unigram.get(w) ?? 0) - 1 + ALPHA) / Math.max(1e-9, total - 1 + ALPHA * Math.max(1, vocabSize)));
  const prevCount = a ? (prev.get(a) ?? 0) : 0;
  const pairCount = a ? (bigram.get(`${a} ${w}`) ?? 0) : 0;
  let p2 = p1;
  if (a && prevCount > 1) {
    p2 = Math.max(0, (pairCount - 1 + ALPHA) / (prevCount - 1 + ALPHA * Math.max(1, vocabSize)));
  }
  const mix = Math.max(1e-12, LAMBDA_BIGRAM * p2 + LAMBDA_UNIGRAM * p1);
  return { p1, mix, bigramSeen: pairCount > 1 };
}

function entropyOf(tokens: string[], counts = buildCounts(tokens)) {
  let bitsUnigram = 0;
  let bitsMixed = 0;
  let n = 0;
  let seen = 0;
  for (let i = 0; i < tokens.length; i++) {
    const a = i > 0 ? tokens[i - 1] : null;
    const { p1, mix, bigramSeen } = probabilities(counts, a, tokens[i]);
    bitsUnigram -= Math.log2(p1);
    bitsMixed -= Math.log2(mix);
    if (bigramSeen) seen++;
    n++;
  }
  n = Math.max(1, n);
  return {
    unigramBits: bitsUnigram / n,
    bigramBits: bitsMixed / n,
    bigramSeenRate: seen / n,
    tokens: n,
  };
}

export const predictabilityEngine: Engine = {
  meta: {
    id: "predictability.perplexity",
    name: "Previsibilidad (bigramas, leave-one-out)",
    kind: "statistical",
    family: "information-theoretic",
    version: "1.1.0",
    summary:
      "Entropía cruzada y perplejidad de un modelo de bigramas estimado exclusivamente con el propio documento (leave-one-out). No es la perplejidad de un modelo de lenguaje externo.",
    methodology:
      "Cada token se evalúa con los conteos del texto excluyendo su propia instancia (deleted estimation con α = 0.1) e interpolando bigrama y unigrama (0.6 / 0.4). El resultado es una entropía cruzada en bits por palabra, estable con textos cortos y sin fuga de información. Se informa además la proporción de bigramas observados más de una vez.",
    variables: [
      "Secuencias de términos normalizados",
      "Conteos de unigramas y bigramas del propio texto",
      "Cobertura de contextos repetidos",
    ],
    formulas: [
      {
        name: "Unigrama suavizado (leave-one-out)",
        expression: "p₁(w) = (c(w) − 1 + α) / (N − 1 + αV)",
        note: "α = 0.1; V = tamaño del vocabulario.",
      },
      {
        name: "Bigrama suavizado (leave-one-out)",
        expression: "p₂(w|a) = (c(a,w) − 1 + α) / (c(a) − 1 + αV)",
        note: "Solo válido si c(a) > 1; si no, se retrocede al unigrama.",
      },
      { name: "Mezcla", expression: "p(w|a) = 0.6·p₂ + 0.4·p₁" },
      { name: "Entropía cruzada", expression: "H = −(1/N)·Σ log₂ p(wᵢ | wᵢ₋₁)", note: "bits por palabra." },
      { name: "Perplejidad", expression: "PP = 2^H", note: "Del modelo de bigramas propio, no de un LLM." },
      {
        name: "Previsibilidad relativa",
        expression: "PR = H_bigrama / H_unigrama",
        note: "Bajo = el contexto explica mucho del texto.",
      },
    ],
    limitations: [
      "No es la perplejidad de un modelo de lenguaje: es la entropía cruzada de un modelo de bigramas cuyos parámetros salen del propio documento.",
      "Al estimarse del propio texto, mide autoconsistencia interna, no la probabilidad de que un modelo externo hubiera escrito esto.",
      "Sensible a la longitud: con pocos tokens la cobertura de bigramas cae y la estimación se vuelve inestable (por eso exige 120 palabras y ≥10 % de bigramas repetidos).",
      "Sensible al vocabulario: nombres propios, tecnicismos y citas suben la perplejidad sin relación alguna con la autoría.",
      "La estimación dejando uno fuera no corrige el sesgo de tema, género textual ni registro.",
      "No hay ningún corpus de referencia en español implicado: comparar este valor entre documentos de temas distintos no es válido.",
    ],
    languages: ["es", "en"],
    minWords: 120,
    external: false,
    validation: "unvalidated",
    directionality: "directional",
    signalAnchors: {
      metric: "relativePredictability",
      rationale:
        "Una razón baja entre entropía de bigramas y de unigramas indica que el contexto explica gran parte del texto, es decir, alta previsibilidad secuencial. Anclas iniciales no calibradas con corpus etiquetado.",
      points: [
        [0.55, 0.85],
        [0.7, 0.62],
        [0.82, 0.42],
        [0.92, 0.25],
      ],
    },
    dependenceCluster: "information-theoretic",
    sharesVarianceWith: [
      { engine: "entropy.lexical", reason: "Comparte los conteos de unigramas y bigramas con la entropía léxica." },
    ],
    supportsSegments: true,
    segmentUnit: "previsibilidad relativa por oración (percentil dentro del texto)",
  },
  run(ctx) {
    const tokens = ctx.lowerWords;
    const counts = buildCounts(tokens);
    const overall = entropyOf(tokens, counts);
    const relative = overall.unigramBits === 0 ? 0 : overall.bigramBits / overall.unigramBits;
    const perplexity = 2 ** overall.bigramBits;
    const usable = tokens.length >= this.meta.minWords && overall.bigramSeenRate >= 0.1;
    const signal = usable ? interpolateAnchors(this.meta.signalAnchors!.points, relative) : null;

    // Puntuación por oración: entropía cruzada de cada oración con los conteos
    // globales, convertida a percentil dentro del texto (1 = más previsible).
    const perSentence = ctx.sentenceSpans.map((span) => {
      const local = (span.text.toLocaleLowerCase("es").match(/[\p{L}\p{M}]+/gu) ?? []);
      const ev = entropyOf(local, counts);
      return { ...span, crossEntropy: ev.bigramBits };
    });
    const ordered = [...perSentence].sort((a, b) => b.crossEntropy - a.crossEntropy);
    const rank = new Map<number, number>();
    ordered.forEach((item, i) => rank.set(item.start, ordered.length <= 1 ? 0.5 : 1 - i / (ordered.length - 1)));
    const segments = perSentence.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      score: Math.max(0, Math.min(1, rank.get(s.start) ?? 0.5)),
      engines: [this.meta.id],
    }));

    return {
      metrics: [
        metric("crossEntropyBits", "Entropía cruzada (bigramas)", overall.bigramBits, "bits/palabra"),
        metric(
          "bigramPerplexity",
          "Perplejidad del modelo interno de bigramas",
          perplexity,
          "PP",
          "2^H del modelo estimado con este mismo documento. No es la perplejidad de un modelo lingüístico externo.",
        ),
        metric(
          "isLanguageModelPerplexity",
          "¿Es perplejidad de un modelo de lenguaje?",
          "no",
          undefined,
          "No se usa ningún modelo externo ni corpus de referencia: no debe compararse con valores de GPT-2, Binoculars, DetectLLM u otros.",
        ),
        metric("unigramEntropy", "Entropía de unigramas", overall.unigramBits, "bits/palabra"),
        metric("relativePredictability", "Previsibilidad relativa (H_bigrama/H_unigrama)", relative, "ratio", "Menor = el contexto explica más el texto."),
        metric("bigramSeenRate", "Bigramas observados más de una vez", overall.bigramSeenRate, "0-1"),
        metric("vocabularyCoverage", "Cobertura de vocabulario", counts.vocabSize / Math.max(1, tokens.length), "0-1"),
        metric(
          "estimator",
          "Estimador",
          "leave-one-out suavizado (α = 0.1)",
          undefined,
          "Cada token se evalúa sin su propia instancia: no hay fuga de datos.",
        ),
      ],
      signal,
      signalLabel: "Alta autoconsistencia secuencial interna",
      evidence: evidenceFor(ctx, usable ? "medium" : "low", this.meta.minWords),
      notes: [
        "La perplejidad corresponde al modelo de bigramas de Umbral, no a un modelo neuronal.",
        `Tokens evaluados: ${overall.tokens}; bigramas repetidos: ${(overall.bigramSeenRate * 100).toFixed(1)} %.`,
      ],
      warnings: [
        ...(tokens.length < this.meta.minWords
          ? ["Menos de 120 palabras: la perplejidad de bigramas es orientativa y no se emite señal."]
          : []),
        ...(overall.bigramSeenRate < 0.1
          ? ["Menos del 10 % de los bigramas se repiten: la previsibilidad secuencial no es estimable de forma estable."]
          : []),
      ],
      segments,
      meta: { alpha: ALPHA, lambdas: [LAMBDA_BIGRAM, LAMBDA_UNIGRAM], seenRate: overall.bigramSeenRate },
    };
  },
};
