#!/usr/bin/env python3
"""
Pipeline de entrenamiento del clasificador estilométrico de Umbral.

Reglas de diseño:
  * No se entrena sin dataset etiquetado con procedencia, licencia y separación
    de grupos (autor / fuente / modelo generador).
  * Nunca se mezclan textos casi duplicados entre entrenamiento y prueba.
  * Se informan precision, recall, specificity, F1, AUROC, AUPRC, Brier y
    calibración, con intervalos de confianza bootstrap.
  * El artefacto exportado solo se genera si hay evidencia suficiente
    (>= 200 documentos, >= 2 grupos, test >= 15 %) y si existe un manifiesto
    del dataset con licencia y procedencia declaradas.
  * La selección de modelo se hace por validación cruzada SOBRE ENTRENAMIENTO,
    nunca mirando el conjunto de prueba (evita fuga por selección).

Uso:
    python3 ml/train.py --data ml/data/dataset.jsonl --out ml/artifacts
    python3 ml/train.py --data ... --export   # escribe model.json para Umbral

Formato JSONL, una línea por documento:
    {"text": "...", "label": "human"|"ai"|0|1, "author": "...", "source": "...",
     "generator": "...", "language": "es", "genre": "académico"}
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from features import FEATURE_NAMES, compute_feature_vector  # noqa: E402

MIN_DOCUMENTS = 200
MIN_GROUPS = 2
NEAR_DUPLICATE_THRESHOLD = 0.9


@dataclass
class Document:
    text: str
    label: int
    author: str
    source: str
    generator: str
    language: str
    genre: str
    index: int = 0


@dataclass
class Report:
    warnings: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


def normalize_label(raw: Any) -> int:
    if isinstance(raw, (int, float)) and int(raw) in (0, 1):
        return int(raw)
    value = str(raw).strip().lower()
    if value in {"human", "humano", "h", "0", "real"}:
        return 0
    if value in {"ai", "machine", "maquina", "máquina", "generated", "1", "synthetic"}:
        return 1
    raise ValueError(f"Etiqueta no reconocida: {raw!r}")


def load_dataset(path: Path, report: Report) -> List[Document]:
    documents: List[Document] = []
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                report.warnings.append(f"Línea {line_no} ignorada: JSON inválido ({error}).")
                continue
            text = (row.get("text") or "").strip()
            if len(text.split()) < 50:
                report.warnings.append(f"Línea {line_no} ignorada: menos de 50 palabras.")
                continue
            try:
                label = normalize_label(row.get("label"))
            except ValueError as error:
                report.warnings.append(f"Línea {line_no} ignorada: {error}")
                continue
            documents.append(
                Document(
                    text=text,
                    label=label,
                    author=str(row.get("author") or ""),
                    source=str(row.get("source") or ""),
                    generator=str(row.get("generator") or ""),
                    language=str(row.get("language") or "unknown"),
                    genre=str(row.get("genre") or "unknown"),
                )
            )
    for i, doc in enumerate(documents):
        doc.index = i
    return documents


def shingles(text: str, size: int = 8) -> set[str]:
    words = re.findall(r"[^\W_]+", text.lower(), re.UNICODE)
    return {" ".join(words[i : i + size]) for i in range(max(0, len(words) - size + 1))}


def deduplicate(documents: List[Document], report: Report) -> List[Document]:
    seen_hashes: Dict[str, int] = {}
    kept: List[Document] = []
    shingle_sets: List[set[str]] = []
    for doc in documents:
        digest = hashlib.sha256(doc.text.encode("utf-8")).hexdigest()
        if digest in seen_hashes:
            report.warnings.append(f"Duplicado exacto eliminado (índice {doc.index}).")
            continue
        current = shingles(doc.text)
        duplicate = False
        if current:
            for existing in shingle_sets:
                if not existing:
                    continue
                union = len(current | existing)
                if union and len(current & existing) / union >= NEAR_DUPLICATE_THRESHOLD:
                    duplicate = True
                    break
        if duplicate:
            report.warnings.append(f"Casi duplicado eliminado (índice {doc.index}).")
            continue
        seen_hashes[digest] = doc.index
        shingle_sets.append(current)
        kept.append(doc)
    return kept


def choose_groups(documents: List[Document], report: Report) -> List[str]:
    for field_name in ("author", "source", "generator"):
        values = [getattr(doc, field_name) for doc in documents]
        distinct = {v for v in values if v}
        if len(distinct) >= MIN_GROUPS and all(values):
            report.notes.append(f"Separación por grupos «{field_name}» ({len(distinct)} grupos).")
            return values
    report.warnings.append(
        "No hay campo de grupo (author/source/generator) completo en todos los documentos: "
        "la separación es estratificada por etiqueta, con riesgo de fuga por estilo de fuente."
    )
    return [""] * len(documents)


def bootstrap_ci(y_true: np.ndarray, scores: np.ndarray, metric, seed: int = 7, rounds: int = 500) -> Tuple[float, float]:
    rng = np.random.default_rng(seed)
    values = []
    n = len(y_true)
    for _ in range(rounds):
        idx = rng.integers(0, n, n)
        if len(set(y_true[idx])) < 2:
            continue
        try:
            values.append(metric(y_true[idx], scores[idx]))
        except ValueError:
            continue
    if not values:
        return (float("nan"), float("nan"))
    return (float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5)))


def compute_metrics(y_true: np.ndarray, probs: np.ndarray) -> Dict[str, Any]:
    from sklearn.metrics import (
        average_precision_score,
        brier_score_loss,
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )

    pred = (probs >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    specificity = tn / (tn + fp) if (tn + fp) else float("nan")
    metrics = {
        "n": int(len(y_true)),
        "positive_rate": float(np.mean(y_true)),
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "specificity": float(specificity),
        "f1": float(f1_score(y_true, pred, zero_division=0)),
        "false_positive_rate": float(fp / (fp + tn)) if (fp + tn) else float("nan"),
        "auroc": float(roc_auc_score(y_true, probs)),
        "auprc": float(average_precision_score(y_true, probs)),
        "brier": float(brier_score_loss(y_true, probs)),
        "tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn),
    }
    metrics["auroc_ci95"] = list(bootstrap_ci(y_true, probs, roc_auc_score))
    metrics["f1_ci95"] = list(bootstrap_ci(y_true, probs, lambda y, p: f1_score(y, (p >= 0.5).astype(int), zero_division=0)))
    # Curva de calibración en 5 intervalos
    bins = np.linspace(0, 1, 6)
    calibration = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        mask = (probs >= lo) & (probs < hi if hi < 1 else probs <= hi)
        if mask.sum() == 0:
            continue
        calibration.append({
            "bin": f"{lo:.1f}-{hi:.1f}",
            "n": int(mask.sum()),
            "mean_predicted": float(probs[mask].mean()),
            "observed_rate": float(y_true[mask].mean()),
        })
    metrics["calibration"] = calibration
    return metrics


def group_breakdown(docs: List[Document], y_true: np.ndarray, probs: np.ndarray, field_name: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    values = np.array([getattr(doc, field_name) for doc in docs])
    pred = (probs >= 0.5).astype(int)
    for value in sorted(set(values)):
        mask = values == value
        if mask.sum() < 20:
            continue
        y = y_true[mask]
        p = pred[mask]
        out[str(value)] = {
            "n": int(mask.sum()),
            "accuracy": float((p == y).mean()),
            "positive_rate": float(y.mean()),
            "flag_rate": float(p.mean()),
        }
    return out


def load_manifest(data_path: Path) -> Dict[str, Any] | None:
    """Manifiesto obligatorio para exportar: licencia y procedencia del corpus."""
    for candidate in (
        data_path.with_suffix(data_path.suffix + ".manifest.json"),
        data_path.parent / "dataset.json",
    ):
        if candidate.exists():
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                return None
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Entrenamiento del clasificador estilométrico de Umbral")
    parser.add_argument("--data", required=True, help="JSONL con documentos etiquetados")
    parser.add_argument("--out", default="ml/artifacts", help="Directorio de salida")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--export", action="store_true", help="Exportar model.json para inferencia en Umbral")
    parser.add_argument(
        "--license",
        default=None,
        help="Licencia del corpus si no hay manifiesto (obligatoria para exportar)",
    )
    args = parser.parse_args()

    from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import GroupKFold, GroupShuffleSplit, StratifiedKFold, cross_val_score, train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    report = Report()
    path = Path(args.data)
    if not path.exists():
        print(f"ERROR: no existe el dataset {path}. Consulta ml/README.md para las fuentes candidatas.")
        return 2

    documents = load_dataset(path, report)
    print(f"Documentos leídos: {len(documents)}")
    documents = deduplicate(documents, report)
    print(f"Documentos tras deduplicación: {len(documents)}")

    labels = [d.label for d in documents]
    if len(set(labels)) < 2:
        print("ERROR: el dataset necesita ejemplos humanos y generados.")
        return 2

    groups = choose_groups(documents, report)
    n_groups = len({g for g in groups if g})
    if n_groups >= MIN_GROUPS:
        splitter = GroupShuffleSplit(n_splits=1, test_size=args.test_size, random_state=args.seed)
        train_idx, test_idx = next(splitter.split(documents, labels, groups))
    else:
        train_idx, test_idx = train_test_split(
            list(range(len(documents))), test_size=args.test_size, random_state=args.seed, stratify=labels
        )

    train_docs = [documents[i] for i in train_idx]
    test_docs = [documents[i] for i in test_idx]
    train_texts = {hashlib.sha256(d.text.encode()).hexdigest() for d in train_docs}
    leaked = sum(1 for d in test_docs if hashlib.sha256(d.text.encode()).hexdigest() in train_texts)
    if leaked:
        print(f"ERROR: {leaked} documentos idénticos en entrenamiento y prueba. Abortado.")
        return 3

    print(f"Entrenamiento: {len(train_docs)} · Prueba: {len(test_docs)} · grupos: {n_groups or 'n/d'}")

    X_train = np.array([compute_feature_vector(d.text) for d in train_docs])
    X_test = np.array([compute_feature_vector(d.text) for d in test_docs])
    y_train = np.array([d.label for d in train_docs])
    y_test = np.array([d.label for d in test_docs])

    models = {
        "logistic-regression": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=3000, class_weight="balanced", random_state=args.seed)),
        ]),
        "random-forest": RandomForestClassifier(n_estimators=400, min_samples_leaf=3, class_weight="balanced", random_state=args.seed, n_jobs=-1),
        "hist-gradient-boosting": HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, random_state=args.seed),
    }

    train_groups = np.array([groups[i] for i in train_idx])
    if n_groups >= MIN_GROUPS:
        n_splits = min(5, n_groups)
        cv = GroupKFold(n_splits=n_splits)
        cv_groups = train_groups
    else:
        n_splits = 5
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=args.seed)
        cv_groups = None

    results: Dict[str, Any] = {}
    for name, model in models.items():
        # 1) Selección por CV sobre entrenamiento. Mirar el test para elegir el
        #    modelo y volver a reportar ese mismo test infla las métricas.
        try:
            cv_scores = cross_val_score(
                model, X_train, y_train, groups=cv_groups, cv=cv, scoring="roc_auc", n_jobs=-1
            )
        except ValueError as error:
            report.warnings.append(f"CV no calculable para {name}: {error}")
            cv_scores = np.array([float("nan")])
        cv_mean = float(np.nanmean(cv_scores))
        # 2) Evaluación única del modelo reentrenado con todo el entrenamiento.
        model.fit(X_train, y_train)
        probs = model.predict_proba(X_test)[:, 1]
        results[name] = compute_metrics(y_test, probs)
        results[name]["cv_auroc_mean"] = cv_mean
        results[name]["cv_auroc_folds"] = [float(v) for v in cv_scores]
        results[name]["auroc_test"] = float(roc_auc_score(y_test, probs))
        print(
            f"  {name}: CV AUROC={cv_mean:.3f} · test AUROC={results[name]['auroc']:.3f} "
            f"F1={results[name]['f1']:.3f} Brier={results[name]['brier']:.3f}"
        )

    best_name = max(results, key=lambda k: results[k]["cv_auroc_mean"])
    best = models[best_name]
    print(f"Modelo elegido por CV (no por test): {best_name}")
    breakdown = {
        "language": group_breakdown(test_docs, y_test, best.predict_proba(X_test)[:, 1], "language"),
        "genre": group_breakdown(test_docs, y_test, best.predict_proba(X_test)[:, 1], "genre"),
    }

    artifact_dir = Path(args.out)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    sufficient = (
        len(documents) >= MIN_DOCUMENTS
        and n_groups >= MIN_GROUPS
        and len(test_docs) >= 0.15 * len(documents)
    )
    if not sufficient:
        report.warnings.append(
            f"Evidencia insuficiente para exportar: {len(documents)} documentos (mínimo {MIN_DOCUMENTS}), "
            f"{n_groups} grupos (mínimo {MIN_GROUPS}). El artefacto NO se genera."
        )

    manifest = load_manifest(path)
    license_value = args.license or (manifest or {}).get("license")
    if args.export and not license_value:
        report.warnings.append(
            "No se exporta: falta la licencia del corpus. Añade dataset.json junto al JSONL con "
            "{\"license\": ..., \"source\": ..., \"collectedAt\": ...} o usa --license."
        )
    summary = {
        "trainedAt": stamp,
        "selectionStrategy": "GroupKFold/StratifiedKFold sobre entrenamiento; test evaluado una vez",
        "dataset": str(path),
        "documentCount": len(documents),
        "trainSize": len(train_docs),
        "testSize": len(test_docs),
        "groups": n_groups,
        "split": "GroupShuffleSplit" if n_groups >= MIN_GROUPS else "stratified",
        "features": FEATURE_NAMES,
        "results": results,
        "bestModel": best_name,
        "breakdown": breakdown,
        "warnings": report.warnings,
        "notes": report.notes,
        "sufficientEvidence": sufficient,
        "datasetManifest": manifest,
        "datasetLicense": license_value,
    }
    (artifact_dir / f"report-{stamp}.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if args.export:
        if not sufficient:
            print("No se exporta el modelo: evidencia insuficiente (ver advertencias).")
        elif not license_value:
            print("No se exporta el modelo: falta la licencia declarada del corpus.")
        elif best_name != "logistic-regression":
            print("No se exporta: el mejor modelo no es una regresión logística; Umbral solo implementa ese formato.")
        else:
            scaler = best.named_steps["scaler"]
            clf = best.named_steps["clf"]
            artifact = {
                "schemaVersion": 1,
                "modelType": "logistic-regression",
                "featureNames": FEATURE_NAMES,
                "classes": ["human", "ai"],
                "coefficients": [float(c) for c in clf.coef_[0]],
                "intercept": float(clf.intercept_[0]),
                "scaler": {
                    "mean": [float(m) for m in scaler.mean_],
                    "scale": [float(s) for s in scaler.scale_],
                },
                "metadata": {
                    "version": f"umbral-ml-{stamp}",
                    "trainedAt": stamp,
                    "dataset": str(path),
                    "datasetLicense": license_value,
                    "languages": sorted({d.language for d in documents}),
                    "splitStrategy": summary["split"],
                    "metrics": {
                        k: results[best_name][k]
                        for k in ("precision", "recall", "specificity", "f1", "auroc", "auprc", "brier", "false_positive_rate")
                    },
                    "calibration": "regresión logística sin recalibración adicional; revisar curva de calibración del informe",
                    "knownLimitations": [
                        "Depende del corpus: no extrapolar a otros géneros o idiomas sin evaluación propia.",
                        "Las características son de superficie y pueden reflejar artefactos de la fuente.",
                    ],
                },
            }
            (artifact_dir / "model.json").write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Modelo exportado en {artifact_dir / 'model.json'}")

    print(f"Informe: {artifact_dir / f'report-{stamp}.json'}")
    for warning in report.warnings:
        print(f"ADVERTENCIA: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
