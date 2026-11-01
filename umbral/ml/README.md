# Capa de machine learning

El clasificador estilométrico de Umbral **está deshabilitado por defecto**. No se
entrena sin un conjunto de datos con procedencia, licencia y separación de grupos.

## Estado actual

| Elemento | Estado |
| --- | --- |
| Vector de 22 características (`features.py` / `src/lib/ml/features.ts`) | Implementado y verificado en paridad |
| Pipeline de entrenamiento (`train.py`) | Implementado, ejecutable |
| Artefacto `ml/artifacts/model.json` | **No incluido** (sin dataset licenciado) |
| Motor `ml.stylometric-classifier` | `dataset-required`, no vota en el agregador |

## Ejecutar

```bash
pip install -r ml/requirements.txt
python3 ml/train.py --data ml/data/dataset.jsonl --out ml/artifacts --export
```

Formato JSONL (una línea por documento):

```json
{"text": "...", "label": "human", "author": "A1", "source": "corpus-x", "generator": "", "language": "es", "genre": "académico"}
```

## Reglas que aplica el pipeline

1. Descarta documentos de menos de 50 palabras y etiquetas no reconocidas.
2. Deduplica por hash exacto y por Jaccard de 8-gramas ≥ 0.9.
3. Separa entrenamiento y prueba por **autor**, **fuente** o **modelo generador**
   (`GroupShuffleSplit`), nunca por fila.
4. Aborta si detecta un documento idéntico en ambos conjuntos.
5. Calcula precision, recall, specificity, F1, FPR, AUROC, AUPRC, Brier,
   curva de calibración e intervalos bootstrap al 95 %.
6. Solo exporta el artefacto si hay ≥ 200 documentos, ≥ 2 grupos y prueba ≥ 15 %.

## Fuentes candidatas (no descargadas en este proyecto)

| Conjunto | Idiomas | Contenido | Licencia / acceso | Nota |
| --- | --- | --- | --- | --- |
| M4 / MULTITuD | multilingüe (incl. es) | múltiples generadores y dominios | ver repositorio original | requiere descarga y revisión de licencia |
| MixSet | en, es y otros | mezcla humano/máquina | ver repositorio | útil para evaluación cruzada |
| AuTexTification (IberLEF) | es, en | tuits, noticias, artículos | condiciones de competición | buena cobertura de español |
| Detectors corpora de proveedores | varía | no redistribuible | propietaria | no usar sin permiso explícito |

Antes de descargar cualquier conjunto hay que verificar **licencia, condiciones de
uso, autoría de los textos, modelos generadores, idiomas, géneros, longitudes y
sesgos conocidos**. Este proyecto no ha descargado ninguno: la red del sandbox no
permite acceder a Hugging Face y no se ha considerado justificado introducir un
corpus sin revisar su licencia.

## Por qué no hay modelo todavía

Un clasificador entrenado sobre textos de un único generador y un único género
aprende atajos del corpus, no un rasgo estable de autoría. Presentar ese modelo
como detector válido sería exactamente lo que este proyecto evita. La arquitectura
queda lista para activarlo cuando exista evidencia fuera de muestra.
