import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FEATURE_NAMES, type FeatureVector } from "./features";

/**
 * Artefacto de modelo exportado por ml/train.py (regresión logística
 * estandarizada). No se descarga nada automáticamente: si no existe el
 * archivo, la capa de ML se declara no disponible.
 */
export interface ModelArtifact {
  schemaVersion: 1;
  modelType: "logistic-regression";
  featureNames: string[];
  classes: [string, string];
  coefficients: number[];
  intercept: number;
  scaler: { mean: number[]; scale: number[] };
  metadata: {
    version: string;
    trainedAt: string;
    dataset: string;
    datasetLicense: string;
    languages: string[];
    splitStrategy: string;
    metrics: Record<string, number> | null;
    calibration: string | null;
    knownLimitations: string[];
  };
}

const CANDIDATE_PATHS = [
  process.env.UMBRAL_ML_MODEL_PATH,
  path.join(process.cwd(), "ml", "artifacts", "model.json"),
].filter(Boolean) as string[];

let cached: { model: ModelArtifact | null; path: string | null; error?: string } | null = null;

export function loadModel(): { model: ModelArtifact | null; path: string | null; error?: string } {
  if (cached) return cached;
  for (const candidate of CANDIDATE_PATHS) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as ModelArtifact;
      if (parsed.schemaVersion !== 1 || parsed.modelType !== "logistic-regression") {
        cached = { model: null, path: candidate, error: "Esquema de modelo no reconocido" };
        return cached;
      }
      if (parsed.featureNames.join(",") !== FEATURE_NAMES.join(",")) {
        cached = { model: null, path: candidate, error: "El modelo no coincide con las características actuales" };
        return cached;
      }
      cached = { model: parsed, path: candidate };
      return cached;
    } catch (error) {
      cached = { model: null, path: candidate, error: (error as Error).message };
      return cached;
    }
  }
  cached = { model: null, path: null };
  return cached;
}

export function predict(
  artifact: ModelArtifact,
  features: FeatureVector,
): { probability: number; contributions: Array<{ feature: string; value: number }> } {
  let z = artifact.intercept;
  const contributions: Array<{ feature: string; value: number }> = [];
  for (let i = 0; i < artifact.featureNames.length; i++) {
    const scale = artifact.scaler.scale[i] || 1;
    const standardized = (features[i] - artifact.scaler.mean[i]) / scale;
    const contribution = artifact.coefficients[i] * standardized;
    z += contribution;
    contributions.push({ feature: artifact.featureNames[i], value: contribution });
  }
  const probability = 1 / (1 + Math.exp(-z));
  contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { probability, contributions: contributions.slice(0, 6) };
}
