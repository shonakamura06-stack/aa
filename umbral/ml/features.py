"""
Vector de 22 características del clasificador estilométrico.

Debe coincidir numéricamente con src/lib/ml/features.ts. La definición portable
común es:

    token   = /[\\p{L}\\p{M}\\p{N}]+/  en minúsculas
    oración = split(/(?<=[.!?…])\\s+/)
    párrafo = split(/\\n\\s*\\n+/)

`python3 ml/features.py --stdin` imprime el vector JSON para comparar con
TypeScript (tests/feature-parity.test.ts).
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Iterable, List

LEXICON = json.loads((Path(__file__).parent / "feature_lexicon.json").read_text(encoding="utf-8"))
FUNCTION_WORDS = {w.lower() for w in LEXICON["functionWords"]}
CONNECTORS = [c.lower() for c in LEXICON["connectors"]]

TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")
PARAGRAPH_SPLIT = re.compile(r"\n\s*\n+")
HAS_LETTER = re.compile(r"[^\W\d_]", re.UNICODE)
PUNCT_RE = re.compile(r"[.,;:!?¡¿…]")

FEATURE_NAMES = [
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
]


def tokens(text: str) -> List[str]:
    return TOKEN_RE.findall(text.lower())


def sentences(text: str) -> List[str]:
    parts = [p.strip() for p in SENTENCE_SPLIT.split(text.strip())]
    return [p for p in parts if p and HAS_LETTER.search(p)]


def paragraphs(text: str) -> List[str]:
    parts = [p.strip() for p in PARAGRAPH_SPLIT.split(text.strip())]
    return [p for p in parts if p and HAS_LETTER.search(p)]


def mean(values: Iterable[float]) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def sample_sd(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / (len(values) - 1))


def entropy_bits(counts: Iterable[int]) -> float:
    counts = [c for c in counts]
    total = sum(counts)
    if total == 0:
        return 0.0
    h = 0.0
    for c in counts:
        if c <= 0:
            continue
        p = c / total
        h -= p * math.log2(p)
    return h


def normalized_entropy(counts: Iterable[int]) -> float:
    counts = [c for c in counts]
    types = sum(1 for c in counts if c > 0)
    if types <= 1:
        return 0.0
    return entropy_bits(counts) / math.log2(types)


def repetition_share(seq: List[str]) -> float:
    if not seq:
        return 0.0
    counts = {}
    for s in seq:
        counts[s] = counts.get(s, 0) + 1
    repeated = sum(c for c in counts.values() if c > 1)
    return repeated / len(seq)


def compute_feature_vector(text: str) -> List[float]:
    toks = tokens(text)
    n = max(1, len(toks))
    sents = sentences(text)
    paras = paragraphs(text)

    sentence_lengths = [len(tokens(s)) for s in sents]
    sentence_lengths = [l for l in sentence_lengths if l > 0]
    paragraph_lengths = [len(tokens(p)) for p in paras]
    paragraph_lengths = [l for l in paragraph_lengths if l > 0]

    unigram: dict[str, int] = {}
    for t in toks:
        unigram[t] = unigram.get(t, 0) + 1
    counts = list(unigram.values())
    types = len(counts)

    ttr = types / n
    window = 50
    mattr = ttr
    if len(toks) > window:
        acc = 0.0
        c = 0
        for i in range(0, len(toks) - window + 1):
            acc += len(set(toks[i : i + window])) / window
            c += 1
        mattr = acc / c if c else ttr
    hapax = sum(1 for c in counts if c == 1)

    bigrams = [f"{toks[i]} {toks[i + 1]}" for i in range(len(toks) - 1)]
    trigrams = [f"{toks[i]} {toks[i + 1]} {toks[i + 2]}" for i in range(len(toks) - 2)]
    bigram_counts: dict[str, int] = {}
    for b in bigrams:
        bigram_counts[b] = bigram_counts.get(b, 0) + 1

    consecutive = sum(1 for i in range(1, len(toks)) if toks[i] == toks[i - 1])

    word_lengths = [len(t) for t in toks]
    length_counts: dict[int, int] = {}
    for l in word_lengths:
        length_counts[l] = length_counts.get(l, 0) + 1

    function_word_count = sum(1 for t in toks if t in FUNCTION_WORDS)
    punctuation_count = len(PUNCT_RE.findall(text))
    comma_count = text.count(",")
    lower = text.lower()
    connector_count = 0
    for connector in CONNECTORS:
        pattern = re.compile(r"(?<![\w])" + re.escape(connector) + r"(?![\w])", re.UNICODE)
        connector_count += len(pattern.findall(lower))

    sentence_count = max(1, len(sents))
    length_bins: dict[int, int] = {}
    for l in sentence_lengths:
        key = l // 5
        length_bins[key] = length_bins.get(key, 0) + 1

    return [
        mean(sentence_lengths),
        sample_sd(sentence_lengths),
        (sample_sd(sentence_lengths) / mean(sentence_lengths)) if mean(sentence_lengths) else 0.0,
        mean(paragraph_lengths),
        (sample_sd(paragraph_lengths) / mean(paragraph_lengths)) if mean(paragraph_lengths) else 0.0,
        ttr,
        mattr,
        (hapax / types) if types else 0.0,
        (10000 * (sum(c * c for c in counts) - n)) / (n * n),
        normalized_entropy(counts),
        normalized_entropy(bigram_counts.values()),
        repetition_share(trigrams),
        repetition_share(bigrams),
        consecutive / n,
        mean(word_lengths),
        entropy_bits(length_counts.values()),
        function_word_count / n,
        comma_count / sentence_count,
        punctuation_count / sentence_count,
        (100 * connector_count) / n,
        entropy_bits(length_bins.values()),
        (sum(1 for l in sentence_lengths if l > 30) / sentence_count),
    ]


if __name__ == "__main__":
    if "--stdin" in sys.argv:
        payload = json.load(sys.stdin)
        texts = payload if isinstance(payload, list) else [payload]
        print(json.dumps([compute_feature_vector(t) for t in texts], ensure_ascii=False))
    else:
        print(json.dumps(FEATURE_NAMES, ensure_ascii=False, indent=2))
