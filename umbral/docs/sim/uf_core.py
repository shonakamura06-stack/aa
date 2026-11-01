"""Núcleo de la simulación: Union-Find, componentes y estadísticos.

RECONSTRUCCIÓN, no el código original. El original vivía en /tmp/sim y se perdió
en un reinicio del entorno. Ver README.md, sección "Qué es reconstruido".

Sin dependencias externas. Importar este módulo no ejecuta nada.
"""

from __future__ import annotations

import hashlib
import math

__all__ = [
    "UnionFind",
    "components",
    "quantile",
    "component_stats",
    "axis_purity",
    "fingerprint",
]


class UnionFind:
    """Union-Find con compresión de caminos (path halving) y unión por tamaño."""

    __slots__ = ("parent", "size", "merges")

    def __init__(self, n: int) -> None:
        if n < 0:
            raise ValueError("n no puede ser negativo")
        self.parent = list(range(n))
        self.size = [1] * n
        self.merges = 0

    def find(self, x: int) -> int:
        p = self.parent
        while p[x] != x:
            p[x] = p[p[x]]
            x = p[x]
        return x

    def union(self, a: int, b: int) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        self.merges += 1
        return True


def components(docs: list[dict], keys: list[str]) -> list[list[int]]:
    """Componentes conexas por igualdad de valores en las claves dadas.

    Un documento con valor vacío/None en una clave no se une por esa clave.
    Devuelve grupos de índices ordenados por tamaño descendente y, a igualdad
    de tamaño, por índice mínimo ascendente (orden total ⇒ determinista).
    """
    uf = UnionFind(len(docs))
    for key in keys:
        first: dict[object, int] = {}
        for i, doc in enumerate(docs):
            value = doc.get(key)
            if value is None or value == "":
                continue
            j = first.get(value)
            if j is None:
                first[value] = i
            else:
                uf.union(j, i)
    groups: dict[int, list[int]] = {}
    for i in range(len(docs)):
        groups.setdefault(uf.find(i), []).append(i)
    return sorted(groups.values(), key=lambda g: (-len(g), g[0]))


def quantile(values: list[float], p: float) -> float:
    """Cuantil con interpolación lineal (método R-7, el de numpy por defecto).

    Divergencia conocida: el script perdido usaba el estadístico de orden
    int(p*n) sin interpolar, lo que sesgaba p90/p95 a la baja. Ver README.
    """
    if not values:
        return float("nan")
    if not 0.0 <= p <= 1.0:
        raise ValueError("p debe estar en [0, 1]")
    s = sorted(values)
    h = (len(s) - 1) * p
    lo = math.floor(h)
    hi = math.ceil(h)
    if lo == hi:
        return float(s[lo])
    return s[lo] + (s[hi] - s[lo]) * (h - lo)


def component_stats(sizes: list[int], thresholds: list[float]) -> dict:
    """Estadísticos de la distribución de tamaños de componente.

    Para cada umbral t se calcula qué fracción del corpus queda dentro de
    componentes mayores que t*N (gigantes) y qué fracción queda fuera.

    Aviso de interpretación: `pct_giant` y `pct_usable` son complementarios
    exactos (suman 100). No son dos evidencias independientes.
    """
    n = sum(sizes)
    if n == 0:
        raise ValueError("corpus vacío")
    out: dict = {
        "n_docs": n,
        "n_components": len(sizes),
        "median": quantile(sizes, 0.50),
        "p90": quantile(sizes, 0.90),
        "p95": quantile(sizes, 0.95),
        "max": max(sizes),
        "by_threshold": {},
    }
    for t in thresholds:
        cut = t * n
        giant = sum(s for s in sizes if s > cut)
        out["by_threshold"][f"{t:.2f}"] = {
            "threshold_docs": cut,
            "docs_in_giants": giant,
            "pct_in_giants": 100.0 * giant / n,
            "pct_usable": 100.0 * (n - giant) / n,
        }
    return out


def axis_purity(
    groups: list[list[int]], docs: list[dict], axis: str, holdout_values: list[str]
) -> dict:
    """Reparto train/test dejando fuera de train los valores de `axis` indicados.

    Una componente es *pura* si todos sus documentos comparten el mismo valor
    del eje. Las componentes impuras no se usan en el experimento y se
    contabilizan aparte (`impure_docs`), porque mezclarían train y test.
    """
    holdout = set(holdout_values)
    train = test = impure = 0
    n_train_comp = n_test_comp = n_impure_comp = 0
    for group in groups:
        values = {docs[i].get(axis) for i in group}
        values.discard(None)
        if len(values) != 1:
            impure += len(group)
            n_impure_comp += 1
            continue
        (only,) = values
        if only in holdout:
            test += len(group)
            n_test_comp += 1
        else:
            train += len(group)
            n_train_comp += 1
    return {
        "axis": axis,
        "holdout_values": sorted(holdout),
        "train_docs": train,
        "test_docs": test,
        "impure_docs": impure,
        "train_components": n_train_comp,
        "test_components": n_test_comp,
        "impure_components": n_impure_comp,
    }


def fingerprint(payload: object) -> str:
    """SHA-256 del JSON canónico. Sirve para comparar ejecuciones."""
    import json

    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
