import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSaplingResponse, saplingAdapter, codePointToUtf16 } from "@/lib/adapters/sapling";
import { parseGptZeroResponse, gptzeroAdapter } from "@/lib/adapters/gptzero";
import { buildMockDetection, mockAdapter } from "@/lib/adapters/mock";
import { AdapterError } from "@/lib/adapters/types";
import {
  canSpend,
  charBudgetFor,
  clearProviderExhaustion,
  markProviderExhausted,
  providerExhaustion,
  quotaState,
  recordSpend,
  resetLedger,
} from "@/lib/adapters/quota";

const SAPLING_OK = {
  score: 0.8016,
  ai_fraction: 0.5,
  verdict: "mixed",
  segments: [{ start: 0, end: 19, score: 0.8016 }],
  low_confidence: true,
  low_confidence_reasons: ["short_text"],
  sentence_scores: [
    { score: 0.9, sentence: "Here is a sentence.", start: 0, end: 19 },
    { score: 0.2, sentence: "Otra frase.", start: 20, end: 32 },
  ],
  tokens: ["Here", " is", " a"],
  token_probs: [0.8, 0.7, 0.6],
  version: "ml20261009",
  language: { code: "es", name: "Spanish", confidence: 0.98 },
};

const GPTZERO_OK = {
  version: "2025-11-28-base",
  documents: [
    {
      predicted_class: "mixed",
      class_probabilities: { human: 0.2, ai: 0.65, mixed: 0.15 },
      confidence_category: "medium",
      document_classification: "MIXED",
      sentences: [
        { sentence: "Primera oración.", generated_prob: 0.7, highlight_sentence_for_ai: true },
        { sentence: "Segunda oración.", generated_prob: 0.6, highlight_sentence_for_ai: true },
      ],
    },
  ],
};

describe("adaptador Sapling: contrato de respuesta", () => {
  it("extrae todos los campos documentados", () => {
    const result = parseSaplingResponse(SAPLING_OK);
    expect(result.score).toBe(0.8016);
    expect(result.aiFraction).toBe(0.5);
    expect(result.verdict).toBe("mixed");
    expect(result.lowConfidence).toBe(true);
    expect(result.lowConfidenceReasons).toEqual(["short_text"]);
    expect(result.detectorVersion).toBe("ml20261009");
    expect(result.detectedLanguage).toBe("es");
    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[0]).toMatchObject({ start: 0, end: 19, score: 0.9 });
    expect(result.tokenProbs?.tokens).toHaveLength(3);
    expect(result.retention).toBe("zero");
  });

  it("rechaza respuestas sin score", () => {
    expect(() => parseSaplingResponse({ msg: "invalid key" })).toThrow(AdapterError);
    try {
      parseSaplingResponse({ msg: "invalid key" });
    } catch (e) {
      expect((e as AdapterError).code).toBe("malformed_response");
    }
  });

  it("rechaza puntuaciones fuera de rango", () => {
    expect(() => parseSaplingResponse({ score: 1.4 })).toThrow(/fuera de rango/);
  });

  it("tolera respuestas parciales sin oraciones ni tokens", () => {
    const result = parseSaplingResponse({ score: 0.3 });
    expect(result.sentences).toEqual([]);
    expect(result.tokenProbs).toBeNull();
    expect(result.detectorVersion).toBeNull();
  });

  it("ignora token_probs de longitud inconsistente", () => {
    const result = parseSaplingResponse({ score: 0.5, tokens: ["a", "b"], token_probs: [0.5] });
    expect(result.tokenProbs).toBeNull();
  });
});

describe("adaptador Sapling: petición HTTP", () => {
  const originalKey = process.env.SAPLING_API_KEY;

  beforeEach(() => {
    process.env.SAPLING_API_KEY = "k".repeat(32);
  });
  afterEach(() => {
    process.env.SAPLING_API_KEY = originalKey;
  });

  it("envía zero_retention=true y nunca create_report", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.zero_retention).toBe(true);
      expect(body.sent_scores).toBe(true);
      expect(body).not.toHaveProperty("create_report");
      expect(body.key).toBe("k".repeat(32));
      return new Response(JSON.stringify({ score: 0.4 }), { status: 200 });
    });
    const result = await saplingAdapter.detect("texto de prueba suficientemente largo", {
      apiKey: "k".repeat(32),
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      zeroRetention: true,
      language: "es",
    });
    expect(result.provider).toBe("sapling");
  });

  it("clasifica 401 como unauthorized", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad key", { status: 401 }));
    await expect(
      saplingAdapter.detect("texto", {
        apiKey: "x",
        timeoutMs: 1000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        zeroRetention: true,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("clasifica 429 como rate_limited", async () => {
    const fetchImpl = vi.fn(async () => new Response("quota", { status: 429 }));
    await expect(
      saplingAdapter.detect("texto", {
        apiKey: "x",
        timeoutMs: 1000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        zeroRetention: true,
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("clasifica un timeout con AbortController", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    await expect(
      saplingAdapter.detect("texto", {
        apiKey: "x",
        timeoutMs: 20,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        zeroRetention: true,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("clasifica respuesta no JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));
    await expect(
      saplingAdapter.detect("texto", {
        apiKey: "x",
        timeoutMs: 1000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        zeroRetention: true,
      }),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("se declara no configurado sin clave válida", () => {
    process.env.SAPLING_API_KEY = "";
    expect(saplingAdapter.isConfigured()).toBe(false);
  });
});

describe("adaptador GPTZero: contrato de respuesta", () => {
  it("lee class_probabilities como probabilidad de IA", () => {
    const result = parseGptZeroResponse(GPTZERO_OK);
    expect(result.score).toBeCloseTo(0.65, 5);
    expect(result.verdict).toBe("mixed");
    expect(result.detectorVersion).toBe("2025-11-28-base");
    expect(result.sentences).toHaveLength(2);
    expect(result.lowConfidence).toBe(false);
    expect(result.retention).toBe("provider-default");
  });

  it("retrocede a campos heredados si no hay class_probabilities", () => {
    const result = parseGptZeroResponse({
      documents: [{ completely_generated_prob: 0.89, average_generated_prob: 0.85 }],
    });
    expect(result.score).toBeCloseTo(0.89, 5);
  });

  it("rechaza respuestas sin documentos", () => {
    expect(() => parseGptZeroResponse({ error: "bad key" })).toThrow(/no devolvió documentos/);
  });

  it("calcula offsets aproximados de oración", () => {
    const result = parseGptZeroResponse(GPTZERO_OK);
    expect(result.sentences[1].start).toBe(result.sentences[0].end + 1);
  });
});

describe("adaptador simulado", () => {
  it("marca siempre simulated y no pretende ser real", () => {
    const detection = buildMockDetection("Una. Dos. Tres.", { apiKey: "x", timeoutMs: 100, zeroRetention: true });
    expect((detection.raw as { simulated?: boolean }).simulated).toBe(true);
    expect(detection.verdict).toBe("mixed");
    expect(mockAdapter.name).toContain("simulado");
  });

  it("solo se configura con UMBRAL_ALLOW_MOCK=true", () => {
    const before = process.env.UMBRAL_ALLOW_MOCK;
    process.env.UMBRAL_ALLOW_MOCK = "true";
    expect(mockAdapter.isConfigured()).toBe(true);
    process.env.UMBRAL_ALLOW_MOCK = "false";
    expect(mockAdapter.isConfigured()).toBe(false);
    process.env.UMBRAL_ALLOW_MOCK = before;
  });
});

describe("control de cuotas", () => {
  const originalBudget = process.env.SAPLING_CHAR_BUDGET;

  beforeEach(() => {
    resetLedger();
    clearProviderExhaustion("sapling");
    process.env.SAPLING_CHAR_BUDGET = "1000";
  });
  afterEach(() => {
    process.env.SAPLING_CHAR_BUDGET = originalBudget;
    clearProviderExhaustion("sapling");
  });

  it("no autoriza envíos con presupuesto 0", () => {
    process.env.SAPLING_CHAR_BUDGET = "0";
    expect(charBudgetFor("sapling")).toBe(0);
    const check = canSpend("sapling", 10);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("Presupuesto");
  });

  it("bloquea cuando el texto excede el presupuesto restante", () => {
    recordSpend("sapling", 900);
    expect(canSpend("sapling", 200).ok).toBe(false);
    expect(canSpend("sapling", 50).ok).toBe(true);
  });

  it("registra consumo y calcula coste estimado", () => {
    recordSpend("sapling", 1000);
    const state = quotaState(saplingAdapter);
    expect(state.requests).toBe(1);
    expect(state.charsSent).toBe(1000);
    expect(state.remainingBudget).toBe(0);
    expect(state.exhausted).toBe(true);
    expect(state.estimatedCostUsd).toBeCloseTo(0.005, 5);
  });

  it("detiene el proveedor marcado como agotado", () => {
    markProviderExhausted("sapling", "429");
    expect(providerExhaustion("sapling")?.reason).toBe("429");
    expect(canSpend("sapling", 1).ok).toBe(false);
    clearProviderExhaustion("sapling");
    expect(canSpend("sapling", 1).ok).toBe(true);
  });
});

describe("Sapling: offsets en code points", () => {
  it("convierte los offsets a índices UTF-16 cuando el texto tiene emojis", () => {
    const text = "Hola. 🙂 Adiós.";
    // «Adiós.» empieza en el code point 8 y termina en el 14; el emoji ocupa
    // 2 unidades UTF-16, así que en índices de JavaScript es 9..15.
    const json = {
      score: 0.6,
      sentence_scores: [
        { score: 0.5, sentence: "Hola.", start: 0, end: 5 },
        { score: 0.7, sentence: "Adiós.", start: 8, end: 14 },
      ],
    };
    const parsed = parseSaplingResponse(json, text);
    const second = parsed.sentences[1];
    expect(second.start).toBe(9);
    expect(second.end).toBe(15);
    expect(text.slice(second.start, second.end)).toBe("Adiós.");
    // Sin el texto de referencia, los offsets se dejan como llegaron y la
    // conversión no se inventa.
    expect(parseSaplingResponse(json).sentences[1].start).toBe(8);
  });

  it("codePointToUtf16 no se desvía con texto ASCII", () => {
    expect(codePointToUtf16("Hola mundo", 5)).toBe(5);
    expect(codePointToUtf16("", 3)).toBe(0);
  });
});
