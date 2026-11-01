/**
 * Tipos del script de evaluación, para que la suite de pruebas pueda importar
 * sus funciones sin convertirlo en dependencia de la aplicación.
 */
export interface LabeledRow {
  text: string;
  label: 0 | 1;
  author: string;
  language: string;
}

export interface BinaryMetrics {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  specificity: number | null;
  f1: number | null;
}

export function auroc(labels: number[], scores: number[]): number | null;
export function tprAtFpr(labels: number[], scores: number[], target?: number): number | null;
export function bootstrapAuroc(
  labels: number[],
  scores: number[],
  options?: { rounds?: number; seed?: number },
): [number, number] | null;
export function binaryMetrics(labels: number[], scores: number[], threshold?: number): BinaryMetrics;
export function averagePrecision(labels: number[], scores: number[]): number | null;
export function parseRows(raw: string): LabeledRow[];
export function main(): Promise<unknown>;
