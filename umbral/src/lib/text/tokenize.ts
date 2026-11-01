/**
 * Segmentación lingüística con Intl.Segmenter (incluido en Node 22 / V8).
 * Se evita cualquier dependencia externa para una tarea que la plataforma
 * ya resuelve de forma nativa y consciente de la lengua.
 */

export interface Span {
  start: number;
  end: number;
  text: string;
}

/**
 * Un segmentador por locale. La versión anterior cacheaba uno solo y reutilizaba
 * el primero creado para cualquier idioma: un texto inglés analizado después de
 * uno español se segmentaba con reglas de español.
 */
const wordSegmenters = new Map<string, Intl.Segmenter>();
const sentenceSegmenters = new Map<string, Intl.Segmenter>();

function getWordSegmenter(locale: string): Intl.Segmenter {
  let segmenter = wordSegmenters.get(locale);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    wordSegmenters.set(locale, segmenter);
  }
  return segmenter;
}

function getSentenceSegmenter(locale: string): Intl.Segmenter {
  let segmenter = sentenceSegmenters.get(locale);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
    sentenceSegmenters.set(locale, segmenter);
  }
  return segmenter;
}

const HAS_LETTER = /\p{L}/u;

/**
 * Palabras con sus posiciones en el texto original (offsets en UTF-16).
 * Se excluyen los tokens puramente numéricos: `1.234` o `2024` no son palabras
 * léxicas y, al ser casi siempre únicos, inflaban artificialmente el TTR y la
 * entropía. Se cuentan por separado en `countNumericTokens`.
 */
export function wordSpans(text: string, locale = "es"): Span[] {
  const out: Span[] = [];
  for (const segment of getWordSegmenter(locale).segment(text)) {
    if (!segment.isWordLike) continue;
    if (!HAS_LETTER.test(segment.segment)) continue;
    out.push({ start: segment.index, end: segment.index + segment.segment.length, text: segment.segment });
  }
  return out;
}

/** Tokens que el segmentador considera palabra pero que no contienen letras. */
export function countNumericTokens(text: string, locale = "es"): number {
  let numeric = 0;
  for (const segment of getWordSegmenter(locale).segment(text)) {
    if (segment.isWordLike && !HAS_LETTER.test(segment.segment)) numeric++;
  }
  return numeric;
}

/** Oraciones con posiciones. Descarta fragmentos sin letras. */
export function sentenceSpans(text: string, locale = "es"): Span[] {
  const out: Span[] = [];
  for (const segment of getSentenceSegmenter(locale).segment(text)) {
    if (!HAS_LETTER.test(segment.segment)) continue;
    const trimmedStart = segment.segment.length - segment.segment.trimStart().length;
    const trimmedEnd = segment.segment.length - segment.segment.trimEnd().length;
    if (trimmedStart + trimmedEnd >= segment.segment.length) continue;
    out.push({
      start: segment.index + trimmedStart,
      end: segment.index + segment.segment.length - trimmedEnd,
      text: segment.segment.trim(),
    });
  }
  return out;
}

/** Párrafos: bloques separados por una o más líneas en blanco. */
export function paragraphSpans(text: string): Span[] {
  const out: Span[] = [];
  const separator = /\n[ \t]*\n+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    if (!HAS_LETTER.test(raw)) return;
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    out.push({ start: from + leading, end: to - trailing, text: raw.trim() });
  };
  while ((match = separator.exec(text)) !== null) {
    push(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  push(cursor, text.length);
  return out;
}

/** Minúsculas preservando acentos; se usa para conteos de tipos. */
export function normalizeWord(word: string): string {
  return word.toLocaleLowerCase("es").replace(/[’']/g, "'");
}

/** Versión sin diacríticos para comparar con léxicos de referencia. */
export function stripDiacritics(word: string): string {
  return normalizeWord(word).normalize("NFD").replace(/\p{M}+/gu, "");
}

export function wordCount(text: string): number {
  return wordSpans(text).length;
}

export { HAS_LETTER };
