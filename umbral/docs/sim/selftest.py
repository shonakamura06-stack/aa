"""Pruebas de la reconstrucción. Sin dependencias externas.

    python3 selftest.py -v
"""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from generator import ConfigError, build_corpus, new_log, resolve_caps  # noqa: E402
from uf_core import (  # noqa: E402
    UnionFind,
    axis_purity,
    component_stats,
    components,
    quantile,
)

BASE = json.load(open(os.path.join(HERE, "config", "base.json"), encoding="utf-8"))


def mini_config(**overrides) -> dict:
    cfg = copy.deepcopy(BASE)
    cfg["n_docs"] = overrides.pop("n_docs", 100)
    for key, value in overrides.items():
        cfg["generator"][key] = value
    return cfg


class TestUnionFind(unittest.TestCase):
    def test_union_and_find(self):
        uf = UnionFind(5)
        self.assertTrue(uf.union(0, 1))
        self.assertFalse(uf.union(1, 0))
        uf.union(3, 4)
        self.assertEqual(uf.find(0), uf.find(1))
        self.assertNotEqual(uf.find(0), uf.find(3))
        self.assertEqual(uf.merges, 2)

    def test_components_by_key(self):
        docs = [
            {"family_id": "a", "author_id": "x"},
            {"family_id": "b", "author_id": "x"},
            {"family_id": "c", "author_id": "y"},
        ]
        groups = components(docs, ["author_id"])
        self.assertEqual(sorted(len(g) for g in groups), [1, 2])

    def test_empty_values_do_not_link(self):
        docs = [{"author_id": ""}, {"author_id": None}, {"author_id": ""}]
        groups = components(docs, ["author_id"])
        self.assertEqual(len(groups), 3)


class TestQuantile(unittest.TestCase):
    def test_known_values(self):
        values = [5, 1, 3, 7, 9]
        self.assertAlmostEqual(quantile(values, 0.50), 5.0)
        self.assertAlmostEqual(quantile(values, 0.0), 1.0)
        self.assertAlmostEqual(quantile(values, 1.0), 9.0)
        self.assertAlmostEqual(quantile(values, 0.25), 3.0)  # R-7: h=(5-1)*0.25=1 -> s[1]

    def test_interpolation_strictly_between_order_statistics(self):
        values = list(range(1, 11))
        q90 = quantile(values, 0.90)
        self.assertGreater(q90, values[int(0.9 * len(values)) - 1])
        self.assertLessEqual(q90, 10.0)

    def test_empty(self):
        self.assertNotEqual(quantile([], 0.5), quantile([], 0.5))  # NaN


class TestCaps(unittest.TestCase):
    def test_absolute_caps_respected_and_no_synthetic_entities(self):
        cfg = mini_config(n_docs=300)
        log = new_log()
        docs = build_corpus(cfg, seed=0, log=log)
        caps = resolve_caps(cfg["generator"]["caps"], 300 // 5)
        # El tope es por FAMILIA, no por documento: cada familia aporta 5 versiones.
        for key, cap in caps.items():
            families_per_value: dict[str, set] = {}
            for doc in docs:
                families_per_value.setdefault(doc[key], set()).add(doc["family_id"])
            worst = max(len(v) for v in families_per_value.values())
            self.assertLessEqual(worst, cap, f"{key} supera su tope de familias")
            for value in families_per_value:
                self.assertNotIn("__", str(value))

    def test_fractional_caps(self):
        caps = resolve_caps({"author_id": 0.02, "source_document_id": 0.03}, 848)
        self.assertEqual(caps["author_id"], 17)
        self.assertEqual(caps["source_document_id"], 26)

    def test_insufficient_capacity_raises(self):
        cfg = mini_config(
            n_docs=500,
            pool_fractions={
                "author_id": 0.05,
                "source_document_id": 0.05,
                "topic_cluster": 0.05,
                "prompt_template_id": 0.05,
            },
            caps={
                "author_id": 1,
                "source_document_id": 1,
                "topic_cluster": 1,
                "prompt_template_id": 1,
            },
        )
        with self.assertRaises(ConfigError):
            build_corpus(cfg, seed=0)

    def test_indivisible_corpus_raises(self):
        cfg = mini_config(n_docs=101)
        with self.assertRaises(ConfigError):
            build_corpus(cfg, seed=0)


class TestDeterminism(unittest.TestCase):
    def test_same_seed_same_corpus(self):
        cfg = mini_config(n_docs=300)
        a = build_corpus(cfg, seed=7)
        b = build_corpus(cfg, seed=7)
        self.assertEqual(a, b)

    def test_different_seed_different_corpus(self):
        cfg = mini_config(n_docs=300)
        self.assertNotEqual(build_corpus(cfg, seed=7), build_corpus(cfg, seed=8))

    def test_cross_process_and_hashseed(self):
        out = []
        for hashseed in ("0", "1"):
            env = dict(os.environ, PYTHONHASHSEED=hashseed)
            proc = subprocess.run(
                [sys.executable, os.path.join(HERE, "run_sim.py"),
                 "--seeds", "0,1", "--no-experiments", "--format", "json"],
                capture_output=True, text=True, env=env, cwd=HERE, check=True,
            )
            out.append(json.loads(proc.stdout)["fingerprint"])
        self.assertEqual(out[0], out[1], "el fingerprint cambia con PYTHONHASHSEED")


class TestNoSideEffects(unittest.TestCase):
    def test_import_is_silent(self):
        proc = subprocess.run(
            [sys.executable, "-c", "import uf_core, generator, run_sim"],
            capture_output=True, text=True, cwd=HERE, check=True,
        )
        self.assertEqual(proc.stdout.strip(), "")
        self.assertEqual(proc.stderr.strip(), "")


class TestLogging(unittest.TestCase):
    def test_capacity_errors_reported(self):
        cfg = mini_config(n_docs=200)
        log = new_log()
        build_corpus(cfg, seed=0, log=log)
        self.assertEqual(log["capacity_errors"], [])
        self.assertEqual(log["near_dup"]["requested"], log["near_dup"]["applied"] + log["near_dup"]["self_hits_rejected"])
        self.assertGreater(log["near_dup"]["applied"], 0)

    def test_near_dup_links_both_docs(self):
        cfg = mini_config(n_docs=200, near_dup_probability=0.5)
        docs = build_corpus(cfg, seed=3)
        linked = [d for d in docs if d["near_dup_cluster"]]
        self.assertGreater(len(linked), 10)
        groups = components(docs, ["near_dup_cluster"])
        self.assertTrue(any(len(g) >= 2 for g in groups))


class TestThresholds(unittest.TestCase):
    def test_giants_monotonic_in_threshold(self):
        sizes = [1] * 90 + [40, 60]
        stats = component_stats(sizes, [0.03, 0.05, 0.10])
        g3 = stats["by_threshold"]["0.03"]["pct_in_giants"]
        g5 = stats["by_threshold"]["0.05"]["pct_in_giants"]
        g10 = stats["by_threshold"]["0.10"]["pct_in_giants"]
        self.assertGreaterEqual(g3, g5)
        self.assertGreaterEqual(g5, g10)

    def test_usable_and_giant_are_complementary(self):
        stats = component_stats([1] * 50 + [50], [0.05])
        row = stats["by_threshold"]["0.05"]
        self.assertAlmostEqual(row["pct_in_giants"] + row["pct_usable"], 100.0)


class TestPurity(unittest.TestCase):
    def test_impure_components_excluded(self):
        docs = [
            {"g": "g0"}, {"g": "g0"},
            {"g": "g1"}, {"g": "g1"},
            {"g": "g0"}, {"g": "g1"},
        ]
        groups = [[0, 1], [2, 3], [4, 5]]
        res = axis_purity(groups, docs, "g", ["g1"])
        self.assertEqual(res["train_docs"], 2)
        self.assertEqual(res["test_docs"], 2)
        self.assertEqual(res["impure_docs"], 2)


if __name__ == "__main__":
    unittest.main()
