import type { SegmentScore } from "@/lib/types";

export type AdapterErrorCode =
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "quota"
  | "bad_request"
  | "payload_too_large"
  | "malformed_response"
  | "timeout"
  | "network"
  | "server";

export class AdapterError extends Error {
  code: AdapterErrorCode;
  status?: number;
  constructor(code: AdapterErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.status = status;
  }
}

export interface NormalizedDetection {
  provider: string;
  /** 0..1 según la escala del proveedor (1 = generado por IA). */
  score: number;
  aiFraction: number | null;
  verdict: string | null;
  lowConfidence: boolean;
  lowConfidenceReasons: string[];
  detectorVersion: string | null;
  detectedLanguage: string | null;
  sentences: SegmentScore[];
  tokenProbs: { tokens: string[]; probs: number[] } | null;
  retention: "zero" | "provider-default" | "unknown";
  raw: unknown;
}

export interface DetectOptions {
  apiKey: string;
  language?: "es" | "en" | "unknown";
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  zeroRetention: boolean;
}

export interface CommercialAdapter {
  id: string;
  name: string;
  vendor: string;
  docsUrl: string;
  endpoint: string;
  auth: "body-key" | "header-x-api-key";
  envKey: string;
  apiAvailability: "self-serve" | "enterprise-only" | "no-public-api";
  freeTier: string | null;
  pricing: string;
  maxChars: number;
  languages: string[];
  spanishSupported: boolean;
  sentenceScores: boolean;
  tokenScores: boolean;
  supportsZeroRetention: boolean;
  notes: string[];
  isConfigured(): boolean;
  detect(text: string, options: DetectOptions): Promise<NormalizedDetection>;
}
