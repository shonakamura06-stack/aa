import type { EngineContext, Language, TextProfile } from "@/lib/types";
import { detectLanguage } from "@/lib/text/language";
import { countNumericTokens, paragraphSpans, sentenceSpans, stripDiacritics, wordSpans } from "@/lib/text/tokenize";
import { countBy, mean } from "@/lib/text/stats";
import { ES_ACADEMIC_MARKERS, EN_ACADEMIC_MARKERS, ES_NARRATIVE_MARKERS } from "@/lib/text/lexicons";

export function buildContext(text: string, requestedLanguage: "auto" | "es" | "en", signal?: AbortSignal): EngineContext {
  const detection = detectLanguage(text);
  const language: Language =
    requestedLanguage === "auto" ? detection.language : requestedLanguage;
  // El segmentador se elige por idioma: las abreviaturas y los signos de cierre
  // no se comportan igual en español y en inglés. La detección usa el segmentador
  // por defecto, que solo afecta a los límites de palabra.
  const locale = language === "en" ? "en" : "es";
  const words = wordSpans(text, locale).map((s) => s.text);
  const sentenceSpansList = sentenceSpans(text, locale);
  const paragraphSpansList = paragraphSpans(text);
  return {
    text,
    language,
    requestedLanguage,
    words,
    lowerWords: words.map((w) => w.toLocaleLowerCase("es")),
    sentenceSpans: sentenceSpansList,
    sentences: sentenceSpansList.map((s) => s.text),
    paragraphSpans: paragraphSpansList,
    paragraphs: paragraphSpansList.map((p) => p.text),
    characterCount: text.length,
    wordCount: words.length,
    signal: signal ?? new AbortController().signal,
  };
}

export function buildProfile(text: string, ctx: EngineContext): TextProfile {
  const detection = detectLanguage(text);
  const uniqueWords = countBy(ctx.lowerWords, (w) => w).size;
  const sentenceLengths = ctx.sentences.map((s) => (s.match(/[\p{L}\p{M}]+/gu) ?? []).length);
  const lowerStripped = ctx.lowerWords.map(stripDiacritics).join(" ");
  const academicMarkers = (ctx.language === "en" ? EN_ACADEMIC_MARKERS : ES_ACADEMIC_MARKERS).filter((m) =>
    lowerStripped.includes(stripDiacritics(m)),
  ).length;
  const narrativeHits = ES_NARRATIVE_MARKERS.filter((m) => new Set(ctx.lowerWords).has(m)).length;
  const informalSignals = (text.match(/[jJ]a[jJ]a|😀|😂|\bq\b|\bxq\b|\bwow\b|[!]{2,}|\?{2,}/gu) ?? []).length;
  const citationSignals = (text.match(/\(\s*\d{4}\s*\)|\[\d+\]|et al\./gu) ?? []).length;

  let contentType: TextProfile["contentType"] = "indeterminado";
  if (ctx.wordCount < 30) contentType = "indeterminado";
  else if (informalSignals > 2) contentType = "informal";
  else if (academicMarkers >= 6 || citationSignals >= 2) contentType = "académico";
  else if (narrativeHits >= 5) contentType = "narrativo";
  else if (academicMarkers >= 3) contentType = "formal";
  else if (ctx.sentences.length >= 3) contentType = "informativo";

  const lengthAssessment: TextProfile["lengthAssessment"] =
    ctx.wordCount < 80
      ? { level: "insuficiente", message: "Menos de 80 palabras: la mayoría de los métodos no son fiables." }
      : ctx.wordCount < 200
        ? { level: "limitado", message: "Entre 80 y 200 palabras: resultados orientativos, con mayor incertidumbre." }
        : ctx.wordCount < 800
          ? { level: "adecuado", message: "Entre 200 y 800 palabras: rango razonable para analizadores estadísticos." }
          : { level: "amplio", message: "Más de 800 palabras: longitud suficiente para estimaciones estables." };

  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/gu, "").length,
    words: ctx.wordCount,
    numericTokens: countNumericTokens(text),
    uniqueWords,
    sentences: ctx.sentences.length,
    paragraphs: ctx.paragraphs.length,
    language: ctx.language,
    languageConfidence: detection.confidence,
    languageMethod: detection.method,
    avgSentenceLength: mean(sentenceLengths),
    lexicalDiversity: ctx.wordCount ? uniqueWords / ctx.wordCount : 0,
    contentType,
    lengthAssessment,
  };
}
