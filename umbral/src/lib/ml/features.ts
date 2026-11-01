import lexicon from "../../../ml/feature_lexicon.json";

/**
 * Vector de características del clasificador.
 *
 * Para que el entrenamiento (Python) y la inferencia (TypeScript) coincidan
 * exactamente, este módulo usa un tokenizador portable y documentado, distinto
 * del Intl.Segmenter que emplean los analizadores lingüísticos:
 *
 *   token   = /[\p{L}\p{M}\p{N}]+/gu  (en minúsculas)
 *   oración = split(/(?<=[.!?…])\s+/u)
 *   párrafo = split(/\n\s*\n+/u)
 *
 * Cualquier cambio en esta definición obliga a reentrenar y a versionar el
 * artefacto. tests/feature-parity.test.ts verifica la igualdad numérica.
 */
export const FEATURE_NAMES = [
  "mean_sentence_words",
  "sd_sentence_words",
  "cv_sentence_words",
  "mean_paragraph_words",
  "cv_paragraph_words",
  "ttr",
  "mattr50",
  "hapax_ratio",
  "yules_k",
  "unigram_entropy_norm",
  "bigram_entropy_norm",
  "trigram_repeat_share",
  "bigram_repeat_share",
  "consecutive_repeat_rate",
  "mean_word_length",
  "word_length_entropy",
  "function_word_rate",
  "comma_per_sentence",
  "punct_per_sentence",
  "connector_density",
  "sentence_length_entropy",
  "long_sentence_share",
] as const;

export type FeatureVector = number[];

const TOKEN_RE = /[\p{L}\p{M}\p{N}]+/gu;
const SENTENCE_SPLIT = /(?<=[.!?…])\s+/u;
const PARAGRAPH_SPLIT = /\n\s*\n+/u;

const FUNCTION_WORDS = new Set(lexicon.functionWords.map((w) => w.toLowerCase()));
const CONNECTORS = lexicon.connectors.map((c) => c.toLowerCase());

export function portableTokens(text: string): string[] {
  return (text.toLocaleLowerCase("es").match(TOKEN_RE) ?? []);
}

export function portableSentences(text: string): string[] {
  return text
    .trim()
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{M}]/u.test(s));
}

export function portableParagraphs(text: string): string[] {
  return text
    .trim()
    .split(PARAGRAPH_SPLIT)
    .map((p) => p.trim())
    .filter((p) => /[\p{L}\p{M}]/u.test(p));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function sampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

function entropyBits(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function normalizedEntropy(counts: number[]): number {
  const types = counts.filter((c) => c > 0).length;
  if (types <= 1) return 0;
  return entropyBits(counts) / Math.log2(types);
}

function repetitionShare(seq: string[]): number {
  if (seq.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const s of seq) counts.set(s, (counts.get(s) ?? 0) + 1);
  let repeated = 0;
  for (const c of counts.values()) if (c > 1) repeated += c;
  return repeated / seq.length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function computeFeatureVector(text: string): FeatureVector {
  const tokens = portableTokens(text);
  const n = Math.max(1, tokens.length);
  const sentences = portableSentences(text);
  const paragraphs = portableParagraphs(text);

  const sentenceLengths = sentences.map((s) => portableTokens(s).length).filter((l) => l > 0);
  const paragraphLengths = paragraphs.map((p) => portableTokens(p).length).filter((l) => l > 0);

  const unigram = new Map<string, number>();
  for (const t of tokens) unigram.set(t, (unigram.get(t) ?? 0) + 1);
  const counts = [...unigram.values()];
  const types = counts.length;

  const ttr = types / n;
  const window = 50;
  let mattr = ttr;
  if (tokens.length > window) {
    let acc = 0;
    let c = 0;
    for (let i = 0; i + window <= tokens.length; i++) {
      acc += new Set(tokens.slice(i, i + window)).size / window;
      c++;
    }
    mattr = c ? acc / c : ttr;
  }
  const hapax = counts.filter((c) => c === 1).length;

  const bigrams: string[] = [];
  const trigrams: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  for (let i = 0; i + 2 < tokens.length; i++) trigrams.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  const bigramCounts = new Map<string, number>();
  for (const b of bigrams) bigramCounts.set(b, (bigramCounts.get(b) ?? 0) + 1);

  let consecutive = 0;
  for (let i = 1; i < tokens.length; i++) if (tokens[i] === tokens[i - 1]) consecutive++;

  const wordLengths = tokens.map((t) => t.length);
  const lengthCounts = new Map<number, number>();
  for (const l of wordLengths) lengthCounts.set(l, (lengthCounts.get(l) ?? 0) + 1);

  const functionWordCount = tokens.filter((t) => FUNCTION_WORDS.has(t)).length;
  const punctuationCount = (text.match(/[.,;:!?¡¿…]/gu) ?? []).length;
  const commaCount = (text.match(/,/gu) ?? []).length;
  const lowerText = text.toLocaleLowerCase("es");
  let connectorCount = 0;
  for (const connector of CONNECTORS) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(connector)}(?![\\p{L}\\p{M}])`, "gu");
    connectorCount += (lowerText.match(pattern) ?? []).length;
  }

  const sentenceCount = Math.max(1, sentences.length);
  const lengthBins = new Map<number, number>();
  for (const l of sentenceLengths) lengthBins.set(Math.floor(l / 5), (lengthBins.get(Math.floor(l / 5)) ?? 0) + 1);

  return [
    mean(sentenceLengths),
    sampleSd(sentenceLengths),
    mean(sentenceLengths) === 0 ? 0 : sampleSd(sentenceLengths) / mean(sentenceLengths),
    mean(paragraphLengths),
    mean(paragraphLengths) === 0 ? 0 : sampleSd(paragraphLengths) / mean(paragraphLengths),
    ttr,
    mattr,
    types ? hapax / types : 0,
    (10000 * (counts.reduce((a, c) => a + c * c, 0) - n)) / (n * n),
    normalizedEntropy(counts),
    normalizedEntropy([...bigramCounts.values()]),
    repetitionShare(trigrams),
    repetitionShare(bigrams),
    consecutive / n,
    mean(wordLengths),
    entropyBits([...lengthCounts.values()]),
    functionWordCount / n,
    commaCount / sentenceCount,
    punctuationCount / sentenceCount,
    (100 * connectorCount) / n,
    entropyBits([...lengthBins.values()]),
    sentenceLengths.filter((l) => l > 30).length / sentenceCount,
  ];
}
