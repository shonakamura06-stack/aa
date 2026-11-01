import type { Language } from "@/lib/types";
import { stripDiacritics, wordSpans } from "./tokenize";

/**
 * Detección de idioma por palabras funcionales (método de lista cerrada).
 * Es un método transparente y reproducible, no un modelo entrenado; se
 * declara con esa limitación en la interfaz y en /api/engines.
 */
const MARKERS: Record<"es" | "en" | "pt" | "fr" | "it" | "de", string[]> = {
  es: ["el","la","los","las","de","que","y","en","un","una","del","se","con","por","para","es","no","su","al","lo","como","más","pero","sus","le","ya","este","porque","entre","cuando","muy","sin","sobre","también","hay","desde","todo","nos","ni","otro","esa","eso","esta","esto","son","fue","ser","tiene","donde"],
  en: ["the","of","and","to","in","a","is","that","for","it","as","was","with","be","by","on","not","this","are","or","his","from","at","which","but","have","an","had","they","you","were","their","one","all","we","can","has","there","been","if","more","when","will","would","who","so","no","she","them","her"],
  pt: ["o","a","os","as","de","que","e","do","da","em","um","uma","para","com","não","se","na","no","por","mais","como","mas","seu","sua","ao","dos","das","foi","ser","tem","também","muito","quando","há"],
  fr: ["le","la","les","de","des","et","en","un","une","du","que","qui","dans","pour","pas","sur","est","au","aux","avec","ce","cette","son","sa","ses","plus","mais","nous","vous","ils","elles","être","avoir","comme","tout"],
  it: ["il","la","le","di","e","un","una","del","che","per","con","non","si","in","è","sono","come","più","anche","questo","questa","gli","dei","delle","al","alla","essere","ha","hanno","molto","quando"],
  de: ["der","die","das","und","in","den","von","zu","mit","sich","des","auf","für","ist","im","dem","nicht","ein","eine","als","auch","es","an","werden","aus","er","hat","dass","sie","nach","wird","bei","noch","wie","ihre"],
};

const MARKER_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(MARKERS).map(([k, v]) => [k, new Set(v)]),
);

export interface LanguageDetection {
  language: Language;
  confidence: number;
  method: string;
  scores: Record<string, number>;
}

export function detectLanguage(text: string): LanguageDetection {
  const tokens = wordSpans(text).map((s) => stripDiacritics(s.text));
  const total = tokens.length;
  const scores: Record<string, number> = {};
  if (total === 0) {
    return { language: "unknown", confidence: 0, method: "lista-cerrada", scores: {} };
  }
  for (const [lang, set] of Object.entries(MARKER_SETS)) {
    let hits = 0;
    for (const t of tokens) if (set.has(t)) hits++;
    scores[lang] = hits / total;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestLang, bestScore] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  if (bestScore < 0.04) {
    return { language: "unknown", confidence: Number(bestScore.toFixed(3)), method: "lista-cerrada", scores };
  }
  const mapped: Language = bestLang === "es" || bestLang === "en" ? bestLang : "unknown";
  const margin = bestScore === 0 ? 0 : (bestScore - second) / bestScore;
  const confidence = Number(Math.min(0.99, bestScore * 4 * margin + 0.2).toFixed(3));
  return {
    language: mapped,
    confidence: mapped === "unknown" ? Number(margin.toFixed(3)) : confidence,
    method: "lista-cerrada (palabras funcionales, es/en/pt/fr/it/de)",
    scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Number(v.toFixed(3))])),
  };
}
