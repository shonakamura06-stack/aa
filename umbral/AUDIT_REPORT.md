# Auditoría independiente de Umbral

**Fecha:** 30 de octubre de 2026
**Objeto:** plataforma de análisis multimodelo de texto en `/home/user/aa/umbral`
**Método:** lectura del código fuente real (no del README), recálculo manual de
fórmulas, ejecución de la aplicación y de la batería de pruebas, e intento
deliberado de romper las afirmaciones metodológicas del producto.
**Rol:** auditor, no autor. Se han buscado errores, métricas engañosas,
implementaciones superficiales, dependencias innecesarias y conclusiones
científicamente injustificadas, incluidas las introducidas por el propio autor.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Alcance y método](#2-alcance-y-método)
3. [Inventario real de los 19 motores](#3-inventario-real-de-los-19-motores)
4. [Capa D: auditoría del agregador](#4-capa-d-auditoría-del-agregador)
5. [Auditoría matemática](#5-auditoría-matemática)
6. [Perplejidad y previsibilidad](#6-perplejidad-y-previsibilidad)
7. [Lengua española](#7-lengua-española)
8. [APIs](#8-apis)
9. [Seguridad y privacidad](#9-seguridad-y-privacidad)
10. [Defectos encontrados](#10-defectos-encontrados)
11. [Correcciones aplicadas](#11-correcciones-aplicadas)
12. [Lo que no se corrigió y no se puede afirmar](#12-lo-que-no-se-corrigió-y-no-se-puede-afirmar)
13. [Pruebas ejecutadas](#13-pruebas-ejecutadas)
14. [Preparación para producción](#14-preparación-para-producción)
15. [Conclusión](#15-conclusión)

---

## 1. Resumen ejecutivo

**La plataforma es real y funciona.** Los 15 analizadores propios se ejecutan de
verdad sobre el texto, producen métricas medibles y la aplicación arranca,
responde y se puede usar. La arquitectura de cuatro capas está implementada tal
como se declara, y las capas B, C y D se degradan de forma controlada cuando no
hay claves, modelo o presupuesto.

**El problema no era que no funcionara, sino lo que afirmaba.** La versión
anterior publicaba tres cifras que el sistema no podía sostener:

| Cifra anterior | Problema | Estado actual |
| --- | --- | --- |
| «Acuerdo 94 / 79 / 72» | Se calculaba como `1 − diferencia media` entre señales que **no son decisiones binarias**. Salía alto casi por construcción. | `agreement.score = null`, etiqueta `no calculable`, con motivo explícito |
| Índice 0–100 presentado junto a esas cifras | Se leía como probabilidad. No hay calibración ni corpus. | `indexKind: "heuristic-composite"`, `calibrated: false`, `probability: null`, `authorshipConclusion: null` |
| Rango ±20 con una sola familia | Margen inventado para que la interfaz no quedara vacía. | `signalRange` = dispersión real observada; si no hay dos grupos, no hay rango y el índice es `null` |

Se encontraron **26 defectos**: **6 críticos** (afirmaciones falsas, fuga de datos
al cliente, límites de seguridad eludibles), **17 altos** (fórmulas que medían
otra cosa que la declarada, o informes que afirmaban un análisis inexistente),
**2 medios** (comportamiento incorrecto en casos límite) y **1 bajo**. **Los 26
están corregidos.** Veinticinco tienen prueba automatizada de regresión; `D21`
(entrenamiento) se verificó ejecutando el script con datos de humo.

Queda una limitación **estructural que ninguna corrección de código resuelve**:
no existe corpus etiquetado en español con licencia, por lo que el índice no
está calibrado y la evidencia se muestra como «baja» en la práctica totalidad de
los análisis. Eso no es un fallo: es el estado real del proyecto, y ahora la
interfaz lo dice en lugar de disimularlo.

---

## 2. Alcance y método

### 2.1 Qué se inspeccionó

| Área | Archivos leídos completos |
| --- | --- |
| Núcleo | `src/lib/types.ts`, `text/stats.ts`, `text/tokenize.ts`, `text/language.ts`, `analysis.ts`, `orchestrator.ts`, `http.ts`, `rate-limit.ts` |
| Motores | los 16 archivos de `src/lib/engines/` (15 motores propios + fábrica comercial) |
| Agregador | `src/lib/aggregator/index.ts` |
| Adaptadores | `sapling.ts`, `gptzero.ts`, `mock.ts`, `quota.ts`, `types.ts` |
| API | las 7 rutas de `src/app/api/` |
| ML | `ml/features.py`, `ml/train.py`, `ml/feature_lexicon.json` |
| Interfaz | `Workspace.tsx`, `ResultsDashboard.tsx`, `EngineCatalog.tsx`, `Gauge.tsx` |
| Scripts | `verify.sh`, `evaluate-aggregator.mjs`, `gen-engine-docs.py` |

### 2.2 Qué se ejecutó de verdad

- `npx tsc --noEmit` → sin errores.
- `npx vitest run` → **13 archivos, 185 pruebas, todas en verde**.
- `npm run build` → compilación de producción con 7 rutas API.
- Servidor real (`next start`) en `0.0.0.0:3000` y peticiones HTTP con `curl` y
  Python: salud, catálogo, análisis, streaming, editorial, proveedores, 413.
- `node scripts/evaluate-aggregator.mjs` contra el servidor con 40 documentos
  sintéticos.
- `python3 ml/train.py` con datos de humo.

### 2.3 Qué no se pudo verificar (y por qué)

| Capacidad | Motivo | Consecuencia |
| --- | --- | --- |
| Llamadas reales a Sapling y GPTZero | El entorno no tiene salida HTTP hacia esos dominios; además, usarlas generaría gasto y la prohibición es explícita | Adaptadores verificados **solo** contra fixtures construidos a partir de la documentación. Se declaran como «no verificados en vivo» |
| Modelo ML entrenado | No hay corpus con licencia; el artefacto no existe | Motor en estado `unavailable`, sin participar en el resultado |
| Pruebas E2E con navegador | Playwright instalado, sin Chromium en el entorno | Los 3 specs existen y están escritos, **no ejecutados** |
| Comportamiento multi-instancia | Requiere despliegue real | El límite de tasa se documenta como límite por instancia, no global |

**No se declara nada como verificado si no se ejecutó.** Donde la única evidencia
es un fixture, el informe lo dice.

---

## 3. Inventario real de los 19 motores

Cada motor se clasifica con la taxonomía pedida:

- **A** detector externo auténtico · **B** clasificador entrenado ·
  **C** método académico de detección · **D** analizador estadístico ·
  **E** analizador lingüístico · **F** experimental · **G** simulado.

**Resultado de la clasificación: A = 2 · B = 1 · C = 0 · D = 9 · E = 5 · F = 1 · G = 1.**

La capa C está **vacía**. Los métodos académicos (Fast-DetectGPT, Binoculars,
DetectLLM) requieren GPU y modelos de miles de millones de parámetros; se
documentan en `RESEARCH.md` como trabajo relacionado y **no se implementan**.
Cualquier afirmación de que Umbral incluye detección académica sería falsa.

### 3.1 Tabla de conjunto

| # | id | archivo | tipo | qué mide | votos en el índice | en el «acuerdo» | grupo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `entropy.lexical` | `entropy-lexical.ts` | D | entropía de unigramas y bigramas | sí (direccional) | no (no se calcula) | `information-theoretic` |
| 2 | `diversity.lexical` | `diversity-lexical.ts` | D | TTR, MATTR, MTLD, hapax | no (descriptivo) | no | `lexical-richness` |
| 3 | `richness.yule` | `richness-yule.ts` | D | K de Yule, D de Simpson, R de Honoré | no | no | `lexical-richness` |
| 4 | `repetition.ngram` | `repetition-ngram.ts` | D | repetición de n-gramas 1–3, repeticiones consecutivas | sí | no | `sequence-repetition` |
| 5 | `rhythm.burstiness` | `burstiness.ts` | D | B de Goh-Barabási | sí | no | `sentence-rhythm` |
| 6 | `structure.regularity` | `structure.ts` | D | regularidad de longitudes | sí | no | `sentence-rhythm` |
| 7 | `predictability.perplexity` | `predictability.ts` | D | entropía cruzada de bigramas internos | sí, con condiciones | no | `information-theoretic` |
| 8 | `compression.complexity` | `compression.ts` | D | ratio deflate frente a una referencia | no | no | `information-theoretic` |
| 9 | `redundancy.similarity` | `redundancy.ts` | D | similitud léxica entre oraciones | sí | no | `sequence-repetition` |
| 10 | `stylometry.functionwords` | `stylometry.ts` | D | perfil de palabras funcionales | no | no | `function-word-profile` |
| 11 | `discourse.connectors` | `connectors.ts` | E | densidad y variedad de conectores | no | no | `discourse-markers` |
| 12 | `syntax.complexity` | `syntax.ts` | E | subordinación por marcadores léxicos | no | no | `sentence-rhythm` |
| 13 | `morphosyntax.profile` | `morphosyntax.ts` | F | sufijos verbales, participios, futuros | no | no | `function-word-profile` |
| 14 | `orthography.punctuation` | `orthography.ts` | E | puntuación y espaciado | no | no | `orthography` |
| 15 | `readability.indices` | `readability.ts` | E | Fernández-Huerta, Szigriszt-Pazos, INFLESZ | no | no | `sentence-rhythm` |
| 16 | `ml.stylometric-classifier` | `ml-classifier.ts` | B | clasificador de 22 características | sí, si hubiera modelo | no | `trained-classifier` |
| 17 | `commercial.sapling` | `commercial.ts` + `adapters/sapling.ts` | A | puntuación del proveedor | sí, con consentimiento | no | `vendor-sapling` |
| 18 | `commercial.gptzero` | `commercial.ts` + `adapters/gptzero.ts` | A | probabilidad del proveedor | sí, con consentimiento | no | `vendor-gptzero` |
| 19 | `commercial.mock` | `adapters/mock.ts` | G | valores simulados deterministas | **nunca** | no | `simulated` |

### 3.2 Fichas individuales

**1. `entropy.lexical` — `entropy-lexical.ts` · `lexicalEntropyEngine.run()`**
Calcula `H = −Σ p·log₂p` sobre frecuencias de palabra, la normaliza por
`log₂(tipos)` y añade la entropía condicional de bigramas `H(palabra|anterior)`.
Método real y estándar. **Problema detectado y corregido:** el texto se
tokenizaba incluyendo números, que inflaban el vocabulario; ahora los tokens
numéricos se separan y no cuentan como tipos léxicos. **Redundancia:** comparte
fenómeno con `predictability` y `compression`; los tres están en el mismo grupo y
por tanto **cuentan un solo voto**.

**2. `diversity.lexical` — `diversity-lexical.ts`**
TTR con corrección de longitud (MATTR en ventana de 50), MTLD con umbral 0,72 y
recuento de hapax. **Correcciones:** MTLD devolvía `0` cuando había menos de 10
palabras (ahora `null`); la métrica «hapax medio por tipo» era siempre 1 o 0 por
construcción y se sustituyó por `hapaxShareOfTokens`. Sigue siendo **descriptivo**:
mayor riqueza léxica no es «más humano».

**3. `richness.yule` — `richness-yule.ts`**
K de Yule, D de Simpson y R de Honoré sobre el recuento de frecuencias. Fórmulas
correctas y verificadas con valores calculados a mano en `tests/math.test.ts`.
Honoré devuelve `null` si todos los tipos son hapax (denominador nulo), en lugar
de `Infinity`.

**4. `repetition.ngram` — `repetition-ngram.ts`**
Cuenta n-gramas repetidos para n = 1, 2, 3 y repeticiones consecutivas de
oraciones y aperturas. Es la métrica más robusta del conjunto: no depende de
listas ni de idioma. **Ojo:** mide repetición, y la repetición también aparece en
texto humano ritual, jurídico o publicitario. El motor es direccional por
hipótesis, no por validación.

**5. `rhythm.burstiness` — `burstiness.ts`**
`B = (σ − μ)/(σ + μ)` sobre longitudes de oración. **Problema detectado:** con
menos de 3 oraciones, B es estadísticamente vacío; ahora exige un mínimo y
degrada la evidencia. La señal se obtiene de anclas publicadas (±1 → 0,85/0,18).
Es una **asociación documentada**, no una prueba.

**6. `structure.regularity` — `structure.ts`**
Coeficiente de variación de longitudes de oración y de párrafos, más proporción
de párrafos de longitud casi idéntica. **Corrección:** contaba oraciones por
párrafo con una expresión regular distinta a la del segmentador principal, de
modo que los totales no cuadraban entre motores; ahora usa el mismo
segmentador de `text/tokenize.ts`.

**7. `predictability.perplexity` — `predictability.ts`** (ver §6)
Modelo de bigramas estimado **con el propio documento** (leave-one-out
suavizado). Es la única medida de previsibilidad real del sistema y **no** es
perplejidad de un modelo de lenguaje. Se renombró la métrica y se añadió
`isLanguageModelPerplexity: "no"` para que nadie la cite como perplejidad de GPT.

**8. `compression.complexity` — `compression.ts`**
Comprime el texto con `zlib.deflateRawSync` y lo compara con una referencia
construida a partir del mismo texto. **Defecto crítico corregido:** la referencia
se generaba barajando **palabras** mientras el original conservaba puntuación,
tabulaciones y saltos de línea, así que el «ratio de compresibilidad» medía en
parte la puntuación ausente. Ahora la referencia se obtiene barajando **bytes**
del mismo texto (misma distribución de caracteres, mismo tamaño), y se publica la
base en bytes por token.

**9. `redundancy.similarity` — `redundancy.ts`**
Similitud coseno y Jaccard entre pares de oraciones (bolsas de palabras, no
semántica). **Defecto corregido:** la media se calculaba **solo sobre los pares
que superaban el umbral de solapamiento**, un sesgo de selección que inflaba la
cifra en textos con oraciones cortas. Ahora la media se calcula sobre todos los
pares; el subconjunto con solapamiento se informa aparte y, si ningún par lo
alcanza, el valor es `null` en lugar de `0`.

**10. `stylometry.functionwords` — `stylometry.ts`**
Frecuencias de artículos, preposiciones, pronombres, conjunciones y demostrativos,
más ratios normalizadas. **Correcciones:** la lista de pronombres solo tenía
formas españolas y devolvía 0 en inglés (ahora es por idioma); «que» estaba
duplicado en dos categorías y se contaba dos veces. Es **descriptivo**: un perfil
de funcionales no es un veredicto.

**11. `discourse.connectors` — `connectors.ts`**
Lista cerrada de conectores en español e inglés, agrupados por función
(adición, contraste, causa, consecuencia, orden, ejemplo, cierre). Mide densidad,
variedad y proporción de párrafos que abren con conector. **Corrección:** un
conector en posición inicial se contaba a la vez como «inicial» y como «aparición»,
duplicando la densidad. Limitación honesta: depende de una lista, así que un
texto con conectores no listados puntúa bajo. **Descriptivo.**

**12. `syntax.complexity` — `syntax.ts`**
Estimación de subordinación mediante marcadores (`que`, `porque`, `aunque`,
`mientras`, relativos) y longitud media de oración. **Es una heurística léxica,
no un análisis sintáctico.** Se declara como tal en `ENGINES.md` y no vota.
Un parser real (spaCy + modelo español) exigiría cientos de MB y no se ha
descargado.

**13. `morphosyntax.profile` — `morphosyntax.ts` (experimental)**
Sin analizador morfológico real, este motor **no puede** afirmar morfosintaxis.
Lo que hace: cuenta sufijos verbales (-ando, -iendo, -ado, -ido, -ría, -ra),
futuros perifrásticos (`voy a`, `vamos a`) y pronombres clíticos, usando la lista
de funcionales. **Corrección:** los participios en -ado/-ido se contaban como
formas verbales conjugadas, inflando `pastTenseShare`. Se etiqueta como
`experimental` y no vota. Se advierte en la interfaz.

**14. `orthography.punctuation` — `orthography.ts`**
Densidad de signos, proporción de oraciones que abren con signo de apertura
(¡¿), espaciado irregular, comillas y puntos suspensivos. Heurística de
superficie, muy dependiente del género y del registro. La métrica «falta de
apertura en interrogación/exclamación» se conserva porque es un rasgo lingüístico
real del español, pero se advierte de que también aparece en texto humano
informal.

**15. `readability.indices` — `readability.ts`**
Fernández-Huerta, Szigriszt-Pazos e INFLESZ a partir de palabras, oraciones y
sílabas. Las **fórmulas** están publicadas y validadas para prosa expositiva en
español; el **recuento silábico** es propio y aproximado (no separa hiatos ni
diptongos con precisión). Por eso la validación declarada pasó de «externa» a
«descriptiva»: no se puede atribuir al código una validación que corresponde a la
fórmula.

**16. `ml.stylometric-classifier` — `ml-classifier.ts`**
Carga un artefacto JSON con pesos de regresión logística sobre 22 características
extraídas de `features.py`, con **paridad numérica verificada** entre TypeScript y
Python (`tests/feature-parity.test.ts`, diferencia < 1e-9). **No hay modelo
entrenado**, así que el motor está `unavailable`. El script de entrenamiento exige
≥ 200 documentos, ≥ 2 grupos, test ≥ 15 % y **licencia declarada** antes de
exportar; corrección aplicada: antes elegía el modelo por su AUC **en test**, lo
que constituye una fuga por selección; ahora selecciona por validación cruzada
sobre entrenamiento (`GroupKFold` por autor).

**17. `commercial.sapling` — `commercial.ts` + `adapters/sapling.ts`**
Adaptador completo según la documentación oficial: `POST /api/v1/aidetect`,
`zero_retention: true` por defecto, sin `create_report` bajo ninguna
configuración, límite de 200 000 caracteres, `sent_scores`, `version`. Publica
solo campos normalizados. **No verificado en vivo.**

**18. `commercial.gptzero` — `commercial.ts` + `adapters/gptzero.ts`**
`POST /v2/predict/text` con `x-api-key`; normaliza `documents[0]`, probabilidades
de clase y oraciones. **No verificado en vivo.**

**19. `commercial.mock` — `adapters/mock.ts`**
Determinista, con semilla derivada del texto. Requiere `UMBRAL_ALLOW_MOCK=true`
**y** consentimiento explícito. Marca todo con `simulated: true` y el agregador lo
descarta. **No participa nunca en un resultado real** (prueba:
`tests/aggregator.test.ts`).

---

## 4. Capa D: auditoría del agregador

### 4.1 Problema de fondo

La versión auditada tenía la arquitectura correcta y la interpretación
equivocada. El código decía «una familia = un voto» —bien— pero:

1. agrupaba por *etiqueta de familia* descriptiva, no por **dependencia
   estadística real**, de modo que `entropy` (información) y
   `predictability` (información) votaban en grupos distintos si sus etiquetas
   diferían, y `syntax` votaba en «superficie lingüística» midiendo en realidad
   longitudes de oración como `rhythm`;
2. publicaba un «acuerdo» numérico;
3. presentaba el índice junto a ese acuerdo, lo que invitaba a leerlo como
   probabilidad;
4. inventaba un rango de ±20 cuando solo había una familia;
5. permitía que un índice se calculara con una única fuente de evidencia.

### 4.2 Diseño vigente

```
wᵢ     = peso_validación(metaᵢ) × peso_evidencia(runᵢ)
s_g    = Σ_{i∈g} wᵢ·sᵢ / Σ_{i∈g} wᵢ
c_g    = peso_tipo(mejor tipo del grupo) × peso_validación(mejor validación) × evidencia media
índice = round(100 · Σ c_g·s_g / Σ c_g)
```

Condiciones para calcularlo: **≥ 2 grupos con señal** y **≥ 80 palabras**. Si no,
`signalIndex: null`, `signalBand: "no calculable"` y motivo textual. No se
sustituye por 0.

Tabla de pesos (`KIND_BASE_WEIGHT`): comercial 1,00 · clasificador 0,90 ·
académico 0,80 · estadístico 0,70 · lingüístico 0,35.
`VALIDATION_WEIGHT`: externa 1,00 · interna 0,90 · proveedor 0,75 · sin evaluar
0,55 · heurístico 0,30 · descriptivo 0,20.
`EVIDENCE_WEIGHT`: alta 1,00 · media 0,80 · baja 0,50 · insuficiente 0,20.

### 4.3 Las once preguntas del encargo

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Recibir resultados de varios motores | ✅ | `orchestrator.ts` agrega 19 ejecuciones con estado independiente |
| Agrupar por familias metodológicas | ✅ | 11 grupos declarados en `dependenceCluster` |
| Penalizar motores correlacionados/duplicados | ✅ | un grupo = un voto; `sharesVarianceWith` documenta la correlación entre grupos |
| Índice 0–100 descriptivo, **no** probabilidad | ✅ | `indexKind: "heuristic-composite"`, `calibrated: false`, aviso en la respuesta y en la interfaz |
| Probabilidad solo con calibración validada | ✅ | `probability: null` con explicación; no hay atajo |
| Nivel de evidencia | ✅ (redefinido) | ahora mide **cobertura metodológica**, no acierto, y se declara en `evidence.definition` |
| Acuerdo entre motores | ⚠️ **No calculable** | `agreement.score = null`; se explica que exigiría decisiones binarias validadas |
| Desacuerdos explícitos | ✅ | se listan cuando dos grupos difieren ≥ 0,30 y se nombran ambos lados |
| Módulo editorial separado | ✅ | `/api/editorial`, 9 reglas, sin ninguna señal del detector |
| Análisis por oración/párrafo solo con puntuaciones reales | ✅ | Sapling `sentence_scores`, GPTZero `sentences[]`, entropía por oración del modelo interno (declarada como percentil, no probabilidad) |
| No emitir veredicto de autoría | ✅ | `authorshipConclusion: null` y mensaje explícito |

### 4.4 Medición real (servidor en `0.0.0.0:3000`)

Texto humano de 177 palabras (crónica con anécdota personal) y texto uniforme de
127 palabras (prosa de relleno con conectores repetidos):

| Campo | Humano | Uniforme | Lectura |
| --- | --- | --- | --- |
| `signalIndex` | 41 | 54 | diferencia de 13 puntos: **no concluyente** |
| `signalBand` | medio | medio | el mismo tramo |
| `signalRange` | [30, 61] | [34, 76] | solapamiento amplio |
| `indexKind` / `calibrated` | heuristic-composite / false | igual | — |
| `agreement.score` | `null` | `null` | no calculable |
| `dispersion.sd` | 0,144 | 0,172 | descriptivo |
| `evidence.level` | low | low | cobertura baja |
| `probability` / `authorshipConclusion` | `null` / `null` | `null` / `null` | correcto |
| Grupos con señal | 3 | 3 | todos con el mismo peso (0,193) |
| `coverage` | 15 ejecutados, 4 no disponibles | igual | — |

**Observación crítica que debe quedar escrita:** con la configuración por defecto
todos los grupos tienen el mismo peso, porque todos los motores que votan son
propios, estadísticos, sin validación y con la misma evidencia. En ese escenario
el índice **equivale a la media de las señales de grupo**: la maquinaria de pesos
no aporta nada hasta que participa un motor mejor validado. Se documenta en
`docs/METHODS.md` §4 en lugar de dejar creer que la ponderación está haciendo un
trabajo que no hace.

Además, los dos textos caen en la misma banda y sus rangos se solapan casi por
completo: **el índice no separa estos dos casos**, y el sistema lo dice.

---

## 5. Auditoría matemática

### 5.1 Método

No basta con que las funciones devuelvan «un número». Se recalcularon a mano los
valores de cada fórmula y se fijaron como pruebas (`tests/math.test.ts`, 29 casos):

| Fórmula | Verificación | Resultado |
| --- | --- | --- |
| Entropía de Shannon, 4 símbolos equiprobables | `log₂4` | 2 bits exactos |
| Entropía de `[3,1]` | `−(0,75·log₂0,75 + 0,25·log₂0,25)` | 0,8112781244591328 |
| Entropía de distribución vacía | límite | 0, sin `NaN` |
| Varianza muestral `[2,4,4,4,5,5,7,9]` | cálculo directo | 4,571428… |
| K de Yule, N = 12, Σnᵢ² = 26 | `10⁴·(26−12)/144` | 972,22… |
| D de Simpson `[3,1]` | `6/12` | 0,5 |
| Coseno y Jaccard | casos límite | 0 y 1 exactos |
| Pendiente de Zipf con < 3 tipos | regresión indefinida | `null` |
| Cuantiles | interpolación lineal | coincide con cálculo manual |

### 5.2 Defectos matemáticos encontrados y corregidos

**M1. `round()` convertía `NaN` e `Infinity` en 0.** El helper de métricas
redondeaba sin comprobar finitud, así que una división por cero aparecía en la
interfaz como **«0»**, que es un valor con significado. Corregido: si el valor no
es finito, la métrica es `null` y el motor lo declara.

**M2. Media condicionada en redundancia** (sesgo de selección). Ver §3.2, motor 9.

**M3. MTLD devolvía 0 por debajo del mínimo.** Corregido a `null`: no hay
evidencia, no hay cero.

**M4. Base de la compresión no equivalente.** Ver §3.2, motor 8.

**M5. AUROC con empates.** `scripts/evaluate-aggregator.mjs` asignaba a los
empates el rango mínimo, lo que producía **AUROC = 0,525** en un conjunto con
separación perfecta. Con el rango promedio correcto, el mismo conjunto da 1,000.
Es el ejemplo más claro de cifra plausible pero falsa que se detectó.

**M6. TPR a FPR = 1 % con 20 negativos.** Con 20 negativos el percentil 99 no
existe: cualquier cifra era una extrapolación. Ahora el script devuelve `null` y
explica que hacen falta ≥ 100 negativos. Se reescribieron las pruebas que
esperaban un número (no se relajó la guarda).

**M7. Intervalo bootstrap con pocos valores distintos.** Con 40 documentos y dos
valores de índice, el IC salía `[1.000, 1.000]`, una falsa sensación de precisión.
Ahora, si el índice toma menos de 5 valores distintos, el intervalo se omite y se
añade un aviso.

**M8. Alpha de Krippendorff mal planteado.** La versión anterior describía un
«acuerdo» que en realidad era una diferencia media. Se retiró la fórmula y se
sustituyó por `null` con explicación (ver §12 sobre por qué no se implementa un
kappa real todavía).

### 5.3 Propiedades comprobadas (y no solo «que no lanzan error»)

- **Idempotencia:** dos análisis del mismo texto producen el mismo índice.
- **Monotonía de las anclas:** aumentar la intensidad de un rasgo no reduce su
  señal (verificado por interpolación).
- **Independencia del simulador:** `commercial.mock` nunca altera el índice
  aunque esté activado y autorizado.
- **Degradación:** con < 80 palabras el índice es `null`; con 80–199, la evidencia
  no puede superar «media».
- **Determinismo de la referencia de compresión:** la semilla deriva del texto,
  así que dos ejecuciones dan el mismo valor (la versión anterior usaba
  `Math.random` en la referencia y el ratio variaba entre llamadas).

---

## 6. Perplejidad y previsibilidad

**Hallazgo central:** el motor llamado «perplexity» **no era una perplejidad de
modelo de lenguaje** y el nombre invitaba a compararlo con GPTZero, Binoculars o
DetectGPT. Eso es exactamente el tipo de conclusión injustificada que la
auditoría debía encontrar.

### 6.1 Qué se implementó

Entropía cruzada de un modelo de bigramas estimado con el propio documento
(leave-one-out, α = 0,1, mezcla 0,6/0,4):

```
p₁(w)   = (c(w) − 1 + α) / (N − 1 + αV)
p₂(w|a) = (c(a,w) − 1 + α) / (c(a) − 1 + αV)
p(w|a)  = 0,6·p₂ + 0,4·p₁
H       = −(1/N)·Σ log₂ p(wᵢ | wᵢ₋₁)
```

Es una medida de **autoconsistencia interna**. No usa vocabulario externo, no
comparte tokenizador con ningún LLM y sus valores **no son comparables** con
perplejidades publicadas.

### 6.2 Mediciones reales

| Métrica | Humano (144 tokens) | Uniforme (125 tokens) |
| --- | --- | --- |
| Entropía cruzada | 7,87 bits | 6,68 bits |
| Perplejidad de bigramas | 233,6 | 102,3 |
| Entropía de unigramas | 8,65 bits | 7,93 bits |
| Previsibilidad relativa | 0,909 | 0,842 |
| Bigramas ya vistos | 2,8 % | 22,4 % |
| Cobertura de vocabulario | 0,715 | 0,640 |

**Interpretación correcta:** el texto uniforme es más predecible *bajo su propio
modelo* porque repite colocaciones. Eso **no** significa que sea generado por IA:
un texto humano repetitivo (institucional, administrativo, litúrgico) produciría
el mismo patrón.

**Problema detectado:** con menos de 120 tokens, o con menos del 10 % de bigramas
repetidos, la estimación no tiene sentido (no hay bigramas que estimar). El motor
devuelve `null` y lo explica, en lugar de publicar un número de relleno. Esto
explica por qué en el texto humano de la prueba anterior la señal de este motor
está ausente: 2,8 % de bigramas vistos.

### 6.3 Por qué no se usa una perplejidad «de verdad»

GPT-2 pequeño (124 M) permitiría calcular una perplejidad real en CPU, pero:
(a) la descarga son ~500 MB y el requisito es no descargar modelos grandes sin
justificación; (b) una perplejidad de GPT-2 sobre texto en español está sesgada
por el dominio de entrenamiento; (c) sin calibración seguiría siendo una cifra sin
umbral defendible. Se documenta como trabajo futuro viable, no se simula.

---

## 7. Lengua española

Se revisó el comportamiento en español con casos construidos para fallar
(`tests/spanish.test.ts`, 17 casos):

| Caso | Antes | Ahora |
| --- | --- | --- |
| Acentos en tokens (`niño` / `nino`) | se normalizaban a ASCII y se fusionaban | se conservan como tipos distintos |
| `niño` frente a `nino` | mismos tipos | tipos diferentes (correcto) |
| Números (`2024`, `3,5`) | contaban como palabras léxicas en TTR y entropía | se separan como tokens numéricos |
| Abreviaturas (`Dr.`, `Sra.`, `etc.`) | rompían la oración en el punto | se reconocen como no finales de oración |
| Decimales (`3,5`, `1.000`) | partían la oración | se tratan como un solo token numérico |
| Signos de apertura `¿ ¡` | no se contaban | se cuentan y se evalúa su presencia |
| Diálogo con guiones | se fusionaba con la línea siguiente | se segmenta |
| `«»`, `“”`, `''` | solo se reconocían comillas rectas | se reconocen las tres parejas |
| Párrafos separados por línea en blanco | se contaban mal en estructura | un solo segmentador para todo |
| Conector inicial repetido | doble conteo | contado una vez |
| Concordancia de idioma | un motor español se ejecutaba sobre texto inglés | se verifica compatibilidad antes de ejecutar |

**Limitación que se mantiene y se declara:** `countSyllablesEs` cuenta grupos
vocálicos como una sílaba cuando son diptongos, pero **no resuelve hiatos**
(`po-e-ta`, `Ra-úl`), ni palabras con `ü`, ni extranjerismos. Los índices de
legibilidad en español son, por tanto, aproximados (±5–10 % en el recuento
silábico). Se indica en la ficha del motor.

**Sobre `szigrisztPazos` e `inflesz`:** no son duplicados exactos. INFLESZ es la
misma escala de Szigriszt-Pazos con **bandas de interpretación** redefinidas
(barrido de 2007 sobre población española). Se mantienen ambos, con nota
explícita de que la diferencia es la banda, no la fórmula, para que nadie sume
dos «índices de legibilidad independientes».

---

## 8. APIs

### 8.1 Rutas y comportamiento medido

| Ruta | Método | Verificado | Notas |
| --- | --- | --- | --- |
| `/api/health` | GET | ✅ 200 | `enginesRegistered: 19`, `externalSending: false`, comprobaciones de segmentación y compresión |
| `/api/engines` | GET | ✅ 200 | 19 motores, todos con `dependenceCluster`; 11 grupos |
| `/api/analyze` | POST | ✅ 200 | análisis completo con agregado, editorial y cobertura |
| `/api/analyze/stream` | POST | ✅ 200 SSE | `event: start`, luego `event: engine` por motor; cierre seguro |
| `/api/editorial` | POST | ✅ 200 | 9 reglas, independiente del detector |
| `/api/providers` | GET | ✅ 200 | estado y configuración, **nunca** la clave |
| `/api/analyze` con cuerpo de 3 MB | POST | ✅ **413** | rechazado antes de cargar todo en memoria |
| Ráfaga de 30+ peticiones/min | POST | ✅ **429** con `Retry-After` | límite por cliente |

### 8.2 Defectos de API corregidos

- **Cuerpo sin límite.** `await request.json()` leía el cuerpo completo antes de
  que Zod aplicara el máximo de caracteres. Un cuerpo de 1 GB agotaba la memoria.
  Ahora `readJsonLimited()` comprueba `Content-Length`, corta la lectura por
  trozos y devuelve `413` con `payload_too_large` (clave unificada en las dos
  rutas; antes el stream usaba `too_large` y la otra ruta otra distinta).
- **`coverage.enginesRegistered` era en realidad «motores ejecutados».** La
  interfaz mostraba «19 registrados» cuando el número correcto era 15 ejecutados
  y 4 no disponibles. Ahora hay cinco contadores separados y no se solapan.
- **SSE sin abortar.** Si el cliente cerraba la pestaña, el orquestador seguía
  analizando. Ahora se propaga `request.signal` y el stream se cierra en
  `finally` sin dejar el temporizador de latido vivo.
- **Respuesta no determinista en compresión** (ver M3): dos llamadas idénticas
  daban ratios distintos, lo que rompía la deduplicación y confundía al usuario.

---

## 9. Seguridad y privacidad

### 9.1 Hallazgo grave: exposición del payload del proveedor

`commercial.ts` incluía `raw: json` dentro de las métricas. Ese objeto contenía,
para Sapling o GPTZero, **el texto del usuario, las oraciones segmentadas y
miles de probabilidades por token**. Se devolvía al navegador, se guardaba en el
estado de React y se exportaba en el JSON. Corregido: `raw` eliminado por
completo; solo se publican campos normalizados.

### 9.2 Hallazgo grave: huella del texto en la respuesta

`analysis.text` incluía `hash`, el prefijo SHA-256 del documento. Aunque no
guardaba el texto, permitía comprobar si dos envíos tenían el mismo contenido
(por ejemplo, para identificar a un autor entre peticiones). Corregido: el
identificador de la petición es un UUID aleatorio y `stored: false` se mantiene.

### 9.3 Hallazgo grave: rate limit eludible

El cubo se elegía por la **primera** entrada de `x-forwarded-for`, que la escribe
el cliente. Bastaba cambiarla en cada petición para saltarse el límite por
completo. Corregido: `x-real-ip` con prioridad y, en su defecto, la **última**
entrada de `x-forwarded-for` (la que añade el proxy más cercano). Cubierto por
pruebas en `tests/api.test.ts`.

### 9.4 Otros hallazgos y estado

| Hallazgo | Estado |
| --- | --- |
| La clave podía aparecer en el mensaje de error propagado desde el proveedor | redacción con `[clave-oculta]` antes de publicar |
| Cierre del stream sin `abort` | corregido (`request.signal`) |
| Cleanup del rate limit borraba todos los cubos al superar 5000 entradas | se eliminan solo los expirados |
| `commercial.mock` exigía consentimiento pero no `UMBRAL_ALLOW_MOCK` en una ruta | ambas condiciones, comprobadas en `quota.ts` y en la ruta |
| Presupuesto de caracteres del mock consumía cuota | `charBudgetFor("mock")` devuelve `Number.MAX_SAFE_INTEGER`: no hay petición externa, no hay gasto |
| Logs del servidor | solo errores, **sin texto** |

### 9.5 Garantías reales frente a promesas

| Se afirma | ¿Es cierto? |
| --- | --- |
| «No se almacena texto» | ✅ no hay base de datos ni escritura en disco; el único estado es memoria del proceso |
| «Sin telemetría» | ✅ no hay analítica ni cookies de seguimiento |
| «Claves solo en el servidor» | ✅ las claves se leen en módulos de servidor (`UMBRAL_*`, `SAPLING_API_KEY`, `GPTZERO_API_KEY`); el código no usa ninguna variable `NEXT_PUBLIC_*` (búsqueda en `src/`) ni las rutas las devuelven |
| «Rate limiting protege el servicio» | ⚠️ **parcial**: protege por instancia, no globalmente (ver `docs/PRIVACY.md`) |
| «Retención cero en Sapling» | ⚠️ se *solicita* `zero_retention: true`; no se puede garantizar el comportamiento del proveedor |
| «Consentimiento por petición» | ✅ verificado: sin marca explícita, el adaptador no se invoca |

---

## 10. Defectos encontrados

Severidad: **C** crítica (afirmación falsa, fuga de datos, seguridad eludible) ·
**A** alta (métrica incorrecta o método distinto del declarado) · **M** media
(comportamiento incorrecto en casos límite) · **B** baja (robustez, ergonomía).

| # | Sev. | Defecto | Dónde | Estado |
| --- | --- | --- | --- | --- |
| D1 | C | «Acuerdo» numérico sin base estadística | `aggregator/index.ts` | ✅ `null` + motivo |
| D2 | C | Índice presentado junto a cifras que sugerían probabilidad | agregador + interfaz | ✅ `indexKind`, `calibrated`, avisos |
| D3 | C | Payload crudo del proveedor devuelto al cliente | `engines/commercial.ts` | ✅ eliminado |
| D4 | C | Prefijo SHA-256 del texto en la respuesta | `analysis.ts` | ✅ UUID |
| D5 | C | Rate limit eludible con `x-forwarded-for` | `rate-limit.ts` | ✅ última entrada + `x-real-ip` |
| D6 | C | Cuerpo HTTP sin límite antes de Zod | rutas `/api/analyze*` | ✅ `readJsonLimited` + 413 |
| D7 | A | Compresión comparaba texto con puntuación contra palabras barajadas | `compression.ts` | ✅ barajado de bytes |
| D8 | A | Redundancia: media solo sobre pares con solapamiento | `redundancy.ts` | ✅ todos los pares |
| D9 | A | Entropía/TTR contaban números como palabras léxicas | `tokenize.ts` | ✅ tokens numéricos separados |
| D10 | A | Un solo segmentador cacheado para todos los idiomas | `text/tokenize.ts` + `analysis.ts` | ✅ por locale |
| D11 | A | Estructura contaba oraciones con otra regex | `structure.ts` | ✅ segmentador común |
| D12 | A | `round()` convertía `NaN`/`Infinity` en 0 | `helpers.ts` | ✅ `null` si no finito |
| D13 | A | MTLD = 0 con pocas palabras | `diversity-lexical.ts` | ✅ `null` |
| D14 | A | «Hapax medio por tipo» trivial | `diversity-lexical.ts` | ✅ `hapaxShareOfTokens` |
| D15 | A | Conector inicial contado dos veces | `connectors.ts` | ✅ una vez |
| D16 | A | Participios -ado/-ido contados como verbo conjugado | `morphosyntax.ts` | ✅ excluidos |
| D17 | A | Pronombres solo en español; «que» duplicado | `stylometry.ts` | ✅ por idioma, sin duplicado |
| D18 | A | Motor «perplexity» sin declarar que no es de un LM | `predictability.ts` | ✅ renombrado + `isLanguageModelPerplexity: "no"` |
| D19 | A | `coverage.enginesRegistered` contaba ejecutados | `orchestrator.ts` | ✅ cinco contadores |
| D20 | A | Rango ±20 inventado con una sola familia | agregador | ✅ dispersión real o `null` |
| D21 | A | Entrenamiento elegía modelo por AUC de test (fuga) | `ml/train.py` | ✅ CV por grupo |
| D22 | A | AUROC con empates asignaba rango mínimo | `evaluate-aggregator.mjs` | ✅ rango promedio |
| D23 | M | TPR@FPR con 20 negativos | script | ✅ `null` si < 100 |
| D24 | M | IC bootstrap con 2 valores distintos | script | ✅ omitido |
| D25 | B | Offsets de Sapling en code points tratados como UTF-16 | `adapters/sapling.ts` | ✅ conversión + prueba |
| D26 | A | Un motor inexistente en `engines` devolvía **200 con cero motores ejecutados**: un informe vacío que parecía un análisis correcto | rutas `/api/analyze*` | ✅ 400 `unknown_engines` |

**Distribución:** 6 críticos · 17 altos · 2 medios · 1 bajo. Todos corregidos.

---

## 11. Correcciones aplicadas

Cada corrección va acompañada de una prueba que **falla si se reintroduce el
defecto**, no solo de un cambio de código.

| Defecto | Archivo | Cambio | Prueba de regresión |
| --- | --- | --- | --- |
| D1, D2 | `src/lib/aggregator/index.ts` | reescritura: grupos, `null` explícito, `disagreements`, `bandThresholds` | `tests/aggregator.test.ts` (12 casos) |
| D3 | `src/lib/engines/commercial.ts` | sin `raw`; solo campos normalizados | `tests/audit-fixes.test.ts` |
| D4 | `src/lib/analysis.ts` | UUID en lugar de hash | `tests/api.test.ts` (sin huellas) |
| D5 | `src/lib/rate-limit.ts` | `x-real-ip`, última XFF, limpieza acotada | `tests/api.test.ts` (3 casos) |
| D6 | `src/lib/http.ts` + rutas | `readJsonLimited`, `payload_too_large` | `tests/api.test.ts` (413 en dos rutas) |
| D7 | `src/lib/engines/compression.ts` | barajado de bytes, `baselineBytes` | `tests/audit-fixes.test.ts` (determinismo) |
| D8 | `src/lib/engines/redundancy.ts` | media sobre todos los pares | `tests/audit-fixes.test.ts` |
| D9 | `src/lib/text/tokenize.ts` | separación de tokens numéricos | `tests/math.test.ts`, `tests/spanish.test.ts` |
| D10 | `src/lib/text/tokenize.ts`, `src/lib/analysis.ts` | segmentador por locale, elegido con el idioma detectado | `tests/segmentation.test.ts` |
| D11–D17 | motores respectivos | ver tabla §10 | `tests/engines.test.ts`, `tests/spanish.test.ts` |
| D18 | `src/lib/engines/predictability.ts` | `bigramPerplexity`, `isLanguageModelPerplexity` | `tests/engines.test.ts` |
| D19 | `src/lib/orchestrator.ts` | cobertura con cinco contadores | `tests/orchestrator.test.ts` |
| D20 | agregador | `signalRange` real o `null` | `tests/aggregator.test.ts` |
| D21 | `ml/train.py` | `GroupKFold`, licencia obligatoria | ejecución real con datos de humo |
| D22–D24 | `scripts/evaluate-aggregator.mjs` | rango promedio, guardas de muestra | `tests/eval-metrics.test.ts` (13 casos) |
| D25 | `src/lib/adapters/sapling.ts` | `codePointToUtf16` | `tests/adapters.test.ts` (2 casos) |
| D26 | `src/lib/http.ts` + ambas rutas | `unknownEngineIds()`; 400 con la lista | `tests/api.test.ts` (2 casos) |

Documentación actualizada en el mismo cambio: `README.md`, `ARCHITECTURE.md`,
`docs/METHODS.md` (reescrito con las fórmulas vigentes), `docs/PRIVACY.md`
(limitaciones reales), `docs/ENGINES.md` (regenerado con grupos de dependencia).

---

## 12. Lo que no se corrigió y no se puede afirmar

1. **No hay calibración.** Sin corpus etiquetado con licencia no se puede
   convertir el índice en probabilidad ni fijar umbrales. El sistema lo declara;
   no hay forma de arreglarlo con código.
2. **Los anclas de señal son hipótesis.** Las tablas de anclas (`0,85` a `−1,0`
   de burstiness, etc.) son decisiones razonadas a partir de la literatura, no
   estimaciones. Están publicadas para que se puedan discutir.
3. **No hay detección académica (capa C).** Cero motores de ese tipo. La
   arquitectura la reserva, pero implementarla exige GPU y modelos de miles de
   millones de parámetros.
4. **El clasificador ML está deshabilitado.** Entrenarlo requiere corpus y
   licencia; el vector de 22 características y la paridad TS↔Python están listos.
5. **Sin llamadas reales a proveedores.** Los adaptadores están escritos contra
   la documentación y probados con fixtures; su comportamiento frente a errores
   reales del servicio, límites de tasa del proveedor y variaciones de esquema no
   está verificado.
6. **Sin pruebas E2E ejecutadas.** Hay 3 specs de Playwright escritos; no hay
   Chromium en el entorno. No se afirma que la interfaz funcione en un navegador
   real: solo que el HTML se renderiza en jsdom (`tests/render.test.tsx`).
7. **Rate limiting por instancia.** No es una protección global; requiere almacén
   distribuido.
8. **El acuerdo sigue sin calcularse.** Implementar kappa exigiría que cada motor
   emitiera una decisión binaria validada. Hoy no la emiten; inventar la decisión
   para poder calcular el acuerdo sería el mismo error que se acaba de corregir.
9. **Análisis morfosintáctico real ausente.** `morphosyntax.profile` es
   experimental y usa sufijos; no hay lematizador ni etiquetador.
10. **`countSyllablesEs` no resuelve hiatos.** Legibilidad aproximada.
11. **Idiomas.** Solo español e inglés, con listas cerradas. Portugués, francés o
    catalán no están soportados aunque los proveedores sí los ofrezcan.
12. **Prosa larga y literaria.** Los estadísticos asumen texto continuo; poesía,
    listas, tablas y código producen valores sin sentido interpretativo.

---

## 13. Pruebas ejecutadas

### 13.1 Typecheck y compilación

```
$ npx tsc --noEmit
(sin salida — 0 errores)

$ npm run build
✓ Compiled successfully
Route (app)                    Size
┌ ○ /                          ...
├ ƒ /api/analyze
├ ƒ /api/analyze/stream
├ ƒ /api/editorial
├ ƒ /api/engines
├ ƒ /api/health
└ ƒ /api/providers
```

### 13.2 Verificación reproducible (`scripts/verify.sh`)

Primera ejecución completa del script de verificación (tipos → pruebas → build →
servidor efímero y comprobaciones HTTP). Termina con código 0 y sin servidores
huérfanos:

```
$ ./scripts/verify.sh
== 1/4 TypeScript estricto ==
== 2/4 Pruebas automatizadas ==
== 3/4 Build de producción ==
== 4/4 Comprobación de endpoints (servidor efímero) ==
-- health --   {"status":"ok","enginesRegistered":19,"mlModelLoaded":false,"externalSending":false}
-- engines --  19 motores, 15 propios, sin grupo de dependencia: 0
-- analyze --  indice None no calculable · evidencia low · acuerdo no calculable · motores_ok 15
-- cuerpo de 3 MB (se espera 413) --  HTTP 413
OK: verificación completa
EXIT=0
```

El `indice None` es el comportamiento correcto: el texto de ejemplo del script
tiene menos de 80 palabras. El script **falla** (código ≠ 0) si algún motor queda
sin grupo de dependencia, si el análisis devuelve una probabilidad, un veredicto
de autoría, un acuerdo numérico o una huella del texto, o si el cuerpo grande no
se rechaza con 413.

### 13.3 Batería de pruebas

```
$ npx vitest run
Test Files  13 passed (13)
     Tests  185 passed (185)
  Duration  ~4 s
```

Desglose por archivo: `math` (29), `stats` (15), `segmentation` (9), `engines`
(12), `aggregator` (12), `adapters` (23), `orchestrator` (15), `api` (17),
`audit-fixes` (14), `spanish` (17), `feature-parity` (5), `render` (4),
`eval-metrics` (13). Total: 185.

### 13.4 Comprobaciones en vivo (servidor `next start` en `0.0.0.0:3000`)

| Comprobación | Resultado |
| --- | --- |
| `GET /api/health` | `{"status":"ok","enginesRegistered":19,"mlModelLoaded":false,"externalSending":false}` |
| `GET /api/engines` | 19 motores, 15 propios, **0 sin `dependenceCluster`** |
| `POST /api/analyze` (humano, 177 palabras) | índice 41, banda media, 3 grupos, evidencia baja, `agreement: null` |
| `POST /api/analyze` (uniforme, 127 palabras) | índice 54, banda media, 3 grupos, evidencia baja, `agreement: null` |
| `POST /api/analyze/stream` | eventos `start` y `engine` por motor, sin errores |
| `POST /api/analyze` con 3 MB (`Content-Length`) | **413** `payload_too_large` |
| `POST /api/analyze` con 3 MB **por trozos, sin `Content-Length`** | **413** `payload_too_large`: la lectura se corta, no se confía en la cabecera |
| `POST /api/editorial` | 200 con 2 sugerencias (`generalidad`, `repetición`) y descargo de independencia |
| 40 peticiones en ráfaga | 29 × 200 y 11 × **429**, con `Retry-After: 55` y mensaje en castellano |
| Texto vacío / campo ausente / idioma inválido | 400 `invalid_request` con `issues` por campo |
| `engines: ["no.existe"]` | 400 `unknown_engines` (antes: 200 con cero motores) |
| `GET /api/analyze` | 405 |
| JSON malformado | 400 `invalid_json` |
| Consentimiento de `mock` sin `UMBRAL_ALLOW_MOCK` | motor `unavailable`, nota «Simulación desactivada», `externalProvidersContacted: []` |

### 13.5 Evaluación con corpus sintético: el AUROC que no significa nada

`scripts/make-smoke-corpus.mjs` genera 40 documentos **sintéticos** (20 narrativos,
20 de relleno genérico) para probar el pipeline de evaluación. Advertencia en el
propio script: no es un corpus de validación.

Primera ejecución, con las frases narrativas repetidas al final de cada documento
(un fallo del generador):

| Métrica | Valor |
| --- | --- |
| AUROC del índice | **0,000** |
| Media humano / IA | 62,4 / 52,3 |

Un AUROC de 0,000 significa que el índice ordena **al revés**: los textos con
frases duplicadas —más repetitivos, más previsibles— recibían *menos* intensidad.
Es decir: un artefacto trivial del corpus invirtió el resultado por completo.

Corregido el generador (sin duplicados), misma muestra:

| Métrica | Valor |
| --- | --- |
| AUROC del índice | **0,988** (IC bootstrap 0,957–1,000) |
| AUPRC | 0,981 |
| Media humano / IA | 49,4 / 54,2 |
| Valores distintos del índice | 11 |
| TPR@FPR = 1 % | **no informable** (20 negativos; hacen falta ≥ 100) |

**Las dos cifras se refieren al mismo sistema y a la misma tarea, y difieren en
0,99.** La primera se produjo introduciendo repetición artificial; la segunda, con
dos estilos claramente distintos por construcción (prosa personal frente a relleno
con conectores). Ninguna mide capacidad de detectar autoría: miden **separación de
estilo en una muestra fabricada**.

Este es el motivo por el que el producto no publica probabilidades: un AUROC de
0,988 en un corpus sintético es exactamente el tipo de número que se cita fuera de
contexto para vender un detector. El script añade avisos, exige ≥ 100 negativos
para el punto de operación y se niega a extrapolar.

Observación adicional del mismo experimento: la señal de `entropy.lexical` apuntó
en dirección **contraria** (AUROC 0,083) mientras `repetition.ngram` acertaba
(1,000). Los motores no son votos independientes que se refuercen: miden cosas
distintas y pueden contradecirse, que es justo lo que el agregador debe mostrar y
no promediar a la fuerza.

### 13.6 Entrenamiento ML

```
$ python3 ml/train.py --data /tmp/train-smoke.jsonl --out /tmp/train-out --export
dedupe: 40 → 9 documentos
CV: no calculable (4 muestras efectivas)
export: rechazado (faltan ≥ 200 documentos y licencia declarada)
```

Comportamiento correcto: el script se niega a producir un artefacto con datos
insuficientes en lugar de generar un modelo inútil que pareciera entrenado.

---

## 14. Preparación para producción

| Requisito | Estado | Comentario |
| --- | --- | --- |
| Funciona sin APIs comerciales | ✅ | 15 motores propios, capas B/C en `unavailable` declarado |
| Compila y arranca | ✅ | build de producción verificado |
| Pruebas automatizadas | ✅ | 185, incluidas regresiones de cada defecto |
| Sin gasto involuntario | ✅ | presupuesto en caracteres, cuota en memoria, consentimiento por petición, mock sin cuota |
| Privacidad por defecto | ✅ | sin persistencia, sin huellas, sin payload crudo, `externalSending: false` |
| Límites de entrada | ✅ | 30 000 caracteres y 1,5 MB de cuerpo con 413 |
| Rate limiting | ⚠️ | por instancia; no global |
| Almacenamiento distribuido de cuotas | ❌ | pendiente para uso público |
| Observabilidad | ❌ | sin métricas ni trazas; solo logs de error |
| Accesibilidad | ⚠️ | estructura semántica y `aria-label` presentes; sin auditoría con lector de pantalla |
| E2E en navegador | ❌ | specs escritos, no ejecutados |
| Validación científica | ❌ | sin corpus; el índice es heurístico y así se declara |
| Documentación de límites | ✅ | `METHODS.md`, `PRIVACY.md`, este informe |

**Veredicto de despliegue:** apto para uso interno y demostración con las
limitaciones declaradas; **no apto** para decisiones sobre personas (evaluación
académica, selección de personal, moderación) sin calibración previa y revisión
humana.

---

## 15. Conclusión

Umbral hace lo que dice hacer en las capas que están implementadas: mide el texto
con 15 analizadores propios reales, ejecuta un agregador que agrupa por
dependencia, distingue con claridad motor propio / comercial / simulado, declara
qué se ejecutó y qué no, y se niega a producir cifras que no puede sostener.

La auditoría encontró **26 defectos**, incluidos seis que habrían permitido
afirmaciones falsas o filtración de datos. Todos están corregidos; 25 con prueba
automatizada de regresión. Lo que queda no son errores de código sino **límites del conocimiento
disponible**: sin corpus etiquetado no hay probabilidad, sin proveedores
accesibles no hay validación externa, sin GPU no hay detección académica.

La afirmación más honesta que el sistema puede hacer hoy es esta:

> Este texto presenta estas propiedades medibles, agrupadas en estas familias
> metodológicas, con este grado de cobertura y estas discrepancias internas. No
> sabemos si lo escribió una persona o una máquina, y este sistema no puede
> saberlo con los datos de los que dispone.

Un detector que dice eso es más útil —y más difícil de vender— que uno que
publica «94 % de acuerdo».
