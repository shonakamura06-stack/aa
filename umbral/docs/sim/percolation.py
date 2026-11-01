"""Estudio de percolación para el diseño de particiones de Umbral.

Pregunta: ¿bajo qué condiciones el cierre transitivo sobre claves compartidas
produce componentes de tamaño lineal en el corpus?

Modelo: el grafo es la unión de K particiones independientes. Cada clave k
reparte las familias en bloques de tamaño c_k y cada bloque se cierra en clique.
Es exactamente lo que hace el Union-Find del generador cuando las claves son
independientes entre sí.

RECONSTRUCCIÓN/EXTENSIÓN de la etapa 2. Sin dependencias externas.
Importar no ejecuta nada.
"""

from __future__ import annotations

import random

__all__ = ["build_groups", "largest_component_fraction", "phase_point", "criteria"]


def build_groups(n_fam: int, caps: list[int], rng: random.Random) -> list[list[int]]:
    """Reparte las familias en bloques de tamaño c_k para cada clave k."""
    groups: list[list[int]] = []
    for cap in caps:
        fams = list(range(n_fam))
        rng.shuffle(fams)
        for i in range(0, n_fam, cap):
            block = fams[i:i + cap]
            if len(block) > 1:
                groups.append(block)
    return groups


def largest_component_fraction(n_fam: int, groups: list[list[int]]) -> tuple[float, float]:
    """Devuelve (fracción en la mayor componente, fracción fuera de gigantes al 5 %)."""
    parent = list(range(n_fam))
    size = [1] * n_fam

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for block in groups:
        root = find(block[0])
        for x in block[1:]:
            rx = find(x)
            if rx != root:
                if size[root] < size[rx]:
                    root, rx = rx, root
                parent[rx] = root
                size[root] += size[rx]

    comp: dict[int, int] = {}
    for i in range(n_fam):
        r = find(i)
        comp[r] = comp.get(r, 0) + 1
    largest = max(comp.values()) / n_fam
    cut = 0.05 * n_fam
    in_giant = sum(s for s in comp.values() if s > cut)
    return largest, 1.0 - in_giant / n_fam


def phase_point(caps: list[int], n_fam: int = 2000, seeds: int = 20) -> dict:
    rng = random.Random(20261031)
    largest = []
    usable = []
    for _ in range(seeds):
        groups = build_groups(n_fam, caps, rng)
        big, us = largest_component_fraction(n_fam, groups)
        largest.append(big)
        usable.append(us)
    return {
        "caps": list(caps),
        "K": len(caps),
        "mean_largest": sum(largest) / len(largest),
        "mean_usable": sum(usable) / len(usable),
        "percolates": sum(largest) / len(largest) > 0.05,
    }


def criteria(caps: list[int]) -> dict:
    """Tres criterios candidatos. Ninguno se asume correcto: se contrastan."""
    s_ratio = sum((c - 1) / c for c in caps)
    s_degree = sum(c - 1 for c in caps)
    return {
        "suma_cociente": s_ratio,
        "pred_cociente": s_ratio > 1,
        "suma_grados": s_degree,
        "pred_grado": s_degree > 1,
        "pred_multiclave": len([c for c in caps if c >= 2]) >= 2,
    }


def run(n_fam: int = 2000, seeds: int = 20) -> list[dict]:
    grid = [
        [2], [3], [4], [6], [8],
        [2, 2], [3, 3], [4, 4], [6, 6], [2, 6], [2, 3],
        [2, 2, 2], [3, 3, 3], [1, 2, 1, 2],
        [2, 2, 2, 2], [3, 3, 3, 3], [3, 6, 6, 8], [1, 1, 1, 1],
    ]
    rows = []
    for caps in grid:
        point = phase_point(caps, n_fam=n_fam, seeds=seeds)
        point.update(criteria(caps))
        rows.append(point)
    return rows


def main() -> int:
    seeds = 20
    rows = run(seeds=seeds)

    print(f"Modelo: unión de K particiones independientes · n={2000} familias · "
          f"{seeds} semillas\n")
    header = (f"{'topes':<16}{'K':>2}{'mayor':>9}{'utilizable':>12}"
              f"{'Σ(c-1)/c':>10}{'Σ(c-1)':>8}{'percola':>9}"
              f"{'pred.A':>7}{'pred.B':>7}{'pred.C':>7}")
    print(header)
    print("-" * len(header))
    hits = {"cociente": 0, "grado": 0, "multiclave": 0}
    for r in rows:
        caps = "/".join(str(c) for c in r["caps"])
        print(f"{caps:<16}{r['K']:>2}{r['mean_largest']:>9.3f}{r['mean_usable']:>12.3f}"
              f"{r['suma_cociente']:>10.2f}{r['suma_grados']:>8.0f}"
              f"{str(r['percolates']):>9}"
              f"{str(r['pred_cociente']):>7}{str(r['pred_grado']):>7}"
              f"{str(r['pred_multiclave']):>7}")
        hits["cociente"] += r["pred_cociente"] == r["percolates"]
        hits["grado"] += r["pred_grado"] == r["percolates"]
        hits["multiclave"] += r["pred_multiclave"] == r["percolates"]

    total = len(rows)
    print(f"\nAciertos sobre {total} configuraciones:")
    for name, value in hits.items():
        print(f"  {name:<12} {value:>2}/{total}  ({100*value/total:.0f} %)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
