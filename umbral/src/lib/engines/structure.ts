import type { Engine } from "@/lib/types";
import { coefficientOfVariation, interpolateAnchors, mean, normalizedEntropy, sd } from "@/lib/text/stats";
import { evidenceFor, metric } from "./helpers";
import { wordCount } from "@/lib/text/tokenize";

export const structureEngine: Engine = {
  meta: {
    id: "structure.regularity",
    name: "Regularidad estructural",
    kind: "statistical",
    family: "repetition-structure",
    version: "1.0.0",
    summary: "Uniformidad de longitudes de párrafo y de oraciones por párrafo.",
    methodology:
      "Los párrafos se delimitan por líneas en blanco. Se analiza la distribución de palabras por párrafo y de oraciones por párrafo, más la entropía de los tramos de longitud detectados.",
    variables: ["Palabras por párrafo", "Oraciones por párrafo", "Distribución de tramos de longitud"],
    formulas: [
      { name: "CV de párrafo", expression: "CV_p = σ_p / μ_p" },
      { name: "Entropía de tramos", expression: "H_tramos = −Σ p_b log2 p_b", note: "b = tramo de 25 palabras." },
      { name: "Regularidad", expression: "1 − min(1, CV_p)" },
    ],
    limitations: [
      "Los párrafos dependen del formato de origen (saltos de línea manuales).",
      "Un texto de un solo párrafo no permite estimar regularidad estructural.",
      "La uniformidad estructural refleja también plantillas de redacción humanas.",
    ],
    languages: ["es", "en"],
    minWords: 80,
    external: false,
    validation: "unvalidated",
    directionality: "directional",
    signalAnchors: {
      metric: "paragraphLengthCV",
      rationale:
        "Párrafos de extensión casi idéntica sugieren generación por bloques. Anclas iniciales no calibradas; requiere al menos 3 párrafos.",
      points: [
        [0.05, 0.85],
        [0.2, 0.65],
        [0.4, 0.45],
        [0.7, 0.25],
      ],
    },
    dependenceCluster: "sentence-rhythm",
    sharesVarianceWith: [
      { engine: "burstiness", reason: "Misma variable de longitud, agregada por párrafo." },
    ],
    supportsSegments: false,
  },
  run(ctx) {
    const paraLengths = ctx.paragraphs.map((p) => wordCount(p)).filter((n) => n > 0);
    /**
     * Auditoría: el recuento por párrafo usaba una regex de signos finales,
     * mientras el resto del proyecto usa Intl.Segmenter. Dos metodologías de
     * segmentación en el mismo motor producían conteos incoherentes
     * («Hola. Adiós» = 1 con la regex si falta espacio, 2 con el segmentador).
     * Ahora se cuentan los spans de oración que caen dentro de cada párrafo.
     */
    const sentencesPerPara = ctx.paragraphSpans.map((span) => {
      const count = ctx.sentenceSpans.filter((sentence) => sentence.start >= span.start && sentence.end <= span.end).length;
      return Math.max(1, count);
    });
    const muP = mean(paraLengths);
    const sdP = sd(paraLengths);
    const cvP = coefficientOfVariation(paraLengths);
    const bins = new Map<number, number>();
    for (const l of paraLengths) bins.set(Math.floor(l / 25), (bins.get(Math.floor(l / 25)) ?? 0) + 1);
    const binEntropy = normalizedEntropy([...bins.values()]);
    // Con un solo tramo no hay entropía normalizada interpretable: 0/0.
    const binEntropyValue = bins.size <= 1 ? null : binEntropy;
    const usable = paraLengths.length >= 3;
    const signal = usable ? interpolateAnchors(this.meta.signalAnchors!.points, cvP) : null;
    return {
      metrics: [
        metric("paragraphCount", "Párrafos", paraLengths.length, "párrafos"),
        metric("meanParagraphWords", "Palabras por párrafo (media)", muP, "palabras"),
        metric("sdParagraphWords", "Desviación típica", sdP, "palabras"),
        metric("paragraphLengthCV", "CV de longitud de párrafo", cvP, "σ/μ", "Bajo = párrafos muy homogéneos."),
        metric("meanSentencesPerParagraph", "Oraciones por párrafo (media)", mean(sentencesPerPara), "oraciones"),
        metric("sentencesPerParagraphCV", "CV de oraciones por párrafo", coefficientOfVariation(sentencesPerPara), "σ/μ"),
        metric(
          "lengthBinEntropy",
          "Entropía de tramos de longitud",
          binEntropyValue,
          "0-1",
          "No calculable con un solo tramo de longitud.",
        ),
        metric("totalWords", "Palabras totales", ctx.wordCount, "palabras"),
      ],
      signal,
      signalLabel: "Estructura de bloques uniforme",
      evidence: evidenceFor(ctx, usable ? "medium" : "low", this.meta.minWords),
      notes: [
        "Los párrafos se detectan por líneas en blanco, no por estilo del documento.",
        `Tramos de longitud distintos: ${bins.size}.`,
      ],
      warnings: usable
        ? []
        : ["Menos de 3 párrafos: no se puede evaluar la regularidad estructural ni emitir señal."],
      meta: { paraLengths, sentencesPerPara },
    };
  },
};
