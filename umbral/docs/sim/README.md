# Simulación Union-Find — reconstrucción

**Estado:** reconstrucción verificada · **Fecha:** 30/10/2026
**No es el código original.** El original vivía en `/tmp/sim`, se ejecutó una vez con resultados que ya no se pueden recalcular, y se perdió en un reinicio del entorno. Este directorio reconstruye el experimento a partir de la descripción del anexo de `FINAL_CORPUS_DESIGN.md`, **corrigiendo** los defectos que la auditoría ha encontrado.

Python estándar exclusivamente. Sin `numpy`, sin `scipy`, sin instalaciones.

---

## 1. Archivos

| Archivo | Función |
|---|---|
| `uf_core.py` | Union-Find, componentes, cuantiles, estadísticos, pureza por eje, fingerprint |
| `generator.py` | Corpus sintético con topes respetados **sin inventar entidades** |
| `run_sim.py` | Ejecutor: escenarios × semillas × conjuntos de claves |
| `selftest.py` | 19 pruebas: determinismo, topes, registro, umbrales, pureza |
| `config/base.json` | Parámetros, claves de identidad, umbrales, supuestos perdidos |
| `config/scenarios.json` | 600, 1.500, 4.240 y una variante sin topes |
| `config/sweep_caps.json` | Barrido de topes para localizar la percolación |

Ninguno de los módulos ejecuta nada al importarse: la ejecución está en `main()`.

---

## 2. Requisitos y dónde se cumplen

| Requisito | Implementación |
|---|---|
| Código identificado como reconstrucción | Cabecera de cada archivo, campo `reconstruction: true` en la salida |
| Semillas configurables, resultados deterministas | `--seeds 0,1,2`, `rng_for()` derivado con SHA-256 |
| Sin entidades artificiales al alcanzar un tope | `_capped_zipf_assignment()` muestrea solo entre entidades con capacidad; si no hay, `ConfigError` |
| Exclusiones y rechazos registrados | `new_log()`: `capacity_errors`, `near_dup`, `entities_at_cap`, `draws_with_saturation` |
| Importar no ejecuta simulación | `if __name__ == "__main__"` en los cuatro módulos |
| Configuración separada del código | `config/*.json`; el código no contiene parámetros |
| Claves de identidad configurables | `identity_key_sets` + `--key-set` |
| Umbrales 3 %, 5 %, 10 % | `giant_thresholds` + `--thresholds` |
| Instrucciones | §6 de este documento |
| Reproducibilidad comprobada | §7 |

---

## 3. Correcciones respecto al script perdido

Tres defectos del original, documentados aquí porque **cambian los resultados**:

1. **Los topes no se respetaban.** Al superar un tope, el script renombraba la entidad con un sufijo aleatorio (`s12__4821`), creando autores y fuentes inexistentes. Eso fragmentaba el grafo artificialmente. Aquí el tope se aplica antes de asignar. **Consecuencia: los porcentajes de «utilizable» del §5 del documento de diseño no se reproducen.**
2. **Los casi duplicados no duplicaban nada.** El original guardaba en un documento el identificador de otro (`d.near = o.id`), pero ese valor no coincidía con el de ningún tercero, así que la clave no fusionaba el par. Aquí ambos documentos comparten un `near_dup_cluster` explícito.
3. **Cuantiles sin interpolar.** `int(p·n)` sesgaba p90 y p95 a la baja. Ahora se interpola (R-7).

---

## 4. Parámetros

| Parámetro | Valor | Origen |
|---|---|---|
| `versions_per_family` | 5 | documento de diseño |
| `zipf_exponent` | 1,2 | **recordado del transcript, no verificable** |
| `pool_fractions` | 0,70 / 0,45 / 0,30 / 0,35 | **recordado, no verificable** |
| `caps` (autor/fuente/tema/prompt) | 3 / 6 / 6 / 8 | documento de diseño |
| `near_dup_probability` | 0,03 | documento de diseño |
| `contribution_rule` | `per_family` | alternativa `per_contributor` implementada |
| ejes | género 9, país 6, modelo 4; se ocultan 2 | documento de diseño |
| semillas | 0–4 (5); el barrido usa 0–2 | — |

Ints en `caps` = tope absoluto de familias por entidad. Flotantes en (0,1) = fracción de familias (mínimo 2), forma que usaba el original.

---

## 5. Resultados

### 5.1 Escenarios principales (semillas 0–4, claves de identidad)

| Escenario | comp | mediana | p90 | p95 | mayor | en gigantes (3/5/10 %) |
|---|---|---|---|---|---|---|
| piloto 600 | 2,8 | 182,0 | 485,2 | 537,1 | 589,0 | 98,2 % / 98,2 % / 98,2 % |
| v0.5 1.500 | 7,6 | 5,0 | 505,7 | 980,9 | 1.456,0 | 97,1 % / 97,1 % / 97,1 % |
| v1 4.240 | 20,4 | 5,0 | 14,0 | 388,1 | 4.112,0 | 97,0 % / 97,0 % / 97,0 % |

Añadiendo `topic_cluster` o `prompt_template_id` a las claves de identidad, el corpus se reduce a **1–2 componentes** y el 100 % de los documentos cae en una gigante.

**La mediana engaña.** En v1 la mediana es 5 documentos (la mayoría de componentes son diminutas), pero una sola componente concentra 4.112 de 4.240. Publicar «mediana 5» sin el dato de la mayor sería exactamente el error que este trabajo trata de evitar.

### 5.2 Barrido de topes (600 documentos, semillas 0–2)

| Topes (autor/fuente/tema/prompt) | Grado medio | comp | mayor | % gigante @5 % | % utilizable |
|---|---|---|---|---|---|
| 1 / 1 / 1 / 1 | 0,00 | 105,0 | 18,3 | 0,0 % | **100,0 %** |
| 2 / 1 / 1 / 1 | 0,50 | 54,3 | 45,0 | 9,7 % | 90,3 % |
| 3 / 1 / 1 / 1 | 0,67 | 42,3 | 68,3 | 30,0 % | 70,0 % |
| 3 / 2 / 2 / 2 | 2,17 | 3,3 | 575,0 | 95,8 % | **4,2 %** |
| 3 / 6 / 6 / 8 | 3,21 | 3,3 | 586,7 | 97,8 % | **2,2 %** |

Grado medio = Σ (c−1)/c sobre las claves de bloqueo, es decir, el número esperado de enlaces por familia.

### 5.3 Por qué el corpus colapsa: percolación, no un fallo

Una componente gigante aparece en cuanto el grado medio supera 1. Con cuatro claves compartidas, incluso topes de 2 aportan Σ(c−1)/c = 2,0. **Cualquier combinación realista de dos o más claves compartidas percola.** No es un defecto del Union-Find ni del generador: es la matemática del cierre transitivo.

**Consecuencia para el diseño:** no se arregla con topes más finos, sino bajando el grado medio por debajo de 1 (dejando una sola clave compartida, o haciendo las demás únicas por familia). Y eso reduce el corpus utilizable al 2–4 % con los topes del documento.

### 5.4 Reparto por eje

Con cierre transitivo, las componentes mezclan valores del eje y quedan inservibles para el experimento:

| Escenario | eje | train | test | impuras |
|---|---|---|---|---|
| piloto 600 | género | 5 | 2 | 591 |
| piloto 600 | país | 7 | 2 | 591 |
| v1 4.240 | género | 63 | 15 | 4.162 |

**E2–E5 no son ejecutables con este diseño de particiones**, ni en el piloto ni en v1. Los tamaños «E3 test ≈ 46, 161, 517» del documento de diseño procedían del script con topes falsos y no se sostienen.

---

## 6. Cómo ejecutar

```bash
cd umbral/docs/sim

# 1. Pruebas (19)
python3 selftest.py -v

# 2. Escenarios principales, 5 semillas, con registro del generador
python3 run_sim.py --seeds 0,1,2,3,4 --show-log

# 3. Barrido de topes
python3 run_sim.py --scenarios config/sweep_caps.json --seeds 0,1,2 --key-set identidad

# 4. Un solo umbral y una sola clave
python3 run_sim.py --seeds 0 --thresholds 0.05 --key-set identidad

# 5. Salida JSON para comparar ejecuciones
python3 run_sim.py --seeds 0,1,2,3,4 --format json --json-out /tmp/sim.json
```

Duración: ~1,7 s para las 5 semillas × 4 escenarios × 3 conjuntos de claves.

---

## 7. Reproducibilidad comprobada

| Prueba | Resultado |
|---|---|
| Misma semilla, mismo corpus | idéntico (comparación de diccionarios completa) |
| Semillas distintas, corpus distinto | sí |
| `PYTHONHASHSEED=0` vs `=1`, procesos separados | **mismo fingerprint**, JSON idéntico byte a byte |
| Importar módulos | salida vacía en stdout y stderr |
| Topes respetados | máx. de familias por entidad ≤ tope |
| Sin entidades con sufijo `__` | verificado |
| Capacidad insuficiente | `ConfigError`, no invención de entidades |
| Umbrales 3/5/10 | monotonía y complementariedad verificadas |

Fingerprint de referencia para `--seeds 0,1,2,3,4` con `config/scenarios.json` y experimentos activados:

```
569e9cc2b55c4dc8171ca9d287195586aa0321544dd790605757e4589d743678
```

Si una ejecución produce otro valor, algo cambió. El fingerprint cubre **solo las medias** (`_canonical` excluye los registros por semilla), de modo que un cambio en el log no lo altera; para auditar el log hay que usar `--json-out`.

---

## 8. Supuestos que no se pudieron recuperar

No se han inventado: están en `missing_assumptions` de `config/base.json` y se aplican como valores configurables.

- Exponente Zipf exacto (se usa 1,2, recordado del transcript).
- Fracciones de pool (0,70/0,45/0,30/0,35): recordadas, no verificables.
- Semántica original de los topes: renombraba valores; se desconoce si era un error o una intención.
- Semántica original de los casi duplicados: probablemente rota, sin forma de saber qué pretendía.
- Número de semillas por bloque (15 o 20 según el bloque, sin registro de cuál usó cuál).
- Función de cuantiles original (orden sin interpolación: se sabe lo que hacía, no por qué).
- Orden de asignación de claves dentro de una semilla.

---

## 9. Límites de esta reconstrucción

1. **El corpus es sintético.** Describe el comportamiento del algoritmo bajo supuestos plausibles; no dice nada sobre documentos reales.
2. **Los resultados no coinciden con los del documento de diseño, y no deben coincidir**: el original tenía los topes rotos.
3. **El generador asigna atributos de forma independiente entre familias.** En un corpus real, temas y plantillas de prompt están más concentrados, lo que haría la percolación más probable, no menos.
4. **No se ha re-ejecutado el barrido con más de 3 semillas** por coste; la transición es lo bastante marcada como para no necesitarlo.
