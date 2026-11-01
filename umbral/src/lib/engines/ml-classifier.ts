import type { Engine, EngineOutput } from "@/lib/types";
import { computeFeatureVector, FEATURE_NAMES } from "@/lib/ml/features";
import { loadModel, predict } from "@/lib/ml/model";
import { EngineUnavailableError } from "./errors";
import { evidenceFor, metric } from "./helpers";

export const mlClassifierEngine: Engine = {
  meta: {
    id: "ml.stylometric-classifier",
    name: "Clasificador estilométrico entrenado",
    kind: "trained-classifier",
    family: "trained-classifier",
    version: "0.1.0",
    summary:
      "Regresión logística sobre 22 características estilométricas. Requiere un artefacto entrenado con datos etiquetados y evidencia de validación.",
    methodology:
      "Pipeline de ml/train.py: deduplicación por similitud, separación por autor y por modelo generador, estandarización, regresión logística class-balanced y exportación a JSON con métricas fuera de muestra. La inferencia en Umbral aplica exactamente el mismo vector de 22 características.",
    variables: FEATURE_NAMES as unknown as string[],
    formulas: [
      { name: "Regresión logística", expression: "p = 1 / (1 + e^−(β₀ + Σ βᵢ·zᵢ))", note: "zᵢ = característica estandarizada." },
      { name: "Estandarización", expression: "zᵢ = (xᵢ − μᵢ) / σᵢ" },
    ],
    limitations: [
      "Sin dataset etiquetado con licencia y separación estricta no hay modelo: el motor queda deshabilitado y no vota.",
      "Estas características no son causales de autoría; el clasificador aprende sesgos del corpus de entrenamiento.",
      "Un modelo entrenado solo en inglés no es válido para español sin evaluación independiente.",
      "No se declara precisión sin métricas fuera de muestra con intervalos de confianza.",
    ],
    languages: ["es", "en"],
    minWords: 150,
    external: false,
    validation: "unvalidated",
    directionality: "directional",
    signalAnchors: {
      metric: "probabilityAI",
      rationale: "La salida del clasificador es directamente su probabilidad calibrada; no se remapea.",
      points: [
        [0, 0],
        [1, 1],
      ],
    },
    dependenceCluster: "trained-classifier",
    sharesVarianceWith: [
      { engine: "entropy.lexical", reason: "El vector de características incluye entropía y diversidad calculadas de forma equivalente." },
      { engine: "burstiness", reason: "El vector de características incluye longitudes de oración." },
    ],
    supportsSegments: false,
    references: ["Solaiman et al. (2019). Release Strategies and the Social Impacts of Language Models (detector GPT-2)."],
  },
  run(ctx): EngineOutput {
    const loaded = loadModel();
    if (!loaded.model) {
      throw new EngineUnavailableError(
        loaded.error
          ? `Modelo no utilizable: ${loaded.error}.`
          : "Sin dataset etiquetado no se ha entrenado el clasificador. Ejecuta ml/train.py con datos licenciados para habilitarlo.",
      );
    }
    const features = computeFeatureVector(ctx.text);
    const { probability, contributions } = predict(loaded.model, features);
    const meta = loaded.model.metadata;
    const validated = meta.metrics !== null;
    return {
      metrics: [
        metric("probabilityAI", "Probabilidad del clasificador", probability, "0-1"),
        metric("modelVersion", "Versión del modelo", meta.version),
        metric("trainingDataset", "Dataset de entrenamiento", meta.dataset),
        metric("datasetLicense", "Licencia del dataset", meta.datasetLicense),
        metric(
          "metrics",
          "Métricas fuera de muestra",
          validated ? JSON.stringify(meta.metrics) : "no declaradas",
          undefined,
          "Sin métricas no se presenta como validado.",
        ),
        metric(
          "topContributions",
          "Características con mayor peso",
          contributions.map((c) => `${c.feature} (${c.value.toFixed(2)})`).join(", "),
        ),
      ],
      signal: probability,
      signalLabel: "Probabilidad estimada por el clasificador estilométrico",
      evidence: validated ? evidenceFor(ctx, "high", this.meta.minWords) : evidenceFor(ctx, "low", this.meta.minWords),
      notes: [
        `Artefacto cargado desde ${loaded.path}.`,
        `Método de separación de datos: ${meta.splitStrategy}.`,
        `Calibración declarada: ${meta.calibration ?? "no declarada"}.`,
      ],
      warnings: [
        ...(validated ? [] : ["El modelo no declara métricas de evaluación: su salida no se pondera como validada."]),
        ...meta.knownLimitations,
      ],
      meta: { metadata: meta, contributions },
    };
  },
};
