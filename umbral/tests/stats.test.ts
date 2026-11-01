import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  cosineSparse,
  hapaxLegomena,
  honoreR,
  interpolateAnchors,
  jaccard,
  mean,
  normalizedEntropy,
  quantile,
  shannonEntropy,
  simpsonsD,
  sd,
  yulesK,
  zipfSlope,
} from "@/lib/text/stats";

describe("estadística básica", () => {
  it("calcula media, desviación y coeficiente de variación", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sd([2, 2, 2])).toBe(0);
    expect(sd([1, 3])).toBeCloseTo(1.4142, 3);
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
  });

  it("calcula cuantiles con interpolación lineal", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.9)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
  });
});

describe("entropía", () => {
  it("da 0 bits con una sola categoría", () => {
    expect(shannonEntropy([10])).toBe(0);
  });
  it("da 1 bit con dos categorías equiprobables", () => {
    expect(shannonEntropy([1, 1])).toBeCloseTo(1, 10);
  });
  it("normaliza entre 0 y 1", () => {
    expect(normalizedEntropy([1, 1, 1, 1])).toBeCloseTo(1, 10);
    expect(normalizedEntropy([100, 1, 1, 1])).toBeLessThan(0.5);
  });
});

describe("riqueza léxica", () => {
  it("Yule K es 0 cuando todos los tipos aparecen una vez", () => {
    expect(yulesK([1, 1, 1])).toBe(0);
  });
  it("Yule K crece al concentrarse las repeticiones", () => {
    expect(yulesK([10, 1, 1])).toBeGreaterThan(yulesK([4, 4, 4]));
  });
  it("Simpson D es 1 cuando solo hay un tipo", () => {
    expect(simpsonsD([5])).toBe(1);
  });
  it("Honoré R no es calculable si todo es hapax", () => {
    expect(honoreR([1, 1, 1])).toBeNull();
  });
  it("cuenta hapax", () => {
    expect(hapaxLegomena([1, 1, 2, 3])).toBe(2);
  });
});

describe("similitud", () => {
  it("Jaccard de conjuntos idénticos es 1", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });
  it("coseno de vectores ortogonales es 0", () => {
    expect(cosineSparse(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(0);
  });
  it("pendiente de Zipf es negativa en distribuciones naturales", () => {
    expect(zipfSlope([10, 8, 6, 4, 3, 2, 1])).toBeLessThan(0);
  });
});

describe("anclas de señal", () => {
  const points: Array<[number, number]> = [
    [0, 0],
    [10, 1],
  ];
  it("interpola linealmente", () => {
    expect(interpolateAnchors(points, 5)).toBeCloseTo(0.5, 10);
  });
  it("satura fuera de rango", () => {
    expect(interpolateAnchors(points, -5)).toBe(0);
    expect(interpolateAnchors(points, 50)).toBe(1);
  });
});
