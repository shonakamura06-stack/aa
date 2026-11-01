import { afterEach, describe, expect, it } from "vitest";
import { buildContext } from "@/lib/analysis";
import { compressionEngine } from "@/lib/engines/compression";
import { redundancyEngine } from "@/lib/engines/redundancy";
import { structureEngine } from "@/lib/engines/structure";
import { lexicalDiversityEngine } from "@/lib/engines/diversity-lexical";
import { stylometryEngine } from "@/lib/engines/stylometry";
import { morphosyntaxEngine } from "@/lib/engines/morphosyntax";
import { metric } from "@/lib/engines/helpers";
import { interpolateAnchors } from "@/lib/text/stats";
import { wordSpans } from "@/lib/text/tokenize";
import { analyze } from "@/lib/orchestrator";

/**
 * Pruebas de regresión de la auditoría V1: cada una fija el defecto concreto
 * que se corrigió, para que no vuelva a colarse.
 */

const LONG = `La ciudad amaneció con niebla y el mercado abrió antes de lo previsto. Los vendedores discutían el precio del pan mientras un perro dormía entre las cajas.
Nadie parecía tener prisa, salvo la mujer que contaba monedas en silencio. Al mediodía la niebla se fue y con ella la calma.
El puesto de api volvió a humear y un niño preguntó por qué el cielo tardaba tanto en aclararse. Su madre le dijo que las nubes también se cansan.`;

function numeric(metrics: Array<{ key: string; value: number | string | null }>, key: string) {
  const found = metrics.find((m) => m.key === key);
  expect(found, `métrica ausente: ${key}`).toBeDefined();
  return found!.value;
}

describe("compresión: la línea base compara el mismo flujo de tokens", () => {
  it("puntuación y mayúsculas ya no alteran la redundancia secuencial", () => {
    const plain = buildContext("la ciudad amaneció con niebla y el mercado abrió temprano", "es");
    const styled = buildContext("La ciudad, amaneció con niebla; y el mercado abrió temprano.", "es");
    const a = compressionEngine.run(plain) as { metrics: Array<{ key: string; value: number | string | null }> };
    const b = compressionEngine.run(styled) as { metrics: Array<{ key: string; value: number | string | null }> };
    expect(numeric(a.metrics, "sequentialRedundancy")).toBeCloseTo(
      numeric(b.metrics, "sequentialRedundancy") as number,
      12,
    );
  });
});

describe("redundancia: media sobre todos los pares, sin sesgo de selección", () => {
  it("las oraciones sin solapamiento entran en la media", () => {
    const ctx = buildContext(
      "El volcán humeaba sobre el valle. La receta pide harina y azúcar. Los tipos de interés subieron otra vez.",
      "es",
    );
    const out = redundancyEngine.run(ctx) as { metrics: Array<{ key: string; value: number | string | null }> };
    expect(numeric(out.metrics, "sentencePairs")).toBe(3);
    expect(numeric(out.metrics, "pairsWithOverlap")).toBe(0);
    expect(numeric(out.metrics, "meanPairSimilarity")).toBe(0);
  });

  it("informa por separado la media de los pares con solapamiento", () => {
    const ctx = buildContext(LONG, "es");
    const out = redundancyEngine.run(ctx) as { metrics: Array<{ key: string; value: number | string | null }> };
    const all = numeric(out.metrics, "meanPairSimilarity") as number;
    const overlapping = numeric(out.metrics, "meanPairSimilarityOverlapping");
    expect(all).toBeGreaterThanOrEqual(0);
    // Si ningún par alcanza el mínimo de solapamiento, la media condicionada
    // no es calculable: se declara null en lugar de informar 0.
    if (overlapping === null) {
      expect(numeric(out.metrics, "pairsWithOverlap")).toBe(0);
    } else {
      expect(overlapping as number).toBeGreaterThanOrEqual(all);
    }
  });
});

describe("estructura: una sola metodología de segmentación", () => {
  it("cuenta oraciones por párrafo con los mismos spans que el resto del sistema", () => {
    const ctx = buildContext(LONG, "es");
    const out = structureEngine.run(ctx) as { metrics: Array<{ key: string; value: number | string | null }> };
    const mean = numeric(out.metrics, "meanSentencesPerParagraph") as number;
    const expected = ctx.sentenceSpans.length / ctx.paragraphSpans.length;
    expect(mean).toBeCloseTo(expected, 9);
  });

  it("«Hola. Adiós.» son dos oraciones, no una", () => {
    const ctx = buildContext("Hola. Adiós.", "es");
    expect(ctx.sentences.length).toBe(2);
  });
});

describe("diversidad: lo no calculable se declara", () => {
  it("MTLD es null con menos de 10 palabras, no 0", () => {
    const ctx = buildContext("una dos tres cuatro cinco", "es");
    const out = lexicalDiversityEngine.run(ctx) as { metrics: Array<{ key: string; value: number | string | null }> };
    expect(numeric(out.metrics, "mtld")).toBeNull();
  });

  it("la métrica «hapax medio por tipo» ya no existe", () => {
    const ctx = buildContext(LONG, "es");
    const out = lexicalDiversityEngine.run(ctx) as { metrics: Array<{ key: string }> };
    expect(out.metrics.find((m) => m.key === "meanHapax")).toBeUndefined();
    expect(out.metrics.find((m) => m.key === "hapaxShareOfTokens")).toBeDefined();
  });
});

describe("estilometría y morfosintaxis en español", () => {
  it("la tasa de pronombres es null en inglés, no un 0 engañoso", () => {
    const ctx = buildContext(
      "The machine sat in the corner of the workshop for three weeks before anyone touched it. Marta had bought it at an auction, convinced that the missing gear could be rebuilt.",
      "en",
    );
    const out = stylometryEngine.run(ctx) as { metrics: Array<{ key: string; value: number | string | null }> };
    expect(numeric(out.metrics, "pronounRate")).toBeNull();
  });

  it("«que» no se cuenta a la vez como pronombre y conjunción", () => {
    const ctx = buildContext("Creo que el que vino ayer que se fuera.", "es");
    const out = stylometryEngine.run(ctx) as {
      metrics: Array<{ key: string; value: number | string | null }>;
    };
    const pronouns = numeric(out.metrics, "pronounRate") as number;
    const conjunctions = numeric(out.metrics, "conjunctionRate") as number;
    expect(pronouns + conjunctions).toBeLessThanOrEqual(1);
  });

  it("los participios no se atribuyen al verbo sin contexto", () => {
    const ctx = buildContext(
      "El informe terminado quedó sobre la mesa. La puerta cerrada daba al patio. Hemos terminado el trabajo cansados.",
      "es",
    );
    const out = morphosyntaxEngine.run(ctx) as {
      metrics: Array<{ key: string; value: number | string | null }>;
    };
    expect(numeric(out.metrics, "share_participio_ambiguo")).toBeGreaterThan(0);
    expect(numeric(out.metrics, "share_verbo")).toBe(0);
  });
});

describe("presentación de métricas", () => {
  it("un valor no finito se publica como no calculable, no como 0", () => {
    expect(metric("x", "X", Number.NaN).value).toBeNull();
    expect(metric("y", "Y", Number.POSITIVE_INFINITY).value).toBeNull();
    expect(metric("z", "Z", 0.5).value).toBe(0.5);
  });

  it("la interpolación por anclas es monótona y queda en [0,1]", () => {
    const points: Array<[number, number]> = [
      [0, 0.9],
      [0.5, 0.5],
      [1, 0.1],
    ];
    const values = [0, 0.25, 0.5, 0.75, 1, 2].map((x) => interpolateAnchors(points, x));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(values[0]).toBeGreaterThan(values[4]);
  });
});

describe("tokenizador consciente del idioma", () => {
  it("los segmentadores no se reutilizan entre idiomas", () => {
    const es = wordSpans("El niño come piña", "es").map((span) => span.text);
    const en = wordSpans("The child eats pineapple", "en").map((span) => span.text);
    expect(es).toEqual(["El", "niño", "come", "piña"]);
    expect(en).toEqual(["The", "child", "eats", "pineapple"]);
    // Volver a español no devuelve el segmentador de inglés.
    expect(wordSpans("El niño come piña", "es").map((span) => span.text)).toEqual(es);
  });
});

describe("proveedores: la respuesta cruda no se publica", () => {
  afterEach(() => {
    delete process.env.UMBRAL_ALLOW_MOCK;
    delete process.env.UMBRAL_ENABLE_EXTERNAL;
  });

  it("el motor comercial expone campos normalizados, no el payload del proveedor", async () => {
    process.env.UMBRAL_ALLOW_MOCK = "true";
    process.env.UMBRAL_ENABLE_EXTERNAL = "true";
    const result = await analyze({
      text: LONG,
      engineIds: ["commercial.mock"],
      allowExternal: true,
      externalConsent: { mock: true },
    });
    const run = result.engines.find((e) => e.id === "commercial.mock")!;
    expect(run.status).toBe("ok");
    expect(run.simulated).toBe(true);
    expect(JSON.stringify(run.meta ?? {})).not.toContain("raw");
    expect(run.meta).toMatchObject({ retention: "zero" });
    // Un motor simulado nunca entra en el compuesto.
    expect(result.aggregate.coverage.enginesWithSignal).toBe(0);
    expect(result.aggregate.signalIndex).toBeNull();
  });
});
