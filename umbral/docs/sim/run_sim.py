"""Ejecutor de la simulación Union-Find.

RECONSTRUCCIÓN del script perdido. Ver README.md para supuestos y divergencias.

Uso:
    python3 run_sim.py --seeds 0,1,2 --show-log
    python3 run_sim.py --config config/base.json --scenarios config/scenarios.json
    python3 run_sim.py --json-out /tmp/sim_out.json

Importar este módulo no ejecuta nada; la ejecución está en main().
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from generator import ConfigError, build_corpus, new_log
from uf_core import axis_purity, component_stats, components, fingerprint

DEFAULT_CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "base.json")
DEFAULT_SCENARIOS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "config", "scenarios.json"
)

ROUND = 6


def load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Simulación Union-Find (reconstrucción)")
    ap.add_argument("--config", default=DEFAULT_CONFIG, help="configuración base (JSON)")
    ap.add_argument("--scenarios", default=DEFAULT_SCENARIOS, help="escenarios (JSON)")
    ap.add_argument("--seeds", default=None, help="semillas separadas por comas; sustituye a cfg")
    ap.add_argument("--n-seeds", type=int, default=None, help="usa 0..N-1")
    ap.add_argument("--thresholds", default=None, help="umbrales de gigante, p. ej. 0.03,0.05,0.10")
    ap.add_argument("--key-set", default=None, help="ejecuta solo este conjunto de claves")
    ap.add_argument("--format", choices=("table", "json"), default="table")
    ap.add_argument("--json-out", default=None, help="escribe resultados completos en JSON")
    ap.add_argument("--show-log", action="store_true", help="muestra el registro del generador")
    ap.add_argument("--no-experiments", action="store_true", help="omite el reparto por ejes")
    return ap.parse_args(argv)


def run(config: dict, scenarios: list[dict], seeds: list[int], thresholds: list[float],
        key_sets: dict[str, list[str]], run_experiments: bool) -> dict:
    """Ejecuta todos los escenarios y devuelve resultados serializables."""
    results: dict = {
        "meta": {
            "config_schema": config.get("schema_version"),
            "seeds": list(seeds),
            "thresholds": [round(t, 4) for t in thresholds],
            "reconstruction": True,
        },
        "scenarios": {},
        "generator_log": {},
    }

    for scenario in scenarios:
        name = scenario["name"]
        cfg = dict(config)
        cfg["n_docs"] = int(scenario["n_docs"])
        gen = dict(config["generator"])
        gen.update(scenario.get("generator_overrides", {}))
        cfg["generator"] = gen

        per_seed: dict[str, list] = {ks: [] for ks in key_sets}
        per_axis: dict[str, list] = {}
        seed_logs: dict[str, dict] = {}

        for seed in seeds:
            log = new_log()
            docs = build_corpus(cfg, seed, log)
            seed_logs[str(seed)] = {
                "keys": log["keys"],
                "near_dup": log["near_dup"],
                "capacity_errors": log["capacity_errors"],
            }
            for ks_name, keys in key_sets.items():
                groups = components(docs, keys)
                sizes = [len(g) for g in groups]
                stats = component_stats(sizes, thresholds)
                stats["n_groups"] = len(groups)
                per_seed[ks_name].append(stats)

            if run_experiments:
                groups = components(docs, key_sets[list(key_sets)[0]])
                for axis, spec in cfg["generator"].get("axes", {}).items():
                    holdout = spec.get("holdout_values")
                    if holdout is None:
                        from generator import rng_for

                        pool = [f"{spec['prefix']}{i}" for i in range(int(spec["values"]))]
                        k = int(spec.get("holdout", 2))
                        holdout = sorted(rng_for(seed, "holdout", axis).sample(pool, k))
                    per_axis.setdefault(axis, []).append(
                        axis_purity(groups, docs, axis, holdout)
                    )

        results["scenarios"][name] = {
            "n_docs": cfg["n_docs"],
            "n_families": cfg["n_docs"] // int(gen["versions_per_family"]),
            "by_key_set": {
                ks: {"per_seed": rows, "mean": _mean_stats(rows)} for ks, rows in per_seed.items()
            },
            "experiments": {
                axis: {"per_seed": rows, "mean": _mean_axis(rows)} for axis, rows in per_axis.items()
            },
        }
        results["generator_log"][name] = seed_logs

    results["fingerprint"] = fingerprint(_canonical(results))
    return results


def _mean_stats(rows: list[dict]) -> dict:
    if not rows:
        return {}
    out = {
        "n_components": _m(rows, lambda r: r["n_components"]),
        "median": _m(rows, lambda r: r["median"]),
        "p90": _m(rows, lambda r: r["p90"]),
        "p95": _m(rows, lambda r: r["p95"]),
        "max": _m(rows, lambda r: r["max"]),
        "by_threshold": {},
    }
    for key in rows[0]["by_threshold"]:
        out["by_threshold"][key] = {
            "pct_in_giants": _m(rows, lambda r, k=key: r["by_threshold"][k]["pct_in_giants"]),
            "pct_usable": _m(rows, lambda r, k=key: r["by_threshold"][k]["pct_usable"]),
        }
    return out


def _mean_axis(rows: list[dict]) -> dict:
    fields = ("train_docs", "test_docs", "impure_docs",
              "train_components", "test_components", "impure_components")
    return {f: _m(rows, lambda r, ff=f: r[ff]) for f in fields}


def _m(rows: list[dict], get) -> float:
    return round(sum(get(r) for r in rows) / len(rows), ROUND)


def _canonical(results: dict) -> dict:
    """Copia sin el propio fingerprint ni los registros, para hashear."""
    core = {
        "meta": results["meta"],
        "scenarios": {},
    }
    for name, sc in results["scenarios"].items():
        core["scenarios"][name] = {
            "n_docs": sc["n_docs"],
            "by_key_set": {k: v["mean"] for k, v in sc["by_key_set"].items()},
            "experiments": {k: v["mean"] for k, v in sc["experiments"].items()},
        }
    return core


def print_tables(results: dict) -> None:
    thresholds = results["meta"]["thresholds"]
    for name, sc in results["scenarios"].items():
        print(f"\n### {name} · {sc['n_docs']} documentos · {sc['n_families']} familias")
        print(f"{'conjunto de claves':26s}{'comp':>7}{'mediana':>9}{'p90':>8}"
              f"{'p95':>8}{'mayor':>8}")
        for ks, data in sc["by_key_set"].items():
            m = data["mean"]
            print(f"{ks:26s}{m['n_components']:7.1f}{m['median']:9.1f}{m['p90']:8.1f}"
                  f"{m['p95']:8.1f}{m['max']:8.1f}")
        for t in thresholds:
            key = f"{t:.2f}"
            print(f"  umbral gigante {t*100:4.0f} %")
            print(f"  {'conjunto':26s}{'% en gigantes':>16}{'% utilizable':>15}")
            for ks, data in sc["by_key_set"].items():
                bt = data["mean"]["by_threshold"][key]
                print(f"  {ks:26s}{bt['pct_in_giants']:16.1f}{bt['pct_usable']:15.1f}")
        if sc["experiments"]:
            print(f"  {'eje':10s}{'ocultos':22s}{'train':>8}{'test':>8}{'impuras':>9}")
            for axis, data in sc["experiments"].items():
                m = data["mean"]
                hold = data["per_seed"][0]["holdout_values"]
                print(f"  {axis:10s}{','.join(hold):22s}{m['train_docs']:8.0f}"
                      f"{m['test_docs']:8.0f}{m['impure_docs']:9.0f}")


def print_log(results: dict) -> None:
    print("\n### Registro del generador")
    for name, seeds in results["generator_log"].items():
        first = seeds[sorted(seeds)[0]]
        print(f"\n{name} (semilla {sorted(seeds)[0]})")
        for key, info in first["keys"].items():
            if isinstance(info, dict):
                print(f"  {key:22s} pool={info['pool_size']:<6d} tope={info['cap']:<4d} "
                      f"usadas={info['entities_used']:<6d} en_tope={info['entities_at_cap']:<6d} "
                      f"max={info['max_count']}")
            else:
                print(f"  {key:22s} {info}")
        nd = first["near_dup"]
        print(f"  {'near_dup':22s} solicitados={nd['requested']} aplicados={nd['applied']} "
              f"autorreferencias={nd['self_hits_rejected']}")
        if first["capacity_errors"]:
            for err in first["capacity_errors"]:
                print(f"  ERROR DE CAPACIDAD: {err}")
        else:
            print("  errores de capacidad: 0")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = load_json(args.config)
    scenarios = load_json(args.scenarios)
    if isinstance(scenarios, dict):
        scenarios = scenarios["scenarios"]

    if args.seeds:
        seeds = [int(s) for s in args.seeds.split(",") if s.strip() != ""]
    elif args.n_seeds is not None:
        seeds = list(range(args.n_seeds))
    else:
        seeds = list(config.get("seeds", [0, 1, 2]))

    thresholds = (
        [float(t) for t in args.thresholds.split(",")]
        if args.thresholds
        else [float(t) for t in config.get("giant_thresholds", [0.03, 0.05, 0.10])]
    )

    key_sets = config["identity_key_sets"]
    if args.key_set:
        if args.key_set not in key_sets:
            print(f"conjunto de claves desconocido: {args.key_set}", file=sys.stderr)
            return 2
        key_sets = {args.key_set: key_sets[args.key_set]}

    try:
        results = run(config, scenarios, seeds, thresholds, key_sets,
                      run_experiments=not args.no_experiments)
    except ConfigError as exc:
        print(f"configuración inválida: {exc}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(json.dumps(results, indent=2, sort_keys=True, ensure_ascii=False))
    else:
        print_tables(results)
        if args.show_log:
            print_log(results)
        print(f"\nfingerprint: {results['fingerprint']}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(results, fh, indent=2, sort_keys=True, ensure_ascii=False)
        if args.format == "table":
            print(f"resultados escritos en {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
