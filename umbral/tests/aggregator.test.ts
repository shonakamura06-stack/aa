import { describe, expect, it } from "vitest";
import { aggregate, CALIBRATED_PROBABILITY_MESSAGE } from "@/lib/aggregator";
import { engineRegistry } from "@/lib/engines/registry";
import type { EngineMeta, EngineRun, TextProfile } from "@/lib/types";

const metas: EngineMeta[] = engineRegistry.map((e) => e.meta);

const profile: TextProfile = {
  characters: 1200,
  charactersNoSpaces: 1000,
  words: 250,
  numericTokens: 0,
  uniqueWords: 140,
  sentences: 12,
  paragraphs: 4,
  language: "es",
  languageConfidence: 0.9,
  languageMethod: "lista-cerrada",
  avgSentenceLength: 20,
  lexicalDiversity: 0.56,
  contentType: "informativo",
  lengthAssessment: { level: "adecuado", message: "ok" },
};

function run(id: string, signal: number | null, extra: Partial<EngineRun> = {}): EngineRun {
  return {
    id,
    status: "ok",
    durationMs: 5,
    metrics: [],
    signal,
    evidence: "medium",
    notes: [],
    warnings: [],
    ...extra,
  };
}

describe("agregador multimodelo", () => {
  it("no emite probabilidad ni veredicto de autoría", () => {
    const result = aggregate({
      runs: [run("entropy.lexical", 0.9), run("repetition.ngram", 0.8)],
      metas,
      profile,
    });
    expect(result.probability).toBeNull();
    expect(result.probabilityMessage).toContain(CALIBRATED_PROBABILITY_MESSAGE);
    expect(result.authorshipConclusion).toBeNull();
    expect(result.authorshipMessage).toContain("no estima quién lo escribió");
    expect(result.indexKind).toBe("heuristic-composite");
    expect(result.calibrated).toBe(false);
  });

  it("declara que el acuerdo no es calculable y no inventa una cifra", () => {
    const result = aggregate({
      runs: [run("entropy.lexical", 0.8), run("repetition.ngram", 0.78)],
      metas,
      profile,
    });
    expect(result.agreement.score).toBeNull();
    expect(result.agreement.label).toBe("no calculable");
    expect(result.agreement.reason).toContain("decisión binaria");
    // La dispersión es descriptiva, no un acuerdo.
    expect(result.dispersion.sd).not.toBeNull();
    expect(result.dispersion.note).toContain("no es un intervalo de confianza");
  });

  it("un grupo de dependencia = un voto: añadir un motor del mismo grupo no mueve el índice", () => {
    const soloEntropia = aggregate({
      runs: [run("entropy.lexical", 0.9), run("repetition.ngram", 0.9)],
      metas,
      profile,
    });
    const conPrevisibilidad = aggregate({
      runs: [
        run("entropy.lexical", 0.9),
        run("predictability.perplexity", 0.9),
        run("repetition.ngram", 0.9),
      ],
      metas,
      profile,
    });
    expect(soloEntropia.groups.length).toBe(2);
    expect(conPrevisibilidad.groups.length).toBe(2);
    expect(conPrevisibilidad.signalIndex).toBe(soloEntropia.signalIndex);
    expect(conPrevisibilidad.groups.find((g) => g.id === "information-theoretic")!.engines).toEqual([
      "entropy.lexical",
      "predictability.perplexity",
    ]);
  });

  it("separa ritmo oracional de repetición de secuencias: no son la misma variable", () => {
    const result = aggregate({
      runs: [
        run("repetition.ngram", 0.9),
        run("burstiness", 0.2),
        run("structure.regularity", 0.2),
      ],
      metas,
      profile,
    });
    const ids = result.groups.map((group) => group.id).sort();
    expect(ids).toEqual(["sentence-rhythm", "sequence-repetition"]);
    expect(result.signalIndex).not.toBeNull();
    expect(result.disagreements.length).toBeGreaterThan(0);
  });

  it("descarta resultados simulados", () => {
    const result = aggregate({
      runs: [
        run("entropy.lexical", 0.1),
        run("repetition.ngram", 0.1),
        run("commercial.mock", 1, { simulated: true }),
      ],
      metas,
      profile,
    });
    expect(result.coverage.enginesWithSignal).toBe(2);
    expect(result.warnings.join(" ")).toContain("simulados");
    expect(result.groups.every((group) => !group.engines.includes("commercial.mock"))).toBe(true);
  });

  it("los motores no direccionales no entran en el compuesto", () => {
    const result = aggregate({
      runs: [
        run("entropy.lexical", 0.8),
        run("repetition.ngram", 0.8),
        run("stylometry.functionwords", null),
        run("diversity.lexical", null),
        run("orthography.punctuation", null),
      ],
      metas,
      profile,
    });
    expect(result.signalIndex).toBe(80);
    expect(result.coverage.enginesWithSignal).toBe(2);
  });

  it("no calcula índice con menos de dos grupos independientes", () => {
    const result = aggregate({ runs: [run("repetition.ngram", 0.9)], metas, profile });
    expect(result.signalIndex).toBeNull();
    expect(result.signalBand).toBe("no calculable");
    expect(result.signalRange).toBeNull();
    expect(result.evidence.level).toBe("low");
    expect(result.warnings.join(" ")).toContain("Solo un grupo");
  });

  it("no calcula índice con menos de 80 palabras aunque haya dos grupos", () => {
    const result = aggregate({
      runs: [run("entropy.lexical", 0.9), run("repetition.ngram", 0.9)],
      metas,
      profile: { ...profile, words: 40, language: "unknown" },
    });
    expect(result.signalIndex).toBeNull();
    expect(result.evidence.level).toBe("low");
    expect(result.warnings.join(" ")).toContain("Texto corto");
  });

  it("sin señales direccionales la evidencia es insuficiente", () => {
    const result = aggregate({
      runs: [run("stylometry.functionwords", null), run("orthography.punctuation", null)],
      metas,
      profile,
    });
    expect(result.signalIndex).toBeNull();
    expect(result.evidence.level).toBe("insufficient");
  });

  it("la evidencia describe cobertura y nunca se declara alta sin validación", () => {
    const result = aggregate({
      runs: [
        run("entropy.lexical", 0.5),
        run("repetition.ngram", 0.5),
        run("burstiness", 0.5),
      ],
      metas,
      profile,
    });
    expect(result.evidence.level).toBe("low");
    expect(result.evidence.definition).toContain("No es probabilidad de acierto");
    expect(result.evidence.reasons.join(" ")).toContain("Ningún grupo con validación declarada");
  });

  it("el rango es dispersión entre grupos y queda dentro de 0..100", () => {
    const result = aggregate({
      runs: [run("entropy.lexical", 0.95), run("repetition.ngram", 0.05)],
      metas,
      profile,
    });
    expect(result.signalRange).not.toBeNull();
    expect(result.signalRange![0]).toBeGreaterThanOrEqual(0);
    expect(result.signalRange![1]).toBeLessThanOrEqual(100);
    // El rango es exactamente [mínimo, máximo] de los grupos, no una banda inventada.
    const signals = result.groups.map((group) => Math.round((group.signal ?? 0) * 100));
    expect(result.signalRange).toEqual([Math.min(...signals), Math.max(...signals)]);
  });

  it("informa los motores registrados y los solicitados por separado", () => {
    const result = aggregate({
      runs: [run("entropy.lexical", 0.5), run("repetition.ngram", 0.5)],
      metas,
      profile,
    });
    expect(result.coverage.enginesRegistered).toBe(metas.length);
    expect(result.coverage.enginesRequested).toBe(2);
    expect(result.coverage.enginesRegistered).toBeGreaterThan(result.coverage.enginesRequested);
  });
});
