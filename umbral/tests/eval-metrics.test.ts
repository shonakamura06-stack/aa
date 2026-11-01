import { describe, expect, it } from "vitest";
import {
  auroc,
  averagePrecision,
  binaryMetrics,
  bootstrapAuroc,
  parseRows,
  tprAtFpr,
} from "../scripts/evaluate-aggregator.mjs";

describe("métricas de evaluación", () => {
  it("AUROC = 1 con separación perfecta y empates internos", () => {
    const labels: number[] = [];
    const scores: number[] = [];
    for (let i = 0; i < 18; i++) { labels.push(0); scores.push(0.39); }
    for (let i = 0; i < 2; i++) { labels.push(0); scores.push(0.4); }
    for (let i = 0; i < 20; i++) { labels.push(1); scores.push(0.55); }
    expect(auroc(labels, scores)).toBeCloseTo(1, 12);
  });

  it("AUROC = 0 con separación invertida", () => {
    const labels = [1, 1, 0, 0];
    const scores = [0.1, 0.2, 0.8, 0.9];
    expect(auroc(labels, scores)).toBeCloseTo(0, 12);
  });

  it("AUROC = 0,5 cuando todas las puntuaciones empatan", () => {
    expect(auroc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 12);
  });

  it("AUROC usa rango promedio: un empate entre clases vale medio punto", () => {
    // Pares (positivo, negativo): 0,5>0,1 gana; 0,5=0,5 empata (0,5);
    // 0,9>0,1 gana; 0,9>0,5 gana → 3,5/4 = 0,875.
    expect(auroc([0, 1, 0, 1], [0.1, 0.5, 0.5, 0.9])).toBeCloseTo(0.875, 12);
  });

  it("AUROC sin empates coincide con el recuento directo de pares", () => {
    // Puntuaciones 1..6; negativos en 1, 3 y 6; positivos en 2, 4 y 5.
    // Pares bien ordenados: 1 (2>1) + 2 (4>1,3) + 2 (5>1,3) = 5 de 9.
    expect(auroc([0, 1, 0, 1, 1, 0], [1, 2, 3, 4, 5, 6])).toBeCloseTo(5 / 9, 12);
  });

  it("devuelve null con una sola clase", () => {
    expect(auroc([1, 1, 1], [0.2, 0.4, 0.6])).toBeNull();
    expect(tprAtFpr([0, 0], [0.2, 0.4])).toBeNull();
  });

  it("TPR@FPR1% respeta el límite de falsos positivos", () => {
    // 100 negativos: el umbral más alto admite como máximo 1 falso positivo.
    const labels = [...Array(100).fill(0), ...Array(20).fill(1)];
    const scores = [...Array(100).fill(0.2), ...Array(20).fill(0.9)];
    expect(tprAtFpr(labels, scores, 0.01)).toBeCloseTo(1, 12);
    // Un humano puntuado como la clase alta deja 1 FP (1 %) y se mantiene TPR=1.
    const oneFalsePositive = [...Array(99).fill(0.2), 0.9, ...Array(20).fill(0.9)];
    expect(tprAtFpr(labels, oneFalsePositive, 0.01)).toBeCloseTo(1, 12);
    // Dos humanos en la zona alta superan el 1 % de FPR: el mejor punto baja.
    const twoFalsePositives = [...Array(98).fill(0.2), 0.9, 0.9, ...Array(20).fill(0.9)];
    expect(tprAtFpr(labels, twoFalsePositives, 0.01)).toBeLessThan(1);
  });

  it("parseRows normaliza etiquetas y descarta líneas inválidas", () => {
    const raw = [
      JSON.stringify({ text: "uno", label: "AI", language: "es" }),
      JSON.stringify({ text: "dos", label: "humano" }),
      JSON.stringify({ text: "tres", label: "otro" }),
      JSON.stringify({ text: "", label: "ai" }),
      "{roto",
    ].join("\n");
    const rows = parseRows(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: 1, language: "es" });
    expect(rows[1]).toMatchObject({ label: 0, language: "unknown" });
  });
});

describe("métricas de evaluación: guardas de interpretación", () => {
  it("no informa TPR@FPR1 % si hay menos de 100 negativos", () => {
    const labels = [...Array(50).fill(0), ...Array(20).fill(1)];
    const scores = [...Array(50).fill(0.2), ...Array(20).fill(0.9)];
    expect(tprAtFpr(labels, scores, 0.01)).toBeNull();
  });

  it("con 100 negativos y separación perfecta informa TPR@FPR1 % = 1", () => {
    const labels = [...Array(100).fill(0), ...Array(20).fill(1)];
    const scores = [...Array(100).fill(0.2), ...Array(20).fill(0.9)];
    expect(tprAtFpr(labels, scores, 0.01)).toBeCloseTo(1, 12);
  });

  it("el bootstrap del AUROC acota el valor puntual", () => {
    const labels = [...Array(20).fill(0), ...Array(20).fill(1)];
    const scores = [...Array(20).fill(0.1), ...Array(20).fill(0.9)];
    const ci = bootstrapAuroc(labels, scores, { rounds: 200 });
    expect(ci).not.toBeNull();
    expect(ci![0]).toBeLessThanOrEqual(1);
    expect(ci![1]).toBeGreaterThanOrEqual(ci![0]);
  });

  it("las métricas binarias se calculan sobre recuentos explícitos", () => {
    const metrics = binaryMetrics([1, 1, 0, 0, 0, 0], [0.9, 0.4, 0.8, 0.1, 0.2, 0.3], 0.5);
    expect(metrics).toMatchObject({ tp: 1, fn: 1, fp: 1, tn: 3 });
    expect(metrics.precision).toBeCloseTo(0.5, 12);
    expect(metrics.recall).toBeCloseTo(0.5, 12);
    expect(metrics.specificity).toBeCloseTo(0.75, 12);
    expect(metrics.f1).toBeCloseTo(0.5, 12);
  });

  it("la precisión media vale 1 con separación perfecta y 0,5 con todo empatado", () => {
    expect(averagePrecision([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBeCloseTo(1, 12);
    expect(averagePrecision([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 12);
  });
});
