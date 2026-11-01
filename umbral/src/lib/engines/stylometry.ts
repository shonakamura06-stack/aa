import type { Engine } from "@/lib/types";
import { countBy, mean, normalizedEntropy, shannonEntropy, zipfSlope } from "@/lib/text/stats";
import { EN_FUNCTION_WORDS, ES_FUNCTION_WORDS } from "@/lib/text/lexicons";
import { evidenceFor, metric, topEntries } from "./helpers";

const ES_FW = new Set(ES_FUNCTION_WORDS);
const EN_FW = new Set(EN_FUNCTION_WORDS);
const ES_PRONOUNS = new Set(["yo","tú","él","ella","nosotros","nosotras","vosotros","vosotras","ellos","ellas","me","te","se","nos","os","le","les","mí","ti","sí","conmigo","contigo","mi","mis","tu","tus","su","sus","nuestro","nuestra","nuestros","nuestras","este","esta","estos","estas","ese","esa","esos","esas","aquel","aquella","quien","quienes","cual","cuales"]);
const ES_ARTICLES = new Set(["el","la","los","las","un","una","unos","unas","lo","al","del"]);
const ES_PREPOSITIONS = new Set(["de","a","en","con","por","para","sin","sobre","entre","hasta","desde","hacia","según","contra","durante","mediante","tras","ante","bajo"]);
const ES_CONJUNCTIONS = new Set(["y","e","o","u","pero","sino","que","si","como","cuando","mientras","porque","pues","ni","aunque"]);

export const stylometryEngine: Engine = {
  meta: {
    id: "stylometry.functionwords",
    name: "Estilometría de palabras funcionales",
    kind: "statistical",
    family: "stylometric",
    version: "1.0.0",
    summary:
      "Perfil de clase cerrada: proporción de palabras funcionales, pronombres, artículos, preposiciones y forma de la distribución léxica.",
    methodology:
      "Se compara cada token con listas cerradas de palabras funcionales del español o del inglés. Se calculan proporciones por categoría, entropía de la distribución de palabras funcionales, longitud media de palabra y pendiente de Zipf. La estilometría clásica usa estas proporciones como huella de estilo, no como prueba de autoría.",
    variables: ["Palabras funcionales", "Pronombres", "Artículos", "Preposiciones", "Conjunciones", "Longitud de palabra", "Pendiente de Zipf"],
    formulas: [
      { name: "Tasa de funcionales", expression: "TF = |{wᵢ ∈ clase cerrada}| / N" },
      { name: "Entropía de funcionales", expression: "H_fw = −Σ p(w) log2 p(w) / log2(V_fw)" },
      { name: "Pendiente de Zipf", expression: "log10(frecuencia) ≈ a + b·log10(rango)" },
    ],
    limitations: [
      "Sin un corpus de referencia del mismo género e idioma, las proporciones no se pueden comparar con una línea base.",
      "El perfil depende del registro: un texto académico y uno conversacional difieren legítimamente.",
      "No hay calibración que convierta estas proporciones en probabilidad de autoría.",
    ],
    languages: ["es", "en"],
    minWords: 100,
    external: false,
    validation: "descriptive",
    directionality: "non-directional",
    dependenceCluster: "function-word-profile",
    sharesVarianceWith: [
      { engine: "morphosyntax.profile", reason: "El perfil morfosintáctico reutiliza las mismas listas de palabras funcionales." },
    ],
    supportsSegments: false,
    references: ["Mosteller, F. & Wallace, D. (1964). Inference and Disputed Authorship: The Federalist."],
  },
  run(ctx) {
    const isEn = ctx.language === "en";
    const fw = isEn ? EN_FW : ES_FW;
    const words = ctx.lowerWords;
    const n = Math.max(1, words.length);
    let fwCount = 0;
    const fwCounts = new Map<string, number>();
    let pronouns = 0;
    let articles = 0;
    let prepositions = 0;
    let conjunctions = 0;
    for (const w of words) {
      if (fw.has(w)) {
        fwCount++;
        fwCounts.set(w, (fwCounts.get(w) ?? 0) + 1);
      }
      if (!isEn) {
        if (ES_PRONOUNS.has(w)) pronouns++;
        if (ES_ARTICLES.has(w)) articles++;
        if (ES_PREPOSITIONS.has(w)) prepositions++;
        if (ES_CONJUNCTIONS.has(w)) conjunctions++;
      }
    }
    const lengths = words.map((w) => w.length);
    const lengthCounts = countBy(lengths, (l) => String(l));
    const counts = [...countBy(words, (w) => w).values()];
    const top = topEntries(fwCounts, 8);
    return {
      metrics: [
        metric("functionWordRate", "Tasa de palabras funcionales", fwCount / n, "0-1"),
        metric("functionWordEntropy", "Entropía normalizada de funcionales", normalizedEntropy([...fwCounts.values()]), "0-1"),
        metric(
          "pronounRate",
          "Pronombres",
          isEn ? null : pronouns / n,
          "0-1",
          isEn ? "No calculable en inglés en esta versión: las listas de subcategorías están definidas solo para español." : undefined,
        ),
        metric("articleRate", "Artículos", articles / n, "0-1"),
        metric("prepositionRate", "Preposiciones", prepositions / n, "0-1"),
        metric("conjunctionRate", "Conjunciones", conjunctions / n, "0-1"),
        metric("contentWordRate", "Palabras de contenido", 1 - fwCount / n, "0-1"),
        metric("meanWordLength", "Longitud media de palabra", mean(lengths), "caracteres"),
        metric("wordLengthEntropy", "Entropía de longitud de palabra", shannonEntropy([...lengthCounts.values()]), "bits"),
        metric("zipfSlope", "Pendiente de Zipf", zipfSlope(counts), "log-log", "Cercana a −1 en textos naturales."),
        metric("topFunctionWords", "Funcionales más frecuentes", top.map(([w, c]) => `${w} (${c})`).join(", ")),
      ],
      signal: null,
      evidence: evidenceFor(ctx, "medium", this.meta.minWords),
      notes: [
        "El perfil es descriptivo. Sin corpus de referencia del mismo género no se compara con una línea base.",
        `Palabras evaluadas: ${words.length}.`,
      ],
      warnings: isEn
        ? ["Los subconjuntos de pronombres, artículos y preposiciones solo están definidos para español."]
        : [],
      meta: { fwCounts: top },
    };
  },
};
