import type { SegmentScore } from "@/lib/types";
import { AdapterError, type CommercialAdapter, type DetectOptions, type NormalizedDetection } from "./types";

/**
 * Adaptador Sapling AI Detector.
 * Contrato implementado a partir de https://sapling.ai/docs/api/detector/
 * consultado el 2026-10-30.
 *
 * Decisiones deliberadas:
 *  - zero_retention = true por defecto (el proveedor no conserva el texto).
 *  - create_report NUNCA se envía: guardaría el texto para generar un informe.
 *  - sent_scores = true para aprovechar sentence_scores y segments.
 */
export interface SaplingResponse {
  score?: number;
  ai_fraction?: number | null;
  verdict?: "human" | "mixed" | "ai";
  segments?: Array<{ start: number; end: number; score: number }>;
  low_confidence?: boolean;
  low_confidence_reasons?: string[];
  sentence_scores?: Array<{ score: number; sentence: string; start: number; end: number }>;
  tokens?: string[];
  token_probs?: number[];
  version?: string;
  text?: string;
  language?: { code?: string; name?: string; confidence?: number };
  msg?: string;
  error?: string;
}

/**
 * Sapling devuelve los offsets en **code points**; JavaScript indexa en unidades
 * UTF-16. Con emojis o caracteres fuera del BMP, usar el offset tal cual
 * desplazaba las oraciones marcadas. Esta función los traduce al índice de la
 * cadena que maneja la aplicación.
 */
export function codePointToUtf16(text: string, codePointIndex: number): number {
  if (codePointIndex <= 0) return 0;
  let units = 0;
  let points = 0;
  for (const char of text) {
    if (points >= codePointIndex) break;
    units += char.length;
    points += 1;
  }
  return units;
}

export function parseSaplingResponse(json: unknown, text?: string): NormalizedDetection {
  if (typeof json !== "object" || json === null) {
    throw new AdapterError("malformed_response", "Sapling devolvió una respuesta que no es un objeto JSON.");
  }
  const data = json as SaplingResponse;
  if (typeof data.score !== "number" || Number.isNaN(data.score)) {
    const msg = data.msg ?? data.error ?? "falta el campo «score»";
    throw new AdapterError("malformed_response", `Respuesta de Sapling sin puntuación válida: ${msg}`);
  }
  if (data.score < 0 || data.score > 1) {
    throw new AdapterError("malformed_response", `Puntuación de Sapling fuera de rango: ${data.score}`);
  }
  const sentences: SegmentScore[] = Array.isArray(data.sentence_scores)
    ? data.sentence_scores
        .filter((s) => typeof s?.score === "number" && typeof s?.start === "number" && typeof s?.end === "number")
        .map((s) => ({
          start: text ? codePointToUtf16(text, s.start) : s.start,
          end: text ? codePointToUtf16(text, s.end) : s.end,
          text: s.sentence ?? "",
          score: Math.min(1, Math.max(0, s.score)),
          engines: ["commercial.sapling"],
        }))
    : [];
  const tokenProbs =
    Array.isArray(data.tokens) && Array.isArray(data.token_probs) && data.tokens.length === data.token_probs.length
      ? { tokens: data.tokens, probs: data.token_probs }
      : null;
  return {
    provider: "sapling",
    score: data.score,
    aiFraction: typeof data.ai_fraction === "number" ? data.ai_fraction : null,
    verdict: data.verdict ?? null,
    lowConfidence: Boolean(data.low_confidence),
    lowConfidenceReasons: data.low_confidence_reasons ?? [],
    detectorVersion: data.version ?? null,
    detectedLanguage: data.language?.code ?? null,
    sentences,
    tokenProbs,
    retention: "zero",
    raw: json,
  };
}

function redact(body: string, apiKey: string | undefined): string {
  if (!apiKey) return body;
  return body.split(apiKey).join("[clave-oculta]");
}

function mapHttpError(status: number, body: string, apiKey?: string): AdapterError {
  // Nunca propagamos el cuerpo del proveedor sin depurar: podría repetir la
  // clave enviada o fragmentos del texto del usuario en un mensaje visible.
  const detail = redact(body, apiKey).slice(0, 300);
  if (status === 401) return new AdapterError("unauthorized", "Sapling rechazó la clave API (401).", status);
  if (status === 403) return new AdapterError("forbidden", "Sapling denegó el acceso (403).", status);
  if (status === 429) return new AdapterError("rate_limited", "Sapling devolvió límite de uso o cuota agotada (429).", status);
  if (status === 413) return new AdapterError("payload_too_large", "Texto demasiado largo para Sapling (413).", status);
  if (status >= 400 && status < 500) return new AdapterError("bad_request", `Sapling devolvió ${status}: ${detail}`, status);
  return new AdapterError("server", `Sapling devolvió ${status}: ${detail}`, status);
}

export const saplingAdapter: CommercialAdapter = {
  id: "sapling",
  name: "Sapling AI Detector",
  vendor: "Sapling Intelligence",
  docsUrl: "https://sapling.ai/docs/api/detector/",
  endpoint: "https://api.sapling.ai/api/v1/aidetect",
  auth: "body-key",
  envKey: "SAPLING_API_KEY",
  apiAvailability: "self-serve",
  freeTier: "Crédito de prueba para claves nuevas (consultar el panel del proveedor). No verificado en esta sesión.",
  pricing: "Desde 0,005 USD por 1000 caracteres con descuentos por volumen.",
  maxChars: 200_000,
  languages: ["en", "es", "pt", "fr", "de", "it", "nl", "ja"],
  spanishSupported: true,
  sentenceScores: true,
  tokenScores: true,
  supportsZeroRetention: true,
  notes: [
    "Incluye score global, ai_fraction, verdict, segments, sentence_scores y token_probs.",
    "El modelo multilingüe (ml20261009) se aplica automáticamente al español salvo que se fije «version».",
    "create_report no se envía nunca: guardaría el texto en el proveedor.",
  ],
  isConfigured() {
    return Boolean(process.env.SAPLING_API_KEY && process.env.SAPLING_API_KEY.trim().length >= 16);
  },
  async detect(text: string, options: DetectOptions): Promise<NormalizedDetection> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const payload: Record<string, unknown> = {
      key: options.apiKey,
      text,
      sent_scores: true,
      zero_retention: options.zeroRetention,
    };
    if (process.env.SAPLING_MODEL_VERSION) payload.version = process.env.SAPLING_MODEL_VERSION;
    if (options.language === "es" || options.language === "en") payload.lang = options.language;
    try {
      const response = await fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const rawText = await response.text();
      if (!response.ok) throw mapHttpError(response.status, rawText, options.apiKey);
      let json: unknown;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new AdapterError("malformed_response", "Sapling devolvió contenido que no es JSON.");
      }
      return parseSaplingResponse(json, text);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new AdapterError("timeout", `Sapling no respondió en ${options.timeoutMs} ms.`);
      }
      throw new AdapterError("network", `No se pudo contactar con Sapling: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  },
};
