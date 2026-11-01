import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  cosineSparse,
  hapaxLegomena,
  honoreR,
  jaccard,
  normalizedEntropy,
  quantile,
  shannonEntropy,
  simpsonsD,
  variance,
  yulesK,
  zipfSlope,
} from "@/lib/text/stats";
import { buildContext } from "@/lib/analysis";

/**
 * Pruebas matemáticas con valores calculados a mano. No comprueban «que sale un
 * número», comprueban que sale EL número que define la fórmula.
 */
describe("estadísticos: valores calculados a mano", () => {
  it("entropía de Shannon de una distribución uniforme de 4 símbolos = 2 bits", () => {
    expect(shannonEntropy([1, 1, 1, 1])).toBeCloseTo(2, 12);
  });

  it("entropía de una sola categoría = 0", () => {
    expect(shannonEntropy([7])).toBeCloseTo(0, 12);
  });

  it("entropía de [3,1]: H = -(0,75·log2 0,75 + 0,25·log2 0,25) ≈ 0,8113", () => {
    expect(shannonEntropy([3, 1])).toBeCloseTo(0.8112781244591328, 12);
  });

  it("entropía de una distribución vacía = 0 (sin NaN)", () => {
    expect(shannonEntropy([])).toBe(0);
    expect(normalizedEntropy([])).toBe(0);
  });

  it("entropía normalizada de 4 símbolos equiprobables = 1", () => {
    expect(normalizedEntropy([1, 1, 1, 1])).toBeCloseTo(1, 12);
  });

  it("varianza muestral de [2,4,4,4,5,5,7,9] = 4,571428…", () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7, 12);
  });

  it("coeficiente de variación de una constante = 0", () => {
    expect(coefficientOfVariation([5, 5, 5])).toBe(0);
  });

  it("K de Yule: 10⁴·(Σnᵢ² − N)/N² con N=12 y Σnᵢ²=26 → 972,22…", () => {
    // [10,1,1]: Σnᵢ² = 100+1+1 = 102, N = 12 → 10⁴·(102−12)/144
    expect(yulesK([10, 1, 1])).toBeCloseTo((10000 * (102 - 12)) / 144, 9);
  });

  it("D de Simpson de [3,1] = 6/12 = 0,5", () => {
    expect(simpsonsD([3, 1])).toBeCloseTo(0.5, 12);
  });

  it("R de Honoré no es calculable si todos los tipos son hapax", () => {
    expect(honoreR([1, 1, 1])).toBeNull();
  });

  it("cuantiles con interpolación lineal", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
  });

  it("coseno de vectores ortogonales = 0 y de vectores idénticos = 1", () => {
    expect(cosineSparse(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(0);
    expect(cosineSparse(new Map([["a", 2]]), new Map([["a", 2]]))).toBeCloseTo(1, 12);
  });

  it("Jaccard de conjuntos disjuntos = 0 y de conjuntos iguales = 1", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("pendiente de Zipf no es calculable con menos de 3 tipos", () => {
    expect(zipfSlope([3, 1])).toBe(0);
  });

  it("hapax cuenta solo frecuencia exactamente 1", () => {
    expect(hapaxLegomena([1, 1, 2, 3])).toBe(2);
  });
});

describe("textos degenerados: sin NaN ni Infinity", () => {
  const cases: Array<[string, string]> = [
    ["vacío", ""],
    ["espacios", "   \n\n  "],
    ["una palabra", "hola"],
    ["una oración", "El río bajaba turbio."],
    ["solo números", "2024 2025 3,14 42"],
    ["solo signos", "!!! ?? ... ---"],
    ["emojis", "🙂🙂 texto con emojis 😀 y más"],
    ["acentos y ñ", "El niño comió piña y añadió azúcar. ¡Qué día! ¿Verdad?"],
    ["comillas", "«Hola», dijo. “Adiós”, respondió."],
    ["repetitivo", "palabra palabra palabra palabra palabra palabra palabra"],
  ];

  for (const [name, text] of cases) {
    it(`«${name}» produce un contexto coherente`, () => {
      const ctx = buildContext(text, "auto");
      expect(ctx.wordCount).toBe(ctx.words.length);
      expect(ctx.lowerWords.length).toBe(ctx.words.length);
      expect(ctx.sentences.length).toBe(ctx.sentenceSpans.length);
      for (const sentence of ctx.sentenceSpans) {
        expect(sentence.start).toBeGreaterThanOrEqual(0);
        expect(sentence.end).toBeLessThanOrEqual(text.length);
        expect(sentence.end).toBeGreaterThan(sentence.start);
      }
    });
  }

  it("el texto vacío tiene 0 palabras y 0 oraciones", () => {
    const ctx = buildContext("", "auto");
    expect(ctx.wordCount).toBe(0);
    expect(ctx.sentences.length).toBe(0);
    expect(ctx.paragraphs.length).toBe(0);
  });

  it("los números no cuentan como palabras léxicas", () => {
    const ctx = buildContext("Compré 3 panes y 2 kilos de harina en 2024.", "es");
    expect(ctx.words).toEqual(["Compré", "panes", "y", "kilos", "de", "harina", "en"]);
    expect(ctx.lowerWords).toEqual(["compré", "panes", "y", "kilos", "de", "harina", "en"]);
  });

  it("los acentos se conservan en los tokens (no se normalizan a ASCII)", () => {
    const ctx = buildContext("Canción, canción: corazón.", "es");
    expect(ctx.lowerWords).toContain("canción");
    expect(ctx.lowerWords).toContain("corazón");
  });

  it("«niño» y «nino» son tipos distintos", () => {
    const ctx = buildContext("El niño y el nino.", "es");
    expect(new Set(ctx.lowerWords).size).toBe(4);
  });
});
