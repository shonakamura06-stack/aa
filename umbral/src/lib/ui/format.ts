import type { EngineFamily, EngineKind, EvidenceLevel, ValidationStatus } from "@/lib/types";

export const KIND_LABEL: Record<EngineKind, string> = {
  statistical: "Estadístico",
  linguistic: "Lingüístico",
  "trained-classifier": "Clasificador entrenado",
  academic: "Método académico",
  commercial: "Detector comercial",
};

export const KIND_CLASS: Record<EngineKind, string> = {
  statistical: "badge--stat",
  linguistic: "badge--ling",
  "trained-classifier": "badge--ml",
  academic: "badge--acad",
  commercial: "badge--com",
};

export const VALIDATION_LABEL: Record<ValidationStatus, string> = {
  "external-benchmark": "Validación externa publicada",
  "internally-evaluated": "Evaluación interna",
  "vendor-claim": "Precisión declarada por el proveedor",
  unvalidated: "Sin evaluación propia",
  heuristic: "Heurístico",
  descriptive: "Descriptivo",
};

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  insufficient: "Insuficiente",
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const FAMILY_LABEL_UI: Record<EngineFamily, string> = {
  "information-theoretic": "Información y previsibilidad",
  "repetition-structure": "Repetición y estructura",
  stylometric: "Estilometría",
  "linguistic-surface": "Superficie lingüística",
  "trained-classifier": "Clasificador entrenado",
  commercial: "Detectores comerciales",
};

export function fmtNumber(value: number | string | null, unit?: string): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  const abs = Math.abs(value);
  let str: string;
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) str = value.toExponential(2);
  else if (abs >= 100) str = value.toFixed(1);
  else if (abs >= 1) str = value.toFixed(2);
  else str = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${str} ${unit}` : str;
}

export function fmtDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function bandColor(band: "bajo" | "medio" | "alto"): string {
  return band === "alto" ? "var(--clay)" : band === "medio" ? "var(--amber)" : "var(--teal)";
}
