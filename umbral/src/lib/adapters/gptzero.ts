import type { SegmentScore } from "@/lib/types";
import { AdapterError, type CommercialAdapter, type DetectOptions, type NormalizedDetection } from "./types";

/**
 * Adaptador GPTZero.
 * Contrato implementado a partir de https://docs.gptzero.me/ (consultado 2026-10-30).
 * Endpoint: POST https://api.gptzero.me/v2/predict/text con cabecera x-api-key.
 *
 * El parser es tolerante porque el esquema v2 convive con campos heredados
 * (completely_generated_prob, average_generated_prob) y con class_probabilities.
 */
export interface GptZeroDocument {
  predicted_class?: "human" | "ai" | "mixed";
  class_probabilities?: { human?: number; ai?: number; mixed?: number };
  confidence_category?: "high" | "medium" | "low";
  document_classification?: string;
  completely_generated_prob?: number;
  average_generated_prob?: number;
  overall_burstiness?: number;
  sentences?: Array<{ sentence?: string; generated_prob?: number; perplexity?: number; highlight_sentence_for_ai?: boolean }>;
  paragraphs?: Array<{ start_sentence_index?: number; num_sentences?: number; completely_generated_prob?: number }>;
  result_message?: string;
}

export interface GptZeroResponse {
  documents?: GptZeroDocument[];
  version?: string;
  scanId?: string;
  error?: string;
  message?: string;
}

export function parseGptZeroResponse(json: unknown): NormalizedDetection {
  if (typeof json !== "object" || json === null) {
    throw new AdapterError("malformed_response", "GPTZero devolvió una respuesta que no es un objeto JSON.");
  }
  const data = json as GptZeroResponse;
  const doc = Array.isArray(data.documents) ? data.documents[0] : undefined;
  if (!doc || typeof doc !== "object") {
    throw new AdapterError(
      "malformed_response",
      `GPTZero no devolvió documentos: ${data.error ?? data.message ?? "respuesta vacía"}`,
    );
  }
  const probabilities = doc.class_probabilities ?? {};
  let score: number | null = null;
  if (typeof probabilities.ai === "number") score = probabilities.ai;
  else if (typeof doc.completely_generated_prob === "number") score = doc.completely_generated_prob;
  else if (typeof doc.average_generated_prob === "number") score = doc.average_generated_prob;
  if (score === null || Number.isNaN(score)) {
    throw new AdapterError("malformed_response", "GPTZero devolvió un documento sin probabilidad utilizable.");
  }
  const sentenceScores = Array.isArray(doc.sentences) ? doc.sentences : [];
  const sentences: SegmentScore[] = [];
  let cursor = 0;
  for (const s of sentenceScores) {
    if (typeof s?.generated_prob !== "number" || typeof s?.sentence !== "string") continue;
    const text = s.sentence;
    sentences.push({
      start: cursor,
      end: cursor + text.length,
      text,
      score: Math.min(1, Math.max(0, s.generated_prob)),
      engines: ["commercial.gptzero"],
    });
    cursor += text.length + 1;
  }
  return {
    provider: "gptzero",
    score: Math.min(1, Math.max(0, score)),
    aiFraction:
      typeof probabilities.mixed === "number" ? Math.min(1, Math.max(0, probabilities.mixed)) : null,
    verdict: doc.predicted_class ?? doc.document_classification ?? null,
    lowConfidence: doc.confidence_category === "low",
    lowConfidenceReasons: doc.confidence_category ? [`confidence_category=${doc.confidence_category}`] : [],
    detectorVersion: data.version ?? null,
    detectedLanguage: null,
    sentences,
    tokenProbs: null,
    retention: "provider-default",
    raw: json,
  };
}

export const gptzeroAdapter: CommercialAdapter = {
  id: "gptzero",
  name: "GPTZero",
  vendor: "GPTZero",
  docsUrl: "https://docs.gptzero.me/",
  endpoint: "https://api.gptzero.me/v2/predict/text",
  auth: "header-x-api-key",
  envKey: "GPTZERO_API_KEY",
  apiAvailability: "self-serve",
  freeTier: "No verificado en esta sesión; depende del plan contratado.",
  pricing: "Planes por volumen de palabras; sin tarifa por carácter verificada aquí.",
  maxChars: 150_000,
  languages: ["en", "es", "fr", "de", "pt"],
  spanishSupported: true,
  sentenceScores: true,
  tokenScores: false,
  supportsZeroRetention: false,
  notes: [
    "Detecta el idioma automáticamente y usa modelo multilingüe para textos no ingleses.",
    "No se documenta un parámetro de retención cero: el adaptador lo declara como «provider-default».",
    "No se ha ejecutado contra la API real en este entorno (red saliente bloqueada).",
  ],
  isConfigured() {
    return Boolean(process.env.GPTZERO_API_KEY && process.env.GPTZERO_API_KEY.trim().length >= 8);
  },
  async detect(text: string, options: DetectOptions): Promise<NormalizedDetection> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": options.apiKey },
        body: JSON.stringify({ document: text }),
        signal: controller.signal,
      });
      const rawText = await response.text();
      if (!response.ok) {
        // Se depura la clave antes de incluir cualquier fragmento del cuerpo.
        const detail = rawText.split(options.apiKey).join("[clave-oculta]").slice(0, 300);
        if (response.status === 401) throw new AdapterError("unauthorized", "GPTZero rechazó la clave API (401).", 401);
        if (response.status === 403) throw new AdapterError("forbidden", "GPTZero denegó el acceso (403).", 403);
        if (response.status === 429) throw new AdapterError("rate_limited", "GPTZero devolvió límite de uso (429).", 429);
        throw new AdapterError("server", `GPTZero devolvió ${response.status}: ${detail}`, response.status);
      }
      let json: unknown;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new AdapterError("malformed_response", "GPTZero devolvió contenido que no es JSON.");
      }
      return parseGptZeroResponse(json);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new AdapterError("timeout", `GPTZero no respondió en ${options.timeoutMs} ms.`);
      }
      throw new AdapterError("network", `No se pudo contactar con GPTZero: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  },
};
