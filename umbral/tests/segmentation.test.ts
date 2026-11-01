import { describe, expect, it } from "vitest";
import { paragraphSpans, sentenceSpans, wordSpans } from "@/lib/text/tokenize";
import { detectLanguage } from "@/lib/text/language";
import { buildContext } from "@/lib/analysis";
import { HUMAN_ES, ENGLISH_TEXT, SHORT_ES } from "./fixtures/texts";

describe("segmentación", () => {
  it("segmenta palabras en español manteniendo acentos", () => {
    const words = wordSpans("El niño comió una manzana añeja.").map((w) => w.text);
    expect(words).toEqual(["El", "niño", "comió", "una", "manzana", "añeja"]);
  });

  it("segmenta oraciones con abreviaturas razonables", () => {
    const s = sentenceSpans("Primera oración. Segunda oración. ¿Tercera?");
    expect(s.length).toBe(3);
    expect(s[2].text).toBe("¿Tercera?");
  });

  it("detecta párrafos separados por línea en blanco", () => {
    const p = paragraphSpans("Uno.\n\nDos.\n\n\nTres.");
    expect(p.map((x) => x.text)).toEqual(["Uno.", "Dos.", "Tres."]);
  });

  it("los offsets coinciden con el texto original", () => {
    const text = "Hola mundo. Otra frase aquí.";
    for (const s of sentenceSpans(text)) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
    }
  });
});

describe("detección de idioma", () => {
  it("detecta español", () => {
    expect(detectLanguage(HUMAN_ES).language).toBe("es");
  });
  it("detecta inglés", () => {
    expect(detectLanguage(ENGLISH_TEXT).language).toBe("en");
  });
  it("marca texto insuficiente como desconocido", () => {
    expect(detectLanguage("xyz qqq").language).toBe("unknown");
  });
});

describe("contexto de análisis", () => {
  it("respeta el idioma forzado", () => {
    const ctx = buildContext(SHORT_ES, "en");
    expect(ctx.language).toBe("en");
  });
  it("cuenta palabras reales", () => {
    const ctx = buildContext(HUMAN_ES, "auto");
    expect(ctx.wordCount).toBeGreaterThan(150);
    expect(ctx.sentences.length).toBeGreaterThan(5);
    expect(ctx.paragraphs.length).toBe(3);
  });
});
