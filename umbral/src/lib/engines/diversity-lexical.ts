import type { Engine } from "@/lib/types";
import { countBy, hapaxLegomena } from "@/lib/text/stats";
import { evidenceFor, metric } from "./helpers";

function mattr(words: string[], window = 50): number {
  if (words.length <= window) {
    const types = new Set(words);
    return words.length === 0 ? 0 : types.size / words.length;
  }
  let total = 0;
  let count = 0;
  for (let i = 0; i + window <= words.length; i++) {
    const slice = words.slice(i, i + window);
    total += new Set(slice).size / window;
    count++;
  }
  return count === 0 ? 0 : total / count;
}

/**
 * MTLD (McCarthy & Jarvis, 2010) con umbral TTR = 0.72, en ambas direcciones.
 * Devuelve null con menos de 10 palabras: el índice no está definido y un 0
 * se leería como «diversidad nula», que sería falso.
 */
function mtld(words: string[], threshold = 0.72): number | null {
  if (words.length < 10) return null;
  const oneWay = (seq: string[]): number => {
    let factors = 0;
    let types = new Set<string>();
    let count = 0;
    let ttr = 1;
    for (const w of seq) {
      types.add(w);
      count++;
      ttr = types.size / count;
      if (ttr <= threshold) {
        factors += 1;
        types = new Set();
        count = 0;
        ttr = 1;
      }
    }
    if (count > 0) factors += (1 - ttr) / (1 - threshold);
    return factors === 0 ? words.length : words.length / factors;
  };
  const forward = oneWay(words);
  const backward = oneWay([...words].reverse());
  if (!Number.isFinite(forward) || !Number.isFinite(backward)) return null;
  return (forward + backward) / 2;
}

export const lexicalDiversityEngine: Engine = {
  meta: {
    id: "diversity.lexical",
    name: "Diversidad léxica",
    kind: "statistical",
    family: "stylometric",
    version: "1.0.0",
    summary: "TTR, MATTR, MTLD y proporción de hapax con control de longitud.",
    methodology:
      "Se calcula el Type-Token Ratio simple (sensible a la longitud), el MATTR por ventanas deslizantes de 50 palabras, el MTLD con umbral 0.72 en ambas direcciones y el porcentaje de hapax legomena.",
    variables: ["Tipos léxicos distintos", "Longitud del texto", "Ventanas de 50 palabras", "Palabras de frecuencia 1"],
    formulas: [
      { name: "TTR", expression: "TTR = V / N" },
      { name: "MATTR", expression: "MATTR = (1/(N-w+1)) · Σ (V_i / w)", note: "w = 50 palabras." },
      {
        name: "MTLD",
        expression: "MTLD = N / factores",
        note: "Un factor se cierra cuando TTR ≤ 0.72; se promedian dirección directa e inversa.",
      },
      { name: "Hapax", expression: "Hapax% = 100 · V1 / V" },
    ],
    limitations: [
      "El TTR simple no es comparable entre textos de distinta longitud; por eso se informan MATTR y MTLD.",
      "MTLD es sensible a variaciones menores en textos cortos.",
      "No tiene dirección interpretativa validada: un texto artificial puede tener diversidad alta o baja.",
    ],
    languages: ["es", "en"],
    minWords: 60,
    external: false,
    validation: "unvalidated",
    directionality: "non-directional",
    dependenceCluster: "lexical-richness",
    sharesVarianceWith: [
      { engine: "richness.yule", reason: "Ambos se calculan sobre la distribución de frecuencias de tipos del mismo texto." },
    ],
    supportsSegments: false,
    references: [
      "McCarthy, P. M. & Jarvis, S. (2010). MTLD, vocd-D, and HD-D: A validation study.",
      "Covington, M. A. & McFall, J. D. (2010). Cutting the Gordian knot: MATTR.",
    ],
  },
  run(ctx) {
    const counts = [...countBy(ctx.lowerWords, (w) => w).values()];
    const v = counts.length;
    const n = ctx.lowerWords.length;
    const hapax = hapaxLegomena(counts);
    return {
      metrics: [
        metric("ttr", "Type-Token Ratio", n ? v / n : 0, "0-1", "Sensible a la longitud."),
        metric("mattr50", "MATTR (ventana 50)", mattr(ctx.lowerWords, 50), "0-1"),
        metric(
          "mtld",
          "MTLD",
          mtld(ctx.lowerWords),
          "palabras",
          "Mayor = mayor diversidad léxica estimada. No calculable con menos de 10 palabras.",
        ),
        metric("hapaxCount", "Hapax legomena", hapax, "palabras"),
        metric("hapaxRatio", "Proporción de hapax", v ? hapax / v : 0, "0-1"),
        metric("meanWordFrequency", "Frecuencia media por tipo", n / Math.max(1, v), "apariciones"),
        metric(
          "lengthNormalizedNote",
          "Control de sesgo de longitud",
          n >= 200 ? "adecuado" : "limitado",
          undefined,
          "MTLD y MATTR mitigan el efecto de la longitud, no lo eliminan.",
        ),
        // Auditoría: «Hapax medio por tipo» era la media de una lista de unos,
        // es decir, siempre 1 o 0. Se sustituye por una proporción informativa.
        metric(
          "hapaxShareOfTokens",
          "Palabras que son hapax",
          n ? hapax / n : 0,
          "0-1",
          "Proporción sobre el total de palabras, no sobre los tipos.",
        ),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "Medida descriptiva de riqueza léxica; no se interpreta como indicio de autoría.",
        `Longitud evaluada: ${n} palabras, ${v} tipos.`,
      ],
      warnings: n < 200 ? ["Menos de 200 palabras: la diversidad léxica no es comparable con textos largos."] : [],
    };
  },
};
