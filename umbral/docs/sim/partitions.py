"""Comparación de estrategias de partición para E1-E5.

Estrategias:
  S1 cierre_total   Union-Find sobre familia+autor+fuente+casi-duplicado (el diseño actual)
  S2 familia        cierre solo sobre familia y casi-duplicado; reparto por hash de familia
  S3 autor          cierre solo sobre autor; reparto por hash de autor

Para S2 y S3 se mide además la fuga residual: proporción de documentos de test
cuyo autor, fuente o tema también aparece en train.

Sin dependencias externas. Importar no ejecuta nada.
"""

from __future__ import annotations

import hashlib

from generator import build_corpus, new_log
from uf_core import components

__all__ = ["split_by_hash", "evaluate", "axis_holdout_size", "overlap", "STRATEGIES"]

STRATEGIES = {
    "S1_cierre_total": ["family_id", "author_id", "source_document_id", "near_dup_cluster"],
    "S2_familia": ["family_id", "near_dup_cluster"],
    "S3_autor": ["author_id"],
}


def split_by_hash(items: list[int], key_of, buckets: int = 5, test_bucket: int = 0):
    """Reparto determinista y estable: no depende del orden ni del proceso."""
    train, test = [], []
    for index, item in enumerate(items):
        raw = f"{key_of(item)}|{buckets}".encode("utf-8")
        bucket = int.from_bytes(hashlib.sha256(raw).digest()[:4], "big") % buckets
        (test if bucket == test_bucket else train).append(index)
    return train, test


def overlap(docs: list[dict], train_idx: list[int], test_idx: list[int], key: str) -> float:
    """Proporción de documentos de test cuyo valor de `key` también aparece en train."""
    train_values = {docs[i][key] for i in train_idx if docs[i].get(key)}
    if not test_idx:
        return 0.0
    shared = sum(1 for i in test_idx if docs[i].get(key) in train_values)
    return shared / len(test_idx)


def axis_holdout_size(docs: list[dict], axis: str, holdout: list[str]) -> int:
    return sum(1 for d in docs if d.get(axis) in set(holdout))


def evaluate(cfg: dict, seed: int) -> dict:
    """Ejecuta las tres estrategias sobre el mismo corpus."""
    log = new_log()
    docs = build_corpus(cfg, seed, log)
    n = len(docs)
    out: dict = {"n_docs": n, "seed": seed, "strategies": {}}

    for name, keys in STRATEGIES.items():
        groups = components(docs, keys)
        sizes = sorted((len(g) for g in groups), reverse=True)
        n_giant = sum(s for s in sizes if s > 0.05 * n)
        out["strategies"][name] = {
            "n_components": len(groups),
            "largest": sizes[0],
            "pct_in_giants": 100.0 * n_giant / n,
            "usable_pct": 100.0 * (n - n_giant) / n,
            "train_docs": None,
            "test_docs": None,
        }

    # S2: reparto por familia (todas las versiones de una familia caen del mismo lado)
    fam_groups = components(docs, ["family_id", "near_dup_cluster"])
    fam_id = [docs[g[0]]["family_id"] for g in fam_groups]
    order = list(range(len(fam_groups)))
    tr, te = split_by_hash(order, lambda i: fam_id[i])
    train_idx = [i for g in tr for i in fam_groups[g]]
    test_idx = [i for g in te for i in fam_groups[g]]
    s2 = out["strategies"]["S2_familia"]
    s2.update({
        "train_docs": len(train_idx),
        "test_docs": len(test_idx),
        "overlap_author": 100 * overlap(docs, train_idx, test_idx, "author_id"),
        "overlap_source": 100 * overlap(docs, train_idx, test_idx, "source_document_id"),
        "overlap_topic": 100 * overlap(docs, train_idx, test_idx, "topic_cluster"),
        "overlap_prompt": 100 * overlap(docs, train_idx, test_idx, "prompt_template_id"),
    })

    # S3: reparto por autor
    aut_groups = components(docs, ["author_id"])
    aut_id = [docs[g[0]]["author_id"] for g in aut_groups]
    tr3, te3 = split_by_hash(list(range(len(aut_groups))), lambda i: aut_id[i])
    train3 = [i for g in tr3 for i in aut_groups[g]]
    test3 = [i for g in te3 for i in aut_groups[g]]
    out["strategies"]["S3_autor"].update({
        "train_docs": len(train3),
        "test_docs": len(test3),
        "overlap_source": 100 * overlap(docs, train3, test3, "source_document_id"),
        "overlap_topic": 100 * overlap(docs, train3, test3, "topic_cluster"),
    })

    # Tamaño alcanzable de test por eje si se diseña el holdout en la construcción
    axes = cfg["generator"].get("axes", {})
    out["designed_holdout"] = {}
    for axis, spec in axes.items():
        pool = [f"{spec['prefix']}{i}" for i in range(int(spec["values"]))]
        holdout = pool[: int(spec.get("holdout", 2))]
        held = axis_holdout_size(docs, axis, holdout)
        out["designed_holdout"][axis] = {
            "holdout_values": holdout,
            "test_docs": held,
            "pct_of_corpus": 100.0 * held / n,
        }
    return out


def main() -> int:
    import json
    import os

    here = os.path.dirname(os.path.abspath(__file__))
    base = json.load(open(os.path.join(here, "config", "base.json"), encoding="utf-8"))

    for n_docs in (600, 1500, 4240):
        cfg = dict(base)
        cfg["n_docs"] = n_docs
        print(f"\n=== {n_docs} documentos ===")
        r = evaluate(cfg, seed=0)
        for name, s in r["strategies"].items():
            extra = ""
            if s["train_docs"] is not None:
                extra = f" train={s['train_docs']} test={s['test_docs']}"
            print(f"  {name:16s} comp={s['n_components']:5d} mayor={s['largest']:5d} "
                  f"gigantes={s['pct_in_giants']:5.1f} % útil={s['usable_pct']:5.1f} %{extra}")
        s2 = r["strategies"]["S2_familia"]
        print(f"  fuga residual S2: autor={s2['overlap_author']:.1f} % "
              f"fuente={s2['overlap_source']:.1f} % tema={s2['overlap_topic']:.1f} % "
              f"prompt={s2['overlap_prompt']:.1f} %")
        for axis, d in r["designed_holdout"].items():
            print(f"  holdout diseñado {axis:13s} ocultos={d['holdout_values']} "
                  f"test={d['test_docs']:5d} ({d['pct_of_corpus']:4.1f} %)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
