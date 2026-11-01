import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { FEATURE_NAMES, computeFeatureVector } from "@/lib/ml/features";
import { HUMAN_ES, UNIFORM_ES, ENGLISH_TEXT, SHORT_ES } from "./fixtures/texts";

function hasPython(): boolean {
  try {
    execFileSync("python3", ["-c", "import sys"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const PYTHON_AVAILABLE = hasPython();

describe("vector de características", () => {
  it("tiene 22 características con nombre estable", () => {
    expect(FEATURE_NAMES.length).toBe(22);
    expect(computeFeatureVector(HUMAN_ES)).toHaveLength(22);
  });

  it("no produce valores no finitos", () => {
    for (const text of [HUMAN_ES, UNIFORM_ES, ENGLISH_TEXT, SHORT_ES, ""]) {
      for (const value of computeFeatureVector(text)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("es determinista", () => {
    expect(computeFeatureVector(HUMAN_ES)).toEqual(computeFeatureVector(HUMAN_ES));
  });
});

describe.skipIf(!PYTHON_AVAILABLE)("paridad TypeScript ↔ Python", () => {
  const texts = [HUMAN_ES, UNIFORM_ES, ENGLISH_TEXT, SHORT_ES];
  const pythonRaw = execFileSync("python3", ["ml/features.py", "--stdin"], {
    input: JSON.stringify(texts),
    encoding: "utf8",
  });
  const pythonVectors: number[][] = JSON.parse(pythonRaw);

  it("los nombres de característica coinciden", () => {
    const names = JSON.parse(
      execFileSync("python3", ["ml/features.py"], { encoding: "utf8" }),
    ) as string[];
    expect(names).toEqual([...FEATURE_NAMES]);
  });

  it("los valores coinciden en los cuatro textos de prueba", () => {
    texts.forEach((text, index) => {
      const ts = computeFeatureVector(text);
      const py = pythonVectors[index];
      expect(py).toHaveLength(22);
      ts.forEach((value, featureIndex) => {
        expect(
          Math.abs(value - py[featureIndex]),
          `${FEATURE_NAMES[featureIndex]} en texto ${index}: TS=${value} PY=${py[featureIndex]}`,
        ).toBeLessThan(1e-9);
      });
    });
  });
});
