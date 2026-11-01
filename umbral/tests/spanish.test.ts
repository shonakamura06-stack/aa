import { describe, expect, it } from "vitest";
import { buildContext, buildProfile } from "@/lib/analysis";
import { detectLanguage } from "@/lib/text/language";
import { sentenceSpans, wordSpans } from "@/lib/text/tokenize";
import { orthographyEngine } from "@/lib/engines/orthography";
import { connectorsEngine } from "@/lib/engines/connectors";

/**
 * Auditoría del español: lo que la tokenización y la segmentación deben
 * respetar, y lo que ningún motor debe destruir por normalizar de más.
 */

function metricsOf(engine: typeof orthographyEngine, text: string) {
  const ctx = buildContext(text, "es");
  const out = engine.run(ctx) as {
    metrics: Array<{ key: string; value: number | string | null }>;
    warnings?: string[];
  };
  const byKey = new Map(out.metrics.map((m) => [m.key, m.value]));
  return { byKey, warnings: out.warnings ?? [] };
}

describe("tokenización del español", () => {
  it("conserva tildes, diéresis y eñe", () => {
    const words = wordSpans("El pingüino cantó una canción años después.").map((s) => s.text);
    expect(words).toEqual(["El", "pingüino", "cantó", "una", "canción", "años", "después"]);
  });

  it("conserva las contracciones como unidades léxicas", () => {
    const words = wordSpans("Voy al mercado del barrio con el niño.").map((s) => s.text);
    expect(words).toContain("al");
    expect(words).toContain("del");
    expect(words).not.toContain("a");
  });

  it("no separa palabras por apóstrofo tipográfico", () => {
    const words = wordSpans("Dijo que d’Artagnan llegaría tarde.").map((s) => s.text);
    expect(words.join(" ")).toContain("d’Artagnan");
  });

  it("mantiene los números fuera del léxico pero informa de ellos", () => {
    const ctx = buildContext("En 2024 se vendieron 1.250 unidades.", "es");
    expect(ctx.words).toEqual(["En", "se", "vendieron", "unidades"]);
    expect(buildProfile("En 2024 se vendieron 1.250 unidades.", ctx).numericTokens).toBe(2);
  });

  it("los emojis no rompen la segmentación ni se convierten en palabras", () => {
    const ctx = buildContext("Hola 🙂, ¿qué tal? ¡Bien! 😀", "es");
    expect(ctx.words).toEqual(["Hola", "qué", "tal", "Bien"]);
    expect(ctx.sentences.length).toBeGreaterThanOrEqual(2);
  });
});

describe("segmentación de oraciones en español", () => {
  it("trata los signos de apertura como parte de la oración y no como separadores", () => {
    const sentences = sentenceSpans("¿Vienes mañana? ¡Claro que sí!").map((s) => s.text);
    expect(sentences).toEqual(["¿Vienes mañana?", "¡Claro que sí!"]);
  });

  it("no corta en abreviaturas habituales", () => {
    const sentences = sentenceSpans("El Sr. Pérez llegó a las 9 a. m. y se fue.").map((s) => s.text);
    expect(sentences.length).toBeLessThanOrEqual(2);
  });

  it("conserva los diálogos con raya", () => {
    const sentences = sentenceSpans("—No sé —dijo ella—. Volveré mañana.").map((s) => s.text);
    expect(sentences.join(" ")).toContain("Volveré mañana");
  });

  it("los offsets en UTF-16 apuntan al texto original con emojis", () => {
    const text = "😀 Primera oración. Segunda oración.";
    for (const span of sentenceSpans(text)) {
      expect(text.slice(span.start, span.end)).toBe(span.text);
    }
  });
});

describe("ortografía y tipografía del español", () => {
  it("avisa cuando hay signos de cierre sin apertura", () => {
    const { warnings } = metricsOf(orthographyEngine, "Viniste ayer? No lo sabía. ¡Qué bien!");
    expect(warnings.join(" ")).toContain("solo 1 de apertura");
  });

  it("no avisa cuando la pareja ¿? está completa", () => {
    const { warnings } = metricsOf(orthographyEngine, "¿Viniste ayer? No lo sabía. ¿Y ahora?");
    expect(warnings.join(" ")).not.toContain("signos de cierre");
  });

  it("distingue comillas rectas de tipográficas y cuenta las rayas", () => {
    const { byKey } = metricsOf(orthographyEngine, "«Hola» —dijo—, y se fue con \"prisa\".");
    expect(byKey.get("quoteStyles")).toContain("tipográficas: 2");
    expect(byKey.get("quoteStyles")).toContain("rectas: 2");
    expect(byKey.get("emDashes")).toBe(2);
  });

  it("detecta espacios antes de signo y falta de espacio después", () => {
    const { byKey } = metricsOf(orthographyEngine, "Hola ,mundo.Adiós");
    expect(byKey.get("spaceBeforePunctuation")).toBeGreaterThan(0);
    expect(byKey.get("missingSpaceAfter")).toBeGreaterThan(0);
  });
});

describe("conectores y variación regional", () => {
  it("reconoce conectores acentuados y locuciones de varias palabras", () => {
    const ctx = buildContext(
      "Además, el plan es viable. Sin embargo, cuesta demasiado. Por lo tanto, hay que decidir. En definitiva, seguimos.",
      "es",
    );
    const out = connectorsEngine.run(ctx) as { metrics: Array<{ key: string; value: number | string | null }> };
    const count = out.metrics.find((m) => m.key === "connectorCount")!.value as number;
    expect(count).toBeGreaterThanOrEqual(4);
    const initial = out.metrics.find((m) => m.key === "sentenceInitialRate")!.value as number;
    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThanOrEqual(1);
  });

  it("los conectores en posición inicial no se cuentan dos veces", () => {
    const ctx = buildContext("Por lo tanto, seguimos. Por lo tanto, insistimos.", "es");
    const out = connectorsEngine.run(ctx) as {
      metrics: Array<{ key: string; value: number | string | null }>;
    };
    const total = out.metrics.find((m) => m.key === "connectorCount")!.value as number;
    const initial = out.metrics.find((m) => m.key === "sentenceInitialRate")!.value as number;
    expect(initial * total).toBeLessThanOrEqual(2 + 1e-9);
  });

  it("detecta español rioplatense y chileno", () => {
    expect(detectLanguage("Vos tenés razón, che, y no me voy a callar.").language).toBe("es");
    expect(detectLanguage("Oye, cachai que el paco no llegó ni una vez.").language).toBe("es");
  });

  it("distingue español de inglés en textos cortos con palabras compartidas", () => {
    expect(detectLanguage("La información es poder y la decisión es tuya.").language).toBe("es");
    expect(detectLanguage("The information is power and the decision is yours.").language).toBe("en");
  });
});
