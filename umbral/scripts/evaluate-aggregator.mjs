#!/usr/bin/env node
/**
 * Evaluación del agregador sobre un conjunto etiquetado.
 *
 *   node scripts/evaluate-aggregator.mjs --data evaluacion.jsonl --base http://127.0.0.1:3000
 *
 * Formato JSONL: {"text": "...", "label": "human"|"ai", "author": "...", "language": "es"}
 *
 * No entrena nada: describe el comportamiento del índice heurístico y de cada
 * señal por motor en ESTA muestra (AUROC con intervalo bootstrap, AUPRC,
 * precisión/recall/especificidad a un umbral declarado y TPR@FPR solo si el
 * tamaño muestral lo permite).
 *
 * Avisos de interpretación que el propio script imprime:
 *  - El índice NO es una probabilidad; su AUROC mide separación en esta muestra.
 *  - TPR@FPR=1 % exige ≥100 negativos; con menos se devuelve null.
 *  - Un conjunto de decenas de documentos es exploratorio: no sostiene cifras
 *    de rendimiento con dos decimales.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * AUROC por rangos con **rango promedio** en los empates (aproximación de
 * Mann-Whitney). Devuelve null si solo hay una clase presente.
 */
export function auroc(labels, scores) {
  const nPos = labels.filter((l) => l === 1).length;
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0 || labels.length !== scores.length) return null;

  const pairs = labels
    .map((label, i) => ({ label, score: scores[i] }))
    .sort((a, b) => a.score - b.score);

  let rankSumPositive = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].score === pairs[i].score) j++;
    const averageRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) if (pairs[k].label === 1) rankSumPositive += averageRank;
    i = j + 1;
  }
  return (rankSumPositive - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

/**
 * TPR con FPR ≤ target. El umbral se optimiza sobre los mismos datos, así que es
 * una cota optimista. Devuelve null si falta alguna clase.
 */
export function tprAtFpr(labels, scores, target = 0.01) {
  const nPos = labels.filter((l) => l === 1).length;
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return null;
  // Con n negativos la granularidad mínima del FPR es 1/n. Para estimar un 1 %
  // hacen falta al menos 100 negativos; con menos, el punto de operación no
  // existe y devolver una cifra sería una extrapolación.
  if (nNeg < Math.ceil(1 / target)) return null;
  const thresholds = [...new Set(scores)].sort((a, b) => b - a);
  let best = 0;
  for (const threshold of thresholds) {
    let tp = 0;
    let fp = 0;
    for (let i = 0; i < labels.length; i++) {
      if (scores[i] < threshold) continue;
      if (labels[i] === 1) tp++;
      else fp++;
    }
    if (fp / nNeg <= target) best = Math.max(best, tp / nPos);
  }
  return best;
}

/** Bootstrap percentil del AUROC (remuestreo con reemplazo). */
export function bootstrapAuroc(labels, scores, { rounds = 1000, seed = 7 } = {}) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const values = [];
  for (let round = 0; round < rounds; round++) {
    const idx = labels.map(() => Math.floor(random() * labels.length));
    const sampledLabels = idx.map((i) => labels[i]);
    if (!sampledLabels.includes(1) || !sampledLabels.includes(0)) continue;
    const value = auroc(sampledLabels, idx.map((i) => scores[i]));
    if (value !== null) values.push(value);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const at = (q) => values[Math.min(values.length - 1, Math.max(0, Math.floor(q * (values.length - 1))))];
  return [at(0.025), at(0.975)];
}

export function binaryMetrics(labels, scores, threshold = 0.5) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  labels.forEach((label, i) => {
    const flag = scores[i] >= threshold;
    if (label === 1 && flag) tp++;
    else if (label === 1) fn++;
    else if (flag) fp++;
    else tn++;
  });
  const div = (a, b) => (b === 0 ? null : a / b);
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);
  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    specificity: div(tn, tn + fp),
    f1: precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall),
  };
}

export function averagePrecision(labels, scores) {
  const nPos = labels.filter((l) => l === 1).length;
  if (nPos === 0) return null;
  const pairs = labels.map((label, i) => ({ label, score: scores[i] })).sort((a, b) => b.score - a.score);
  let tp = 0;
  let fp = 0;
  let previousRecall = 0;
  let area = 0;
  for (const pair of pairs) {
    if (pair.label === 1) tp++;
    else fp++;
    if (pair.label !== 1) continue;
    const recall = tp / nPos;
    const precision = tp / (tp + fp);
    area += (recall - previousRecall) * precision;
    previousRecall = recall;
  }
  return area;
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const POSITIVE_LABELS = new Set(["ai", "1", "machine", "generated"]);
const NEGATIVE_LABELS = new Set(["human", "humano", "0", "real"]);

export function parseRows(raw) {
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        const parsed = JSON.parse(line);
        const label = String(parsed.label).toLowerCase().trim();
        if (!POSITIVE_LABELS.has(label) && !NEGATIVE_LABELS.has(label)) {
          throw new Error(`etiqueta no reconocida: ${parsed.label}`);
        }
        if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
          throw new Error("falta el campo text");
        }
        return {
          text: parsed.text,
          label: POSITIVE_LABELS.has(label) ? 1 : 0,
          author: parsed.author ?? "",
          language: parsed.language ?? "unknown",
        };
      } catch (error) {
        console.warn(`Línea ${i + 1} ignorada: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

async function analyze(base, text, language, attempt = 1) {
  const response = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language: language === "es" || language === "en" ? language : "auto",
    }),
  });
  if (response.status === 429 && attempt <= 5) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? 60);
    console.warn(`\n429: esperando ${retryAfter} s (intento ${attempt}/5).`);
    await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
    return analyze(base, text, language, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

function fmt(value) {
  return value === null ? "n/d " : value.toFixed(3);
}

export async function main() {
  const dataPath = arg("data");
  const base = arg("base", "http://127.0.0.1:3000");
  const outPath = arg("out", "ml/artifacts/aggregator-evaluation.json");
  const delayMs = Number(arg("delay", "0"));

  if (!dataPath) {
    console.error("Falta --data. Sin un conjunto etiquetado con procedencia conocida no se puede evaluar.");
    process.exit(2);
  }

  const rows = parseRows(readFileSync(dataPath, "utf8"));
  const positives = rows.filter((row) => row.label === 1).length;
  const negatives = rows.length - positives;
  if (rows.length < 40 || positives < 10 || negatives < 10) {
    console.error(
      `Se necesitan al menos 40 documentos y 10 por clase; hay ${rows.length} (${positives} IA / ${negatives} humanos).`,
    );
    process.exit(2);
  }

  const results = [];
  const engineSignals = new Map();
  const engineMissing = new Map();

  for (const [index, row] of rows.entries()) {
    process.stdout.write(`\rAnalizando ${index + 1}/${rows.length}`);
    const result = await analyze(base, row.text, row.language);
    results.push({
      label: row.label,
      index: result.aggregate.signalIndex,
      language: result.profile.language,
      contentType: result.profile.contentType,
    });
    for (const engine of result.engines) {
      if (engine.signal === null) {
        engineMissing.set(engine.id, (engineMissing.get(engine.id) ?? 0) + 1);
        continue;
      }
      if (!engineSignals.has(engine.id)) engineSignals.set(engine.id, []);
      engineSignals.get(engine.id).push({ label: row.label, signal: engine.signal });
    }
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  process.stdout.write("\n");

  const labels = results.map((row) => row.label);
  const indexScores = results.map((row) => row.index / 100);
  const sum = (values) => values.reduce((a, b) => a + b, 0);

  const caveats = [];
  if (rows.length < 200) {
    caveats.push(
      `Muestra pequeña (${rows.length} documentos): los valores son exploratorios. Con menos de 200 no se deben citar cifras de rendimiento con precisión de centésimas.`,
    );
  }
  if (negatives < 100) {
    caveats.push(
      `TPR@FPR=1 % no se informa: hacen falta al menos 100 documentos humanos y hay ${negatives}.`,
    );
  }
  const distinctValues = new Set(indexScores).size;
  const lowResolution = distinctValues < 5;
  if (lowResolution) {
    caveats.push(
      "El índice toma muy pocos valores distintos: la muestra no permite comparar umbrales y el intervalo bootstrap se omite.",
    );
  }
  caveats.push(
    "El índice es un compuesto heurístico sin calibrar: su AUROC describe separación en esta muestra, no una probabilidad ni un rendimiento esperado en otro corpus.",
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    documents: rows.length,
    positives,
    negatives,
    index: {
      auroc: auroc(labels, indexScores),
      aurocCi95: lowResolution ? null : bootstrapAuroc(labels, indexScores),
      auprc: averagePrecision(labels, indexScores),
      binary: binaryMetrics(labels, indexScores, 0.5),
      tprAtFpr1: tprAtFpr(labels, indexScores, 0.01),
      meanHuman: sum(indexScores.filter((_, i) => labels[i] === 0)) / negatives,
      meanAi: sum(indexScores.filter((_, i) => labels[i] === 1)) / positives,
      distinctValues,
    },
    engines: [...engineSignals.entries()]
      .map(([id, values]) => {
        const engineLabels = values.map((v) => v.label);
        const engineScores = values.map((v) => v.signal);
        return {
          id,
          n: values.length,
          positives: engineLabels.filter((l) => l === 1).length,
          missing: engineMissing.get(id) ?? 0,
          auroc: auroc(engineLabels, engineScores),
          aurocCi95: bootstrapAuroc(engineLabels, engineScores),
          tprAtFpr1: tprAtFpr(engineLabels, engineScores, 0.01),
        };
      })
      .sort((a, b) => (b.auroc ?? -1) - (a.auroc ?? -1)),
    caveats,
    byLanguage: {},
    byContentType: {},
    note: "El umbral de TPR@FPR se optimiza sobre los mismos datos: es una cota optimista. Decidir una probabilidad calibrada exige validación cruzada por grupo y calibración en un conjunto separado.",
  };

  for (const [field, target] of [["language", "byLanguage"], ["contentType", "byContentType"]]) {
    for (const value of new Set(results.map((row) => row[field]))) {
      const subset = results.filter((row) => row[field] === value);
      const subsetLabels = subset.map((row) => row.label);
      if (subsetLabels.filter((l) => l === 1).length < 5) continue;
      if (subsetLabels.filter((l) => l === 0).length < 5) continue;
      summary[target][value] = {
        n: subset.length,
        auroc: auroc(subsetLabels, subset.map((row) => row.index / 100)),
      };
    }
  }

  console.log("\n=== Índice heurístico agregado ===");
  console.log(
    `AUROC: ${fmt(summary.index.auroc)} IC95 ${
      summary.index.aurocCi95 ? `[${fmt(summary.index.aurocCi95[0])}, ${fmt(summary.index.aurocCi95[1])}]` : "n/d"
    }  AUPRC: ${fmt(summary.index.auprc)}  TPR@FPR1%: ${
      summary.index.tprAtFpr1 === null ? "no informable (muestra insuficiente)" : `${(summary.index.tprAtFpr1 * 100).toFixed(1)}%`
    }`,
  );
  console.log(
    `A umbral 0,50: precisión ${fmt(summary.index.binary.precision)} · recall ${fmt(summary.index.binary.recall)} · especificidad ${fmt(summary.index.binary.specificity)} · F1 ${fmt(summary.index.binary.f1)}`,
  );
  console.log(
    `Media humano: ${(summary.index.meanHuman * 100).toFixed(1)}  Media IA: ${(summary.index.meanAi * 100).toFixed(1)}  valores distintos: ${summary.index.distinctValues}`,
  );
  if (summary.index.distinctValues < 5) {
    console.log("AVISO: el índice toma muy pocos valores distintos; la muestra no permite conclusiones.");
  }

  console.log("\n=== Señales por motor ===");
  for (const engine of summary.engines) {
    console.log(
      `${engine.id.padEnd(32)} AUROC ${fmt(engine.auroc)}  TPR@FPR1% ${
        engine.tprAtFpr1 === null ? "n/d" : `${(engine.tprAtFpr1 * 100).toFixed(1)}%`
      }  n=${engine.n}  sin señal=${engine.missing}`,
    );
  }
  console.log("\n=== Avisos ===");
  for (const caveat of caveats) console.log(`· ${caveat}`);

  mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nInforme escrito en ${outPath}`);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
