# Métodos: agregación, anclas, evidencia y límites

Este documento explica **cómo se combina** lo que miden los motores y **qué no
significa** el resultado. Las fichas por motor (fórmulas, variables, límites y
grupo de dependencia) están en [`ENGINES.md`](./ENGINES.md), generado desde
`/api/engines`.

> **Regla de lectura.** Ninguna cifra de Umbral es una probabilidad de autoría.
> El índice es un compuesto heurístico; el «acuerdo» no se calcula; la evidencia
> describe cobertura metodológica. Si el sistema no puede calcular algo con una
> definición válida, lo publica como `null` y lo explica.

---

## 1. Por qué no se promedian motores

Un promedio de diecinueve puntuaciones supone que diecinueve mediciones son
independientes. No lo son: la entropía léxica, la perplejidad de bigramas y la
compresión describen aspectos muy relacionados de la misma propiedad estadística;
la repetición de n-gramas y la similitud entre oraciones comparten el mismo
solapamiento de secuencias; el burstiness, la regularidad estructural, la
complejidad sintáctica y la legibilidad parten todas de la longitud de oración.

Promediar sin más equivale a contar varias veces la misma evidencia y a producir
un número con apariencia de consenso que solo refleja cuántas variantes del mismo
cálculo existen.

Umbral resuelve esto con **grupos de dependencia declarados**.

## 2. Grupos de dependencia: un grupo = un voto

Cada motor declara en `meta.dependenceCluster` a qué grupo pertenece. La relación
es **estructural y explícita**, no se estima a partir de un único documento (con
un solo texto no hay forma honesta de estimar correlaciones).

| Grupo | Motores que lo componen |
| --- | --- |
| `information-theoretic` | `entropy.lexical`, `predictability.perplexity`, `compression.complexity` |
| `lexical-richness` | `diversity.lexical`, `richness.yule` |
| `sequence-repetition` | `repetition.ngram`, `redundancy.similarity` |
| `sentence-rhythm` | `rhythm.burstiness`, `structure.regularity`, `syntax.complexity`, `readability.indices` |
| `function-word-profile` | `stylometry.functionwords`, `morphosyntax.profile` |
| `discourse-markers` | `discourse.connectors` |
| `orthography` | `orthography.punctuation` |
| `trained-classifier` | `ml.stylometric-classifier` |
| `vendor-sapling` / `vendor-gptzero` | cada proveedor comercial, por separado |
| `simulated` | `commercial.mock` (nunca vota) |

Además, `meta.sharesVarianceWith` documenta las relaciones **entre** grupos (por
ejemplo, el clasificador entrenado usa entropía y longitudes de oración en su
vector de características). Esas relaciones no fusionan grupos, pero quedan
publicadas para que el lector sepa qué se está reutilizando.

Los dos proveedores comerciales conservan votos separados porque son
implementaciones independientes, aunque sus errores estén correlacionados. La
correlación declarada aparece en `/api/engines` y en `ENGINES.md`.

## 3. Direccionalidad: qué puede votar y qué no

Solo **10 de los 19** motores declaran dirección interpretativa; los demás son
descriptivos (riqueza léxica, legibilidad, puntuación, perfil de categorías) y
**no entran en el compuesto**.

Un motor direccional emite `signal ∈ [0,1]` mediante una función monótona por
tramos definida por **anclas publicadas** (`meta.signalAnchors.points`). Esas
anclas:

- son explícitas y visibles en la interfaz y en `ENGINES.md`;
- **no están calibradas** con corpus etiquetado en español;
- codifican una hipótesis tomada de la literatura, no un hecho demostrado;
- se traducen a una **intensidad del rasgo**, no a una probabilidad de autoría.

Ejemplo (`rhythm.burstiness`, métrica `burstinessB`):

| B de Goh-Barabási | Intensidad |
| --- | --- |
| −1,00 | 0,85 |
| −0,40 | 0,68 |
| −0,15 | 0,48 |
| +0,15 | 0,30 |
| +1,00 | 0,18 |

Esta tabla dice: «cuanto más homogéneas son las longitudes de oración, mayor
intensidad de este rasgo». **No** dice «cuanto más homogéneas, más probable es
que lo haya escrito una IA». Que el rasgo se asocie a texto generado es una
hipótesis de trabajo pendiente de validación.

## 4. Fórmulas del compuesto

```
w_i        = peso_validación(meta_i) × peso_evidencia(run_i)          (por motor)
s_g        = Σ_{i∈g} w_i · s_i / Σ_{i∈g} w_i                        (señal del grupo)
c_g        = peso_tipo(mejor tipo del grupo)
             × peso_validación(mejor validación del grupo)
             × media de pesos de evidencia del grupo                 (peso del grupo)
índice     = 100 · Σ_g c_g · s_g / Σ_g c_g        (solo si hay ≥ 2 grupos y ≥ 80 palabras)
dispersión = sqrt( Σ_g c_g · (s_g − media)² / Σ_g c_g )
rango      = [100·mín(s_g), 100·máx(s_g)]         (solo si hay ≥ 2 grupos)
```

| Tipo de método | Peso base |
| --- | --- |
| Comercial | 1,00 |
| Clasificador entrenado | 0,90 |
| Académico | 0,80 |
| Estadístico | 0,70 |
| Lingüístico | 0,35 |

| Validación declarada | Peso |
| --- | --- |
| Validación externa publicada | 1,00 |
| Evaluación interna con datos separados | 0,90 |
| Precisión declarada por el proveedor | 0,75 |
| Sin evaluación propia | 0,55 |
| Heurístico | 0,30 |
| Descriptivo | 0,20 |

| Evidencia del resultado | Peso |
| --- | --- |
| Alta | 1,00 |
| Media | 0,80 |
| Baja | 0,50 |
| Insuficiente | 0,20 |

`evidenceFor()` degrada la evidencia cuando el texto no llega al mínimo declarado
por el motor o no alcanza 2,5 veces ese mínimo.

**Observación importante y honesta:** con la configuración por defecto solo votan
motores propios no validados de tipo estadístico, todos con la misma validación y
la misma evidencia. En ese caso los pesos de los grupos son idénticos y el índice
equivale a la **media de las señales de grupo**. Los pesos solo diferencian
resultados cuando participa un motor mejor validado (comercial, clasificador con
métricas). El índice no gana precisión por tener más motores: gana, como mucho,
cobertura.

## 5. Cuándo el índice **no** se calcula

`signalIndex = null` y `signalBand = "no calculable"` si:

- hay menos de **dos grupos independientes** con señal (no hay contraste
  metodológico: un solo grupo no es un compuesto), o
- el texto tiene menos de **80 palabras** (los estadísticos no son estables).

La interfaz muestra «No calculable» y el motivo. No se sustituye por 0, porque 0
es un valor de la escala y se leería como «intensidad nula medida».

## 6. Bandas

| Índice | Banda |
| --- | --- |
| 0–34 | `bajo` |
| 35–64 | `medio` |
| 65–100 | `alto` |

Los cortes son **decisiones de presentación** (tres tramos en una escala de 100),
no umbrales derivados de calibración. La API los publica en
`aggregate.bandThresholds` con la nota correspondiente.

## 7. Acuerdo entre motores: no calculable

La versión anterior publicaba un «acuerdo» calculado como
`100 · (1 − media de diferencias por pares)` entre las señales. Ese número **no es
una medida de acuerdo**: no existen decisiones binarias válidas, no hay verdad de
referencia y las señales son transformaciones arbitrarias de métricas distintas.
Su valor era alto casi por construcción (todas las anclas producen valores
intermedios), de modo que transmitía una confianza inexistente.

Ahora:

```json
"agreement": {
  "score": null,
  "label": "no calculable",
  "method": "No se aplica ninguna medida de acuerdo entre motores.",
  "reason": "No se calcula acuerdo entre motores: ninguno emite una decisión binaria validada y no existe verdad de referencia…"
}
```

En su lugar se publica `dispersion` (desviación típica ponderada entre grupos),
que **describe cuánto se separan las intensidades** y no mide acierto. Un kappa o
un alpha exigirían que cada motor emitiera una decisión comparable y validada;
hoy no la emiten.

## 8. Nivel de evidencia: cobertura, no acierto

| Condición | Efecto |
| --- | --- |
| ≥ 3 grupos con señal | base «alta» |
| 2 grupos | base «media» |
| 1 grupo | base «baja» |
| < 80 palabras | máximo «baja» (y sin índice) |
| 80–199 palabras | máximo «media» |
| Idioma no identificado | máximo «baja» |
| Ningún grupo con validación declarada | máximo «baja» |

\* Con la configuración por defecto siempre se aplica esta última regla, porque
ningún motor propio tiene calibración publicada. El resultado es que la evidencia
se muestra como «baja» en casi todos los análisis: es el reflejo correcto del
estado del arte del proyecto, no un error de cálculo.

La definición se publica en `aggregate.evidence.definition`: *«Cobertura
metodológica: cuántos grupos independientes aportaron señal, con qué validación
declarada y con cuánto texto. No es probabilidad de acierto ni confianza en una
autoría.»*

## 9. Probabilidad conjunta: por qué está deshabilitada

Una probabilidad exige: (a) un agregador entrenado, (b) datos con procedencia
conocida, (c) separación entrenamiento/evaluación por autor, idioma y género,
(d) calibración verificada (Brier, curva de fiabilidad) y (e) evaluación fuera de
muestra en el punto de operación relevante.

No se cumple ninguna de las cinco. Por eso `aggregate.probability` es `null` y el
mensaje es explícito. No se ofrece una pseudo-probabilidad derivada del índice, y
tampoco se presenta la puntuación de un proveedor comercial como «probabilidad
calibrada»: se desconoce su calibración en español y en este dominio.

### Ruta de calibración (trabajo futuro)

1. Reunir un corpus etiquetado con licencia y procedencia (ver `RESEARCH.md` §3).
2. Describir el comportamiento actual con `scripts/evaluate-aggregator.mjs`
   (`npm run calibrate -- --data corpus.jsonl --base http://127.0.0.1:3000`).
   El script exige ≥ 40 documentos para ejecutarse, informa AUROC con intervalo
   bootstrap y **solo publica TPR@FPR=1 % si hay ≥ 100 negativos** (sin ellos el
   punto de operación no existe). Ese mínimo no basta para calibrar.
3. Ajustar un modelo (regresión logística regularizada) sobre las señales de
   grupo, con separación por autor y validación cruzada por grupo.
4. Calibrar con Platt o isotónica **sobre un conjunto distinto**.
5. Evaluar TPR@FPR, AUROC, AUPRC, Brier y fiabilidad por idioma y género.
6. Solo entonces exponer una probabilidad, indicando su dominio de validez.

## 10. Previsibilidad: qué mide realmente

`predictability.perplexity` **no** usa un modelo de lenguaje. Calcula la entropía
cruzada de un modelo de bigramas cuyos parámetros se estiman con el propio
documento (leave-one-out suavizado, α = 0,1):

```
p₁(w)   = (c(w) − 1 + α) / (N − 1 + αV)
p₂(w|a) = (c(a,w) − 1 + α) / (c(a) − 1 + αV)      si c(a) > 1
p(w|a)  = 0,6·p₂ + 0,4·p₁
H       = −(1/N)·Σ log₂ p(wᵢ | wᵢ₋₁)
```

Es una medida de **autoconsistencia interna**: cuánto se repite el texto a sí
mismo. No es comparable con la perplejidad de GPT-2, Binoculars, DetectLLM ni
ningún modelo externo, y por eso la respuesta incluye
`isLanguageModelPerplexity: "no"`.

Solo se emite señal si hay ≥ 120 tokens **y** ≥ 10 % de bigramas repetidos; en
caso contrario se informa `null` y el motivo.

## 11. Análisis por fragmentos

- La tabla de oraciones solo muestra puntuaciones que el motor aporta por sí mismo.
- `predictability.perplexity` aporta la entropía cruzada de cada oración bajo el
  modelo global, convertida a **percentil dentro del texto** (1 = más previsible).
  No es una probabilidad.
- Sapling aporta `sentence_scores` y `segments`; GPTZero, `sentences[]`.
- Nunca se reparte la puntuación global de un motor entre los fragmentos.

## 12. Qué no hace el sistema

- No identifica autores.
- No dictamina plagio ni originalidad.
- No distingue traducción humana de generación.
- No promete acertar en texto corto, poesía, listas ni código.
- No emite un veredicto de autoría: `authorshipConclusion` es siempre `null`.
- No convierte el índice en una decisión disciplinaria o editorial automática.
