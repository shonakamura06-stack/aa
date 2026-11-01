/**
 * Umbral — contratos de datos compartidos entre motores, orquestador,
 * agregador, adaptadores e interfaz.
 *
 * Regla del proyecto: ninguna puntuación de un motor se presenta como
 * probabilidad de autoría. `signal` es la **intensidad normalizada de un rasgo
 * descriptivo** (0-1) según anclas declaradas y no calibradas; no es una
 * probabilidad ni un voto sobre quién escribió el texto.
 */
import { z } from "zod";

export type Language = "es" | "en" | "unknown";
export type SupportedLanguage = "es" | "en";

/** Naturaleza epistemológica del módulo. Se muestra siempre en la interfaz. */
export type EngineKind =
  | "statistical"
  | "linguistic"
  | "trained-classifier"
  | "academic"
  | "commercial";

/** Familia metodológica: se usa para descontar dependencia entre motores. */
export type EngineFamily =
  | "information-theoretic"
  | "repetition-structure"
  | "stylometric"
  | "linguistic-surface"
  | "trained-classifier"
  | "commercial";

export type ValidationStatus =
  | "external-benchmark" // evaluado contra referencias externas publicadas
  | "internally-evaluated" // evaluado por nosotros con datos separados
  | "vendor-claim" // el proveedor declara precisión; no replicada aquí
  | "unvalidated" // método implementado, sin evaluación empírica propia
  | "heuristic" // aproximación por reglas, sin garantía de precisión
  | "descriptive"; // medida descriptiva, sin interpretación direccional

export type EngineStatus = "ok" | "error" | "timeout" | "unavailable" | "skipped";

export type EvidenceLevel = "insufficient" | "low" | "medium" | "high";

export interface Metric {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  /** Cómo debe leerse el valor; nunca una conclusión de autoría. */
  interpretation?: string;
}

export interface Formula {
  name: string;
  expression: string;
  note?: string;
}

export interface EngineMeta {
  id: string;
  name: string;
  kind: EngineKind;
  family: EngineFamily;
  version: string;
  /** Qué mide, en una frase. */
  summary: string;
  methodology: string;
  variables: string[];
  formulas: Formula[];
  limitations: string[];
  languages: SupportedLanguage[];
  minWords: number;
  /** Necesita Internet y credenciales. */
  external: boolean;
  validation: ValidationStatus;
  /**
   * ¿Tiene una dirección interpretativa documentada? Un motor direccional
   * transforma una métrica en intensidad 0-1 mediante anclas heurísticas; un
   * motor no direccional solo informa métricas y no entra en el compuesto.
   */
  directionality: "directional" | "non-directional";
  /** Solo si directionality === "directional": anclas de la normalización. */
  signalAnchors?: {
    metric: string;
    rationale: string;
    /** Pares [valor_bruto, intensidad_0_1]. NO son probabilidades ni están calibradas. */
    points: Array<[number, number]>;
  };
  /**
   * Grupo de dependencia metodológica. Los motores de un mismo grupo miden la
   * misma variable subyacente (o una transformación de ella) y comparten un
   * único voto en el agregador. Se declara aquí, no se estima con el documento.
   */
  dependenceCluster: string;
  /** Motores de otros grupos con los que comparte varianza, y por qué. */
  sharesVarianceWith?: Array<{ engine: string; reason: string }>;
  supportsSegments: boolean;
  /** Qué representa la puntuación por fragmento, si el motor la aporta. */
  segmentUnit?: string;
  references?: string[];
}

export interface EngineRun {
  id: string;
  status: EngineStatus;
  durationMs: number;
  metrics: Metric[];
  /**
   * 0..1 = intensidad normalizada del rasgo (no probabilidad de autoría).
   * null cuando el motor no aplica, no es direccional o no hay base suficiente.
   */
  signal: number | null;
  signalLabel?: string;
  evidence: EvidenceLevel;
  notes: string[];
  warnings: string[];
  /** Resultados por fragmento aportados por el propio motor. */
  segments?: SegmentScore[];
  error?: string;
  /** true solo en modo simulación de pruebas; jamás entra al agregador real. */
  simulated?: boolean;
  meta?: Record<string, unknown>;
}

export interface SegmentScore {
  start: number;
  end: number;
  text: string;
  score: number;
  engines: string[];
}

/** Estado de disponibilidad que se publica en /api/engines. */
export interface EngineAvailability {
  id: string;
  status: "ready" | "not-configured" | "disabled-by-user" | "dataset-required" | "unsupported-language";
  detail: string;
}

export interface QuotaState {
  provider: string;
  requests: number;
  charsSent: number;
  charBudget: number;
  remainingBudget: number;
  lastRun: string | null;
  authorized: boolean;
  estimatedCostUsd: number;
  costModel: string;
  freeTierClaim: string | null;
  exhausted: boolean;
}

export interface AggregateSummary {
  /** Compuesto heurístico 0..100 de intensidad de rasgos. null si no hay base suficiente. */
  signalIndex: number | null;
  /** Declaración explícita de qué es esta escala. */
  indexKind: "heuristic-composite";
  calibrated: false;
  indexNote: string;
  signalBand: "bajo" | "medio" | "alto" | "no calculable";
  /** Umbrales de la banda: solo presentación, no calibración. */
  bandThresholds: { low: number; high: number; note: string };
  /** Dispersión observada entre grupos (mín-máx). No es un intervalo de confianza. */
  signalRange: [number, number] | null;
  /** Siempre null: no existe calibración validada. */
  probability: null;
  probabilityMessage: string;
  /** Siempre null: Umbral no emite veredicto de autoría. */
  authorshipConclusion: null;
  authorshipMessage: string;
  evidence: {
    level: EvidenceLevel;
    /** Qué significa este nivel (cobertura metodológica, no acierto). */
    definition: string;
    reasons: string[];
  };
  /** Acuerdo entre motores: no calculable sin decisiones binarias válidas. */
  agreement: {
    score: null;
    label: "no calculable";
    method: string;
    reason: string;
  };
  /** Dispersión descriptiva entre grupos; no es acuerdo ni acierto. */
  dispersion: {
    sd: number | null;
    spreadPoints: number | null;
    groups: number;
    note: string;
  };
  /** Grupos de dependencia: un grupo = un voto. */
  groups: Array<{
    id: string;
    label: string;
    engines: string[];
    families: EngineFamily[];
    signal: number | null;
    weight: number;
    note: string;
  }>;
  disagreements: Array<{ engines: string[]; description: string }>;
  warnings: string[];
  coverage: {
    enginesRegistered: number;
    enginesRequested: number;
    enginesRun: number;
    enginesWithSignal: number;
    enginesFailed: number;
    enginesUnavailable: number;
  };
}

export interface TextProfile {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  /** Tokens numéricos separados: no son palabras léxicas. */
  numericTokens: number;
  uniqueWords: number;
  sentences: number;
  paragraphs: number;
  language: Language;
  languageConfidence: number;
  languageMethod: string;
  avgSentenceLength: number;
  lexicalDiversity: number;
  contentType: "académico" | "narrativo" | "informativo" | "formal" | "informal" | "indeterminado";
  lengthAssessment: {
    level: "insuficiente" | "limitado" | "adecuado" | "amplio";
    message: string;
  };
}

export interface EditorialSuggestion {
  id: string;
  category:
    | "repetición"
    | "generalidad"
    | "claridad"
    | "desarrollo"
    | "estructura"
    | "uniformidad"
    | "puntuación"
    | "léxico";
  severity: "alta" | "media" | "baja";
  excerpt: string;
  start: number;
  end: number;
  message: string;
  advice: string;
}

export interface AnalysisResponse {
  id: string;
  createdAt: string;
  engineVersion: string;
  text: {
    characters: number;
    words: number;
    sentences: number;
    paragraphs: number;
    /** Número de tokens puramente numéricos, excluidos de las métricas léxicas. */
    numericTokens: number;
    /** No se devuelve el texto completo ni una huella derivada de él. */
    stored: false;
  };
  profile: TextProfile;
  engines: EngineRun[];
  aggregate: AggregateSummary;
  editorial: {
    available: boolean;
    suggestions: EditorialSuggestion[];
    disclaimer: string;
  };
  privacy: {
    externalProvidersContacted: string[];
    textRetained: false;
    note: string;
  };
  timings: { totalMs: number; startedAt: string };
}

export const analyzeRequestSchema = z.object({
  text: z
    .string()
    .min(1, "El texto está vacío")
    .max(Number(process.env.UMBRAL_MAX_INPUT_CHARS ?? 30000), "El texto supera el límite permitido"),
  language: z.enum(["auto", "es", "en"]).default("auto"),
  engines: z.array(z.string().min(1)).max(40).optional(),
  allowExternal: z.boolean().default(false),
  /** Consentimiento explícito por proveedor: { "sapling": true } */
  externalConsent: z.record(z.string(), z.boolean()).optional(),
  includeEditorial: z.boolean().default(true),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export interface EngineContext {
  /** Política de proveedores externos para esta petición. */
  external?: {
    allowed: boolean;
    consent: Record<string, boolean>;
    fetchImpl?: typeof fetch;
  };
  text: string;
  language: Language;
  requestedLanguage: "auto" | SupportedLanguage;
  words: string[];
  lowerWords: string[];
  sentenceSpans: Array<{ start: number; end: number; text: string }>;
  sentences: string[];
  paragraphSpans: Array<{ start: number; end: number; text: string }>;
  paragraphs: string[];
  characterCount: number;
  wordCount: number;
  signal: AbortSignal;
}

/** Lo que devuelve un motor: el orquestador añade id, estado y duración. */
export interface EngineOutput {
  metrics: Metric[];
  signal: number | null;
  signalLabel?: string;
  evidence: EvidenceLevel;
  notes?: string[];
  warnings?: string[];
  segments?: SegmentScore[];
  simulated?: boolean;
  meta?: Record<string, unknown>;
}

export interface Engine {
  meta: EngineMeta;
  run(ctx: EngineContext): EngineOutput | Promise<EngineOutput>;
}
