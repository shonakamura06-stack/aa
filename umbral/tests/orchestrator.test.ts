import { afterEach, describe, expect, it } from "vitest";
import { analyze, runEngines } from "@/lib/orchestrator";
import { buildContext } from "@/lib/analysis";
import { engineRegistry } from "@/lib/engines/registry";
import { engineById } from "@/lib/engines/registry";
import { HUMAN_ES, SHORT_ES, UNIFORM_ES } from "./fixtures/texts";

describe("orquestador", () => {
  it("ejecuta los 15 analizadores propios y deja el resto en estado explícito", async () => {
    const result = await analyze({ text: HUMAN_ES, language: "auto" });
    const ok = result.engines.filter((e) => e.status === "ok");
    const unavailable = result.engines.filter((e) => e.status === "unavailable");
    expect(ok.length).toBe(15);
    expect(result.engines).toHaveLength(engineRegistry.length);
    // ML sin dataset + 3 comerciales sin configurar
    expect(unavailable.length).toBe(4);
    expect(result.engines.find((e) => e.id === "ml.stylometric-classifier")!.status).toBe("unavailable");
    expect(result.engines.find((e) => e.id === "commercial.sapling")!.status).toBe("unavailable");
  });

  it("nunca declara autoría y no emite probabilidad", async () => {
    const result = await analyze({ text: HUMAN_ES });
    expect(result.aggregate.probability).toBeNull();
    expect(result.aggregate.signalIndex).toBeGreaterThanOrEqual(0);
    expect(result.aggregate.signalIndex).toBeLessThanOrEqual(100);
    expect(result.aggregate.probabilityMessage).toContain("No existe una probabilidad conjunta calibrada");
  });

  it("el estado de un motor no cancela los demás", async () => {
    const ctx = buildContext(HUMAN_ES, "auto");
    const runs = await runEngines(
      ctx,
      ["commercial.sapling", "entropy.lexical", "ml.stylometric-classifier", "repetition.ngram"],
      { externalAllowed: false, consent: {} },
    );
    expect(runs.find((r) => r.id === "commercial.sapling")!.status).toBe("unavailable");
    expect(runs.find((r) => r.id === "commercial.sapling")!.error).toBeUndefined();
    expect(runs.find((r) => r.id === "entropy.lexical")!.status).toBe("ok");
    expect(runs.find((r) => r.id === "repetition.ngram")!.status).toBe("ok");
  });

  it("deduplica solicitudes idénticas simultáneas", async () => {
    const [a, b] = await Promise.all([
      analyze({ text: HUMAN_ES, language: "es" }),
      analyze({ text: HUMAN_ES, language: "es" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.aggregate.signalIndex).toBe(b.aggregate.signalIndex);
  });

  it("permite seleccionar motores", async () => {
    const result = await analyze({ text: HUMAN_ES, engineIds: ["entropy.lexical", "orthography.punctuation"] });
    expect(result.engines.map((e) => e.id).sort()).toEqual(["entropy.lexical", "orthography.punctuation"]);
    expect(result.aggregate.coverage.enginesRun).toBe(2);
  });

  it("ignora identificadores de motor desconocidos", async () => {
    const result = await analyze({ text: HUMAN_ES, engineIds: ["no.existe"] });
    expect(result.engines).toHaveLength(0);
    expect(result.aggregate.evidence.level).toBe("insufficient");
  });

  it("advierte con texto corto y limita la evidencia", async () => {
    const result = await analyze({ text: SHORT_ES });
    expect(result.profile.lengthAssessment.level).toBe("insuficiente");
    expect(["low", "insufficient"]).toContain(result.aggregate.evidence.level);
    expect(result.aggregate.warnings.join(" ")).toContain("Texto corto");
  });

  it("marca más señal en texto repetitivo que en texto con variación", async () => {
    const uniform = await analyze({ text: UNIFORM_ES });
    const human = await analyze({ text: HUMAN_ES });
    expect(uniform.aggregate.signalIndex).not.toBeNull();
    expect(human.aggregate.signalIndex).not.toBeNull();
    expect(uniform.aggregate.signalIndex!).toBeGreaterThan(human.aggregate.signalIndex!);
  });

  it("no contacta proveedores externos sin consentimiento", async () => {
    const result = await analyze({ text: HUMAN_ES, allowExternal: true, externalConsent: {} });
    expect(result.privacy.externalProvidersContacted).toEqual([]);
    expect(result.engines.find((e) => e.id === "commercial.sapling")!.status).toBe("unavailable");
  });

  it("el resultado editorial es independiente y trae sugerencias accionables", async () => {
    const result = await analyze({ text: UNIFORM_ES });
    expect(result.editorial.available).toBe(true);
    expect(result.editorial.suggestions.length).toBeGreaterThan(0);
    const categories = new Set(result.editorial.suggestions.map((s) => s.category));
    expect(categories.has("generalidad")).toBe(true);
    expect(result.editorial.disclaimer).toContain("independiente del detector");
  });

  it("informa del tiempo total y de la versión del motor", async () => {
    const result = await analyze({ text: HUMAN_ES });
    expect(result.timings.totalMs).toBeGreaterThan(0);
    expect(result.engineVersion).toBe("0.1.0");
    expect(result.text.stored).toBe(false);
  });

  it("todos los motores declaran metodología, fórmulas y limitaciones", () => {
    for (const engine of engineRegistry) {
      expect(engine.meta.methodology.length, engine.meta.id).toBeGreaterThan(20);
      expect(engine.meta.formulas.length, engine.meta.id).toBeGreaterThan(0);
      expect(engine.meta.limitations.length, engine.meta.id).toBeGreaterThan(0);
      expect(engine.meta.languages.length, engine.meta.id).toBeGreaterThan(0);
    }
  });

  it("un motor desconocido se informa como error sin romper el análisis", async () => {
    const ctx = buildContext(HUMAN_ES, "es");
    const runs = await runEngines(ctx, ["inexistente"], { externalAllowed: false, consent: {} });
    expect(runs[0].status).toBe("error");
    expect(runs[0].error).toContain("desconocido");
  });

  it("respeta el timeout individual de motor", async () => {
    const engine = engineById("entropy.lexical")!;
    const original = engine.run;
    engine.run = () => new Promise(() => {}) as never;
    try {
      const ctx = buildContext(HUMAN_ES, "es");
      const runs = await runEngines(ctx, ["entropy.lexical"], { externalAllowed: false, consent: {} });
      expect(["timeout", "error"]).toContain(runs[0].status);
    } finally {
      engine.run = original;
    }
  }, 20000);
});

describe("privacidad", () => {
  afterEach(() => {
    delete process.env.UMBRAL_ENABLE_EXTERNAL;
  });

  it("el texto no se guarda en la respuesta ni en el agregado", async () => {
    const result = await analyze({ text: HUMAN_ES });
    const serialized = JSON.stringify(result.aggregate);
    expect(serialized).not.toContain("teleférico");
    expect(result.privacy.textRetained).toBe(false);
  });
});
