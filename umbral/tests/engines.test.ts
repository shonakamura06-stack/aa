import { beforeAll, describe, expect, it } from "vitest";
import { engineRegistry } from "@/lib/engines/registry";
import { buildContext } from "@/lib/analysis";
import type { EngineRun } from "@/lib/types";
import { HUMAN_ES, UNIFORM_ES, SHORT_ES, ENGLISH_TEXT } from "./fixtures/texts";

const ownEngines = engineRegistry.filter(
  (e) => e.meta.kind !== "commercial" && e.meta.id !== "ml.stylometric-classifier",
);

async function runAll(text: string, language: "auto" | "es" | "en" = "auto") {
  const ctx = buildContext(text, language);
  const runs: EngineRun[] = [];
  for (const engine of ownEngines) {
    const output = await engine.run(ctx);
    runs.push({ id: engine.meta.id, status: "ok", durationMs: 0, ...output } as EngineRun);
  }
  return { ctx, runs };
}

describe("analizadores propios", () => {
  let runs: EngineRun[];
  let ctx: ReturnType<typeof buildContext>;

  beforeAll(async () => {
    const result = await runAll(HUMAN_ES);
    runs = result.runs;
    ctx = result.ctx;
  });

  it("hay 15 analizadores propios activos", () => {
    expect(ownEngines.length).toBe(15);
  });

  it("todos se ejecutan sin lanzar excepciones y aportan métricas", () => {
    expect(runs.length).toBe(ownEngines.length);
    for (const run of runs) {
      expect(run.metrics.length, `motor sin métricas: ${run.id}`).toBeGreaterThan(0);
    }
  });

  it("ninguna métrica numérica es NaN o infinita", () => {
    for (const run of runs) {
      for (const m of run.metrics) {
        if (typeof m.value === "number") {
          expect(Number.isFinite(m.value), `${run.id}/${m.key} no es finito`).toBe(true);
        }
      }
    }
  });

  it("las señales direccionales están en [0,1] o son null", () => {
    for (const run of runs) {
      if (run.signal !== null) {
        expect(run.signal).toBeGreaterThanOrEqual(0);
        expect(run.signal).toBeLessThanOrEqual(1);
      }
    }
  });

  it("los motores no direccionales no emiten señal", () => {
    for (const run of runs) {
      const meta = engineRegistry.find((e) => e.meta.id === run.id)!.meta;
      if (meta.directionality === "non-directional") expect(run.signal).toBeNull();
    }
  });

  it("la segmentación de oraciones coincide con el contexto", () => {
    expect(ctx.sentences.length).toBeGreaterThan(0);
    const burst = runs.find((r) => r.id === "rhythm.burstiness")!;
    expect(burst.metrics.some((m) => m.key === "burstinessB")).toBe(true);
  });

  it("la perplejidad declarada es coherente con la entropía cruzada", () => {
    const pred = runs.find((r) => r.id === "predictability.perplexity")!;
    const ce = pred.metrics.find((m) => m.key === "crossEntropyBits")!.value as number;
    const pp = pred.metrics.find((m) => m.key === "bigramPerplexity")!.value as number;
    // La métrica se redondea a 4 decimales; se compara en escala logarítmica.
    expect(Math.log2(pp)).toBeCloseTo(ce, 3);
  });

  it("produce puntuaciones por oración para el motor de previsibilidad", () => {
    const pred = runs.find((r) => r.id === "predictability.perplexity")!;
    expect(pred.segments?.length).toBe(ctx.sentences.length);
    for (const s of pred.segments!) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it("el módulo de compresión es reproducible", async () => {
    const other = await runAll(HUMAN_ES);
    const a = runs.find((r) => r.id === "compression.complexity")!;
    const b = other.runs.find((r) => r.id === "compression.complexity")!;
    expect(a.metrics.find((m) => m.key === "compressionRatio")!.value).toBe(
      b.metrics.find((m) => m.key === "compressionRatio")!.value,
    );
  });
});

describe("comportamiento con textos problemáticos", () => {
  it("no rompe con texto muy corto y advierte", async () => {
    const { runs } = await runAll(SHORT_ES);
    const withWarnings = runs.filter((r) => r.warnings.length > 0);
    expect(withWarnings.length).toBeGreaterThan(0);
  });

  it("el texto repetitivo produce más señal de repetición que el texto humano", async () => {
    const human = await runAll(HUMAN_ES);
    const uniform = await runAll(UNIFORM_ES);
    const rep = (runs: EngineRun[]) => runs.find((r) => r.id === "repetition.ngram")!.signal ?? 0;
    expect(rep(uniform.runs)).toBeGreaterThan(rep(human.runs));
  });

  it("procesa inglés sin errores", async () => {
    const { runs } = await runAll(ENGLISH_TEXT, "en");
    expect(runs.every((r) => r.metrics.length > 0)).toBe(true);
  });
});
