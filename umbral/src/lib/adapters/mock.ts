import type { SegmentScore } from "@/lib/types";
import type { CommercialAdapter, DetectOptions, NormalizedDetection } from "./types";

/**
 * Adaptador de SIMULACIÓN. Solo sirve para probar la interfaz y los estados
 * del orquestador. Cada resultado se marca simulated: true y el agregador lo
 * excluye: nunca se presenta como detector real.
 */
const SENTENCE_SPLIT = /(?<=[.!?…])\s+/u;

export function buildMockDetection(text: string, options: DetectOptions): NormalizedDetection {
  const sentences = text.split(SENTENCE_SPLIT).filter((s) => s.trim().length > 0);
  let cursor = 0;
  const segments: SegmentScore[] = sentences.map((s, i) => {
    const start = text.indexOf(s, cursor);
    const from = start >= 0 ? start : cursor;
    cursor = from + s.length;
    const score = Math.min(0.99, 0.25 + 0.05 * (i % 7));
    return { start: from, end: from + s.length, text: s, score, engines: ["commercial.mock"] };
  });
  return {
    provider: "mock",
    score: 0.42,
    aiFraction: 0.33,
    verdict: "mixed",
    lowConfidence: true,
    lowConfidenceReasons: ["simulated"],
    detectorVersion: "mock-0.0.0",
    detectedLanguage: options.language ?? "unknown",
    sentences: segments,
    tokenProbs: null,
    retention: "zero",
    raw: { simulated: true, note: "Respuesta ficticia generada localmente para pruebas de interfaz." },
  };
}

export const mockAdapter: CommercialAdapter = {
  id: "mock",
  name: "Proveedor simulado",
  vendor: "Umbral (pruebas)",
  docsUrl: "",
  endpoint: "local://mock",
  auth: "body-key",
  envKey: "UMBRAL_ALLOW_MOCK",
  apiAvailability: "no-public-api",
  freeTier: null,
  pricing: "Simulación local, sin coste.",
  maxChars: 30_000,
  languages: ["es", "en"],
  spanishSupported: true,
  sentenceScores: true,
  tokenScores: false,
  supportsZeroRetention: true,
  notes: [
    "No es un detector: genera respuestas ficticias para probar interfaz y estados.",
    "Sus resultados llevan simulated: true y el agregador los descarta.",
  ],
  isConfigured() {
    return process.env.UMBRAL_ALLOW_MOCK === "true";
  },
  async detect(text: string, options: DetectOptions): Promise<NormalizedDetection> {
    return buildMockDetection(text, options);
  },
};
