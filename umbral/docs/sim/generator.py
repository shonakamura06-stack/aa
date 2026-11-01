"""Generador de corpus sintético con topes respetados por construcción.

RECONSTRUCCIÓN. El original se perdía en /tmp y, además, rompía los topes
renombrando entidades con sufijos aleatorios (`s12__4821`), lo que creaba
autores y fuentes que no existen. Aquí el tope se aplica **antes** de asignar:
se muestrea solo entre entidades que aún tienen capacidad. Si la capacidad
total no alcanza, se aborta con un error explícito en vez de inventar entidades.

Sin dependencias externas. Importar este módulo no ejecuta nada.
"""

from __future__ import annotations

import hashlib
import random

__all__ = ["ConfigError", "rng_for", "resolve_caps", "build_corpus", "new_log"]


class ConfigError(ValueError):
    """Configuración imposible de satisfacer sin inventar entidades."""


def rng_for(seed: int, *parts: str) -> random.Random:
    """Generador independiente y estable por flujo lógico.

    Se deriva el estado con SHA-256 en lugar de confiar en el sembrado interno
    de cadenas de `random`, para que el resultado no dependa de la versión de
    Python ni de PYTHONHASHSEED.
    """
    material = "|".join([str(seed), *parts]).encode("utf-8")
    digest = hashlib.sha256(material).digest()
    return random.Random(int.from_bytes(digest[:16], "big"))


def new_log() -> dict:
    """Registro de exclusiones, rechazos y decisiones del generador."""
    return {
        "seeds": {},
        "capacity_errors": [],
        "near_dup": {"requested": 0, "applied": 0, "self_hits_rejected": 0},
        "keys": {},
        "warnings": [],
    }


def resolve_caps(caps: dict, n_families: int) -> dict:
    """Convierte topes a enteros.

    - Entero  -> tope absoluto (nº máximo de familias por entidad).
    - Flotante en (0,1) -> fracción de n_families, redondeada hacia arriba,
      mínimo 2. Se marca en el log porque el original usaba esta forma.
    """
    resolved = {}
    for key, cap in caps.items():
        if isinstance(cap, bool):
            raise ConfigError(f"tope booleano no válido para {key}")
        if isinstance(cap, int):
            if cap < 1:
                raise ConfigError(f"tope absoluto <1 para {key}")
            resolved[key] = cap
        elif isinstance(cap, float):
            if not 0.0 < cap < 1.0:
                raise ConfigError(f"tope fraccionario fuera de (0,1) para {key}: {cap}")
            resolved[key] = max(2, int(-(-cap * n_families // 1)))
        else:
            raise ConfigError(f"tope de tipo no soportado para {key}: {type(cap)}")
    return resolved


def _capped_zipf_assignment(
    rng: random.Random,
    pool_size: int,
    n_families: int,
    cap: int,
    exponent: float,
    log: dict,
    key: str,
) -> list[int]:
    """Asigna a cada familia un índice de entidad, sin superar `cap`.

    Los pesos siguen una Zipf truncada al conjunto de entidades con capacidad.
    Consecuencia documentada: el tope recorta la cola, de modo que la
    distribución final es más plana que una Zipf sin tope.
    """
    capacity = pool_size * cap
    if capacity < n_families:
        msg = (
            f"capacidad insuficiente para {key}: {pool_size} entidades x tope {cap} "
            f"= {capacity} < {n_families} familias. Ajusta pool o tope."
        )
        log["capacity_errors"].append(msg)
        raise ConfigError(msg)

    counts = [0] * pool_size
    weights = [1.0 / ((i + 1) ** exponent) for i in range(pool_size)]
    assignment: list[int] = []
    draws_with_saturation = 0

    for _ in range(n_families):
        candidates = [i for i in range(pool_size) if counts[i] < cap]
        if not candidates:
            msg = f"sin candidatos bajo el tope para {key} en la familia {len(assignment)}"
            log["capacity_errors"].append(msg)
            raise ConfigError(msg)
        if len(candidates) < pool_size:
            draws_with_saturation += 1
        total = 0.0
        for i in candidates:
            total += weights[i]
        r = rng.random() * total
        acc = 0.0
        pick = candidates[-1]
        for i in candidates:
            acc += weights[i]
            if r <= acc:
                pick = i
                break
        counts[pick] += 1
        assignment.append(pick)

    log["keys"][key] = {
        "pool_size": pool_size,
        "cap": cap,
        "capacity": capacity,
        "families_assigned": n_families,
        "entities_used": sum(1 for c in counts if c > 0),
        "entities_at_cap": sum(1 for c in counts if c == cap),
        "max_count": max(counts) if counts else 0,
        "draws_with_saturation": draws_with_saturation,
    }
    return assignment


def build_corpus(cfg: dict, seed: int, log: dict | None = None) -> list[dict]:
    """Construye el corpus sintético. Determinista para (cfg, seed)."""
    if log is None:
        log = new_log()

    gen = cfg["generator"]
    n_docs = cfg["n_docs"]
    versions = int(gen["versions_per_family"])
    if n_docs % versions:
        raise ConfigError(
            f"n_docs={n_docs} no es divisible por versions_per_family={versions}: "
            "el reparto por familias quedaría indefinido"
        )
    n_families = n_docs // versions
    exponent = float(gen.get("zipf_exponent", 1.2))
    fractions = gen["pool_fractions"]
    caps = resolve_caps(gen["caps"], n_families)

    seeds_log = {"seed": seed, "n_families": n_families, "resolved_caps": dict(caps)}
    log["seeds"][str(seed)] = seeds_log

    # 1. Asignación con topes, un flujo de azar por clave (independiente del orden).
    assignment: dict[str, list[int]] = {}
    for key in ("author_id", "source_document_id", "topic_cluster", "prompt_template_id"):
        pool_size = max(2, int(round(fractions[key] * n_families)))
        rng = rng_for(seed, "assign", key)
        assignment[key] = _capped_zipf_assignment(
            rng, pool_size, n_families, caps[key], exponent, log, key
        )

    # 2. Ejes de experimento.
    axes_cfg = gen.get("axes", {})
    axis_pools: dict[str, list[str]] = {}
    for axis, spec in axes_cfg.items():
        axis_pools[axis] = [f"{spec['prefix']}{i}" for i in range(int(spec["values"]))]

    rule = gen.get("contribution_rule", "per_family")
    if rule not in ("per_family", "per_contributor"):
        raise ConfigError(f"contribution_rule desconocida: {rule}")
    log["keys"]["contribution_rule"] = rule

    rng_axes = rng_for(seed, "axes")
    per_author: dict[int, dict[str, str]] = {}
    family_axes: list[dict[str, str]] = []
    for fam in range(n_families):
        if rule == "per_contributor":
            author_idx = assignment["author_id"][fam]
            if author_idx not in per_author:
                per_author[author_idx] = {
                    axis: rng_axes.choice(pool) for axis, pool in axis_pools.items()
                }
            family_axes.append(dict(per_author[author_idx]))
        else:
            family_axes.append(
                {axis: rng_axes.choice(pool) for axis, pool in axis_pools.items()}
            )

    # 3. Documentos: una familia comparte todas las claves de identidad salvo el id.
    mode_cycle = gen.get("mode_cycle", [])
    docs: list[dict] = []
    for fam in range(n_families):
        for v in range(versions):
            doc = {
                "doc_index": len(docs),
                "doc_id": f"d{len(docs):06d}",
                "family_id": f"fam{fam:05d}",
                "version_index": v,
                "author_id": f"a{assignment['author_id'][fam]:05d}",
                "source_document_id": f"src{assignment['source_document_id'][fam]:05d}",
                "topic_cluster": f"t{assignment['topic_cluster'][fam]:05d}",
                "prompt_instance_id": f"pi{fam:05d}",
                "prompt_template_id": f"pt{assignment['prompt_template_id'][fam]:05d}",
                "near_dup_cluster": None,
            }
            doc.update(family_axes[fam])
            if mode_cycle:
                doc["mode"] = mode_cycle[v % len(mode_cycle)]
            docs.append(doc)

    # 4. Casi duplicados: se comparte un identificador de cluster entre dos documentos.
    #    Divergencia conocida: el original enlazaba documento -> id de otro documento,
    #    lo que casi nunca fusionaba nada (los valores no coincidían). Aquí se comparte
    #    un cluster explícito, que es lo que la métrica pretendía medir.
    prob = float(gen.get("near_dup_probability", 0.0))
    if prob > 0 and len(docs) > 1:
        rng_dup = rng_for(seed, "near_dup")
        for i in range(len(docs)):
            if rng_dup.random() >= prob:
                continue
            log["near_dup"]["requested"] += 1
            j = rng_dup.randrange(len(docs))
            if j == i:
                log["near_dup"]["self_hits_rejected"] += 1
                continue
            cluster = f"nd{min(i, j):06d}"
            docs[i]["near_dup_cluster"] = cluster
            docs[j]["near_dup_cluster"] = cluster
            log["near_dup"]["applied"] += 1

    return docs
