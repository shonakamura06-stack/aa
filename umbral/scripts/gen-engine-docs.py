#!/usr/bin/env python3
"""Genera docs/ENGINES.md a partir del registro real de motores.

Requiere el servidor de Umbral en ejecución (npm run dev) y documenta
exactamente lo que declara /api/engines, sin duplicar cifras a mano.
"""
import json, sys, urllib.request
from datetime import datetime, timezone

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
data = json.load(urllib.request.urlopen(f"{BASE}/api/engines", timeout=30))

KIND = {
    "statistical": "Estadístico",
    "linguistic": "Lingüístico",
    "trained-classifier": "Clasificador entrenado",
    "commercial": "Detector comercial",
    "academic": "Método académico",
}
FAMILY = {
    "information-theoretic": "Información y previsibilidad",
    "repetition-structure": "Repetición y estructura",
    "stylometric": "Estilometría",
    "linguistic-surface": "Superficie lingüística",
    "trained-classifier": "Clasificador entrenado",
    "commercial": "Detectores comerciales",
}
VALIDATION = {
    "external-benchmark": "Validación externa publicada",
    "internally-evaluated": "Evaluación interna",
    "vendor-claim": "Precisión declarada por el proveedor",
    "unvalidated": "Sin evaluación propia",
    "heuristic": "Heurístico",
    "descriptive": "Descriptivo",
}

lines = []
lines.append("# Catálogo de motores")
lines.append("")
lines.append(f"Generado automáticamente desde `/api/engines` el {datetime.now(timezone.utc).strftime('%Y-%m-%d')}.")
lines.append(f"Versión del motor: `{data['engineVersion']}` · **{data['count']} unidades de análisis** ({data['ownAnalyzers']} analizadores propios).")
lines.append("")
lines.append("Cada entrada distingue su naturaleza: un analizador que mide la longitud de las oraciones **no** es un modelo entrenado, y un adaptador comercial **no** es un método propio.")
lines.append("")
lines.append("| # | Motor | Naturaleza | Familia | Grupo de dependencia | Validación | Direccional | Idiomas | Mín. palabras |")
lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for i, entry in enumerate(data["engines"], 1):
    m = entry["meta"]
    lines.append(
        f"| {i} | `{m['id']}` | {KIND.get(m['kind'], m['kind'])} | {FAMILY.get(m['family'], m['family'])} | "
        f"`{m['dependenceCluster']}` | "
        f"{VALIDATION.get(m['validation'], m['validation'])} | {'sí' if m['directionality'] == 'directional' else 'no'} | "
        f"{'/'.join(m['languages'])} | {m['minWords']} |"
    )
lines.append("")
lines.append("## Fichas detalladas")
lines.append("")
for i, entry in enumerate(data["engines"], 1):
    m = entry["meta"]
    lines.append(f"### {i}. {m['name']} — `{m['id']}`")
    lines.append("")
    lines.append(f"- **Naturaleza:** {KIND.get(m['kind'], m['kind'])} · familia «{FAMILY.get(m['family'], m['family'])}»")
    lines.append(f"- **Versión:** {m['version']}")
    lines.append(f"- **Validación:** {VALIDATION.get(m['validation'], m['validation'])}")
    lines.append(f"- **Grupo de dependencia:** `{m['dependenceCluster']}` (un grupo = un voto en el agregador)")
    if m.get("sharesVarianceWith"):
        for share in m["sharesVarianceWith"]:
            lines.append(f"  - Comparte varianza con `{share['engine']}`: {share['reason']}")
    lines.append(f"- **Interpretación direccional:** {'sí, con anclas documentadas' if m['directionality'] == 'directional' else 'no: medida descriptiva'}")
    lines.append(f"- **Idiomas declarados:** {', '.join(m['languages'])} · mínimo {m['minWords']} palabras")
    lines.append(f"- **Disponibilidad en esta instancia:** {entry['availability']['status']} — {entry['availability']['detail']}")
    lines.append("")
    lines.append(f"**Resumen.** {m['summary']}")
    lines.append("")
    lines.append(f"**Metodología.** {m['methodology']}")
    lines.append("")
    lines.append("**Variables analizadas.** " + "; ".join(m["variables"]))
    lines.append("")
    lines.append("**Fórmulas.**")
    lines.append("")
    for f in m["formulas"]:
        note = f" — {f['note']}" if f.get("note") else ""
        lines.append(f"- *{f['name']}*: `{f['expression']}`{note}")
    lines.append("")
    lines.append("**Limitaciones.**")
    lines.append("")
    for lim in m["limitations"]:
        lines.append(f"- {lim}")
    if m.get("signalAnchors"):
        a = m["signalAnchors"]
        lines.append("")
        lines.append(f"**Anclas de señal** (`{a['metric']}`): " + ", ".join(f"[{p[0]} → {p[1]}]" for p in a["points"]))
        lines.append("")
        lines.append(f"> {a['rationale']}")
    if m.get("segmentUnit"):
        lines.append("")
        lines.append(f"**Puntuación por fragmento:** {m['segmentUnit']}")
    if m.get("references"):
        lines.append("")
        lines.append("**Referencias.** " + "; ".join(m["references"]))
    lines.append("")

open("docs/ENGINES.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(f"docs/ENGINES.md escrito con {data['count']} motores")
