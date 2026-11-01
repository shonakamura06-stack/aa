import { deflateRawSync } from "node:zlib";
import type { Engine } from "@/lib/types";
import { evidenceFor, metric, mulberry32 } from "./helpers";

/**
 * Complejidad por compresión: relación de compresión de deflate sobre el texto
 * y comparación con una línea base de palabras barajadas de forma determinista.
 */
export const compressionEngine: Engine = {
  meta: {
    id: "compression.complexity",
    name: "Complejidad por compresión",
    kind: "statistical",
    family: "information-theoretic",
    version: "1.0.0",
    summary: "Relación de compresión deflate y redundancia secuencial frente a una línea base barajada.",
    methodology:
      "Se comprime el texto con deflate (nivel 9) y se compara con la compresión de la misma lista de palabras reordenada de forma pseudoaleatoria con semilla fija. La diferencia aísla la redundancia que proviene del orden de las palabras de la que proviene del vocabulario.",
    variables: ["Bytes UTF-8 del texto", "Bytes comprimidos", "Comprimiión de la versión barajada"],
    formulas: [
      { name: "Relación de compresión", expression: "CR = bytes_comprimidos / bytes_originales" },
      { name: "Redundancia secuencial", expression: "RS = 1 − CR / CR_barajado", note: ">0 = el orden aporta estructura." },
    ],
    limitations: [
      "Deflate detecta repeticiones de corto alcance; no modela estructura semántica.",
      "El resultado depende del idioma y de la codificación UTF-8.",
      "No se interpreta como señal de autoría.",
    ],
    languages: ["es", "en"],
    minWords: 60,
    external: false,
    validation: "descriptive",
    directionality: "non-directional",
    dependenceCluster: "information-theoretic",
    sharesVarianceWith: [
      { engine: "entropy.lexical", reason: "La compresibilidad y la entropía empírica miden redundancia del mismo flujo de tokens." },
      { engine: "predictability.perplexity", reason: "Ambas estiman cuánta estructura secuencial hay en el texto." },
    ],
    supportsSegments: false,
    references: ["Grassegger et al. (2021). Low-Resource Text Classification: A Parameter-Free Classification Method with Compressors (variante conceptual)."],
  },
  run(ctx) {
    /**
     * Corrección de auditoría: la versión anterior comprimía el texto original
     * (con mayúsculas, puntuación y espacios) y lo comparaba con las palabras
     * barajadas unidas por un espacio simple. La diferencia no medía el orden
     * de las palabras: medía la puntuación eliminada. Ahora ambos lados usan
     * exactamente el mismo flujo de tokens normalizados.
     */
    const rawBuffer = Buffer.from(ctx.text, "utf8");
    const ordered = Buffer.from(ctx.lowerWords.join(" "), "utf8");
    const compressed = deflateRawSync(ordered, { level: 9 });
    const words = [...ctx.lowerWords];
    const rand = mulberry32(0x5eed);
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
    const shuffledBuffer = Buffer.from(words.join(" "), "utf8");
    const shuffledCompressed = deflateRawSync(shuffledBuffer, { level: 9 });
    const cr = ordered.length ? compressed.length / ordered.length : 0;
    const crShuffled = shuffledBuffer.length ? shuffledCompressed.length / shuffledBuffer.length : 0;
    const sequentialRedundancy = crShuffled === 0 ? 0 : 1 - cr / crShuffled;
    return {
      metrics: [
        metric("originalBytes", "Bytes originales (UTF-8)", rawBuffer.length, "bytes"),
        metric(
          "baselineBytes",
          "Bytes de la secuencia normalizada",
          ordered.length,
          "bytes",
          "Misma secuencia de tokens que la línea base barajada: la comparación aísla el orden.",
        ),
        metric("compressedBytes", "Bytes comprimidos", compressed.length, "bytes"),
        metric("compressionRatio", "Relación de compresión", cr, "0-1", "Menor = texto más compresible."),
        metric("shuffledCompressionRatio", "Relación con palabras barajadas", crShuffled, "0-1"),
        metric("sequentialRedundancy", "Redundancia secuencial", sequentialRedundancy, "−1..1", "Positivo = el orden de las palabras aporta estructura repetitiva."),
        metric(
          "bitsPerCharacter",
          "Bits por token tras compresión",
          ordered.length ? (compressed.length * 8) / ordered.length : 0,
          "bits",
        ),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "La línea base barajada usa una semilla fija, por lo que el cálculo es reproducible.",
        "Medida descriptiva: no se usa como voto en el índice agregado.",
      ],
      warnings: ctx.wordCount < this.meta.minWords ? ["Texto corto: la línea base barajada es poco representativa."] : [],
    };
  },
};
