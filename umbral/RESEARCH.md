# Investigación previa al desarrollo

**Fecha de consulta:** 2026-10-30
**Alcance:** métodos académicos de detección, proveedores comerciales con API, conjuntos de datos y requisitos de ejecución en el entorno real disponible.

## Cómo leer este documento

Cada afirmación lleva una marca de procedencia:

| Marca | Significado |
| --- | --- |
| **[H]** | Hecho verificado en documentación oficial o repositorio original durante esta sesión. |
| **[P]** | Afirmación del proveedor (precisión, cuotas, precios) no replicada de forma independiente. |
| **[S]** | Fuente secundaria (revisión, benchmark, agregador) que no he podido contrastar con la fuente primaria. |
| **[X]** | Hipótesis o decisión propia del equipo, no un hecho. |
| **[U]** | No verificado: la documentación no era accesible en esta sesión o no se localizó. |

Entorno real de esta sesión: Linux x86_64, Node 22.22.3, Python 3.11.2, 2 vCPU, 3.8 GB de RAM, **sin GPU**, sin Docker, sin Chromium. La red saliente del servidor solo permite npm, PyPI y GitHub; no se puede llamar a APIs comerciales desde el backend de este sandbox. Todas las comprobaciones de conectividad comercial son, por tanto, de contrato y de código, no de extremo a extremo.

---

## 1. Métodos académicos

### 1.1 DetectGPT

- **Publicación:** Mitchell et al., *DetectGPT: Zero-Shot Machine-Generated Text Detection using Probability Curvature*, ICML 2023.
- **Metodología:** se perturba el texto con un modelo de parafraseo, se puntúa cada variante con un modelo de lenguaje y se mide la curvatura de la log-probabilidad. El texto generado ocupa máximos locales de probabilidad.
- **Requisitos:** un LM de referencia (GPT-2 en el trabajo original) y ~100 perturbaciones por texto. Coste alto.
- **Español:** el método es independiente del idioma en teoría, pero requiere un modelo de referencia con cobertura real de español.
- **Estado de integración:** **C — demasiado pesado para la primera versión.** Requiere PyTorch y pesos de cientos de MB a GB, y una GPU para latencias razonables. No se descargan pesos automáticamente.

### 1.2 Fast-DetectGPT

- **Publicación:** Bao et al., *Fast-DetectGPT: Efficient Zero-Shot Detection of Machine-Generated Text via Conditional Probability Curvature*, ICLR 2024. Repositorio: `baoguangsheng/fast-detect-gpt`. **[H]** (README del repositorio)
- **Metodología:** sustituye las perturbaciones por muestreo analítico de la curvatura de probabilidad condicional. Reporta hasta **340× de aceleración** y mejoras relativas de precisión de ~74–76 % frente a DetectGPT; AUROC hasta 0.9887. **[H]**
- **Requisitos:** Python 3.8 + PyTorch 1.10; modelos de muestreo y puntuación (gpt-neo-2.7B por defecto; falcon-7b o Llama3-8B para mayor precisión). Los experimentos se ejecutaron en **una A100 de 80 GB**. **[H]**
- **Español:** no hay modelo específico para español en la implementación publicada; usar gpt-neo-2.7B como sustituto es una extrapolación **no validada** para español. **[X]**
- **Estado:** **C.** Sin GPU y con ~3.8 GB de RAM no es viable ejecutar siquiera gpt-neo-2.7B con latencia aceptable.

### 1.3 Binoculars

- **Publicación:** Hans et al., *Spotting LLMs With Binoculars: Zero-Shot Detection of Machine-Generated Text*, ICML 2024. Repositorio: `ahans30/Binoculars`. **[S]**
- **Metodología:** razón entre la perplejidad observada (modelo «observer») y la perplejidad cruzada (modelo «performer»). No requiere entrenamiento.
- **Requisitos:** dos LLM emparejados (base + instruct). Un benchmark reciente reporta el uso de una L40S de 48 GB para Binoculars y Fast-DetectGPT. **[S]**
- **Rendimiento publicado:** en un benchmark independiente de 2026, es el detector con mejor TPR@FPR=1 % del conjunto evaluado (58 %). **[S]**
- **Español:** depende del par de modelos; los pares recomendados son mayoritariamente ingleses. **No validado en español.**
- **Estado:** **B — viable con recursos adicionales gratuitos** (p. ej. par Qwen2.5-3B + instruct en una máquina con ~12 GB de RAM/GPU), pero **no en el sandbox actual**.

### 1.4 LogRank / DetectLLM

- **Publicación:** Su, Zhuo, Wang, Nakov, *DetectLLM: Leveraging Log Rank Information for Zero-Shot Detection of Machine-Generated Text*, Findings EMNLP 2023. Repositorio: `mbzuai-nlp/DetectLLM`. **[H]**
- **Metodología:** dos variantes. `DetectLLM-LRR` (sin perturbaciones) usa la razón entre log-verosimilitud y log-rango; `DetectLLM-NPR` (con perturbaciones) mide el cambio normalizado del log-rango. Reporta +3.9 y +1.75 puntos de AUROC sobre el estado del arte. **[H]**
- **Requisitos:** un modelo de referencia (el original usa modelos tipo GPT-2/LLaMA) y acceso a log-probabilidades por token.
- **Rendimiento en condiciones duras:** TPR@FPR=1 % de solo 9 % en un benchmark con generadores no vistos. **[S]**
- **Estado:** **C.** Requiere pesos y PyTorch; la variante LRR sería ligera con un modelo pequeño, pero sin modelo en español validado no aporta evidencia defendible.

### 1.5 PHD

- **Identificación:** detector incluido en el benchmark **RAID** (Dugan et al., 2024) junto a Binoculars, Fast-DetectGPT, LogRank, RADAR, Wild y T5Sentinel. **[S]**
- **Rendimiento en condiciones duras:** TPR@FPR=1 % de 8 %. **[S]**
- **Repositorio / metodología:** **no localizada ni verificada** en esta sesión. No se documenta aquí su método para no inventarlo. **[U]**
- **Estado:** **D — no integrable actualmente** por falta de implementación de referencia verificada y de validación en español.

### 1.6 RADAR

- **Publicación:** Hu, Chen, Ho, *RADAR: Robust AI-Text Detection via Adversarial Learning*, NeurIPS 2023. **[S]**
- **Metodología:** entrenamiento adversarial conjunto de un parafraseador y un detector; el parafraseador intenta evadir y el detector se actualiza con esa señal (optimización tipo PPO).
- **Requisitos:** pesos de parafraseador + detector y entrenamiento con corpus generado por 8 LLM. **[S]**
- **Rendimiento en condiciones duras:** TPR@FPR=1 % de 5 % cuando los generadores no son los de entrenamiento. **[S]**
- **Estado:** **D.** Requiere pesos entrenados y GPU; su robustez publicada no se transfiere sin el corpus y el reentrenamiento.

### 1.7 T5Sentinel / GPT-Sentinel

- **Metodología:** reformula la detección como clasificación secuencia-a-secuencia con un T5 afinado que emite la etiqueta «human»/«AI». **[S]**
- **Requisitos:** pesos T5 afinados (cientos de MB).
- **Rendimiento en condiciones duras:** TPR@FPR=1 % de 3 %, el más bajo del benchmark citado. **[S]**
- **Español:** no hay variante española publicada en la fuente consultada. **[U]**
- **Estado:** **C.** Viable técnicamente con ONNX en CPU, pero sin modelo español validado sería una extrapolación injustificada del inglés.

### 1.8 Otros métodos relevantes identificados

| Método | Idea | Estado |
| --- | --- | --- |
| **GLTR** (Gehrmann et al., 2019) | Histograma de rangos de token bajo un LM; visualización de previsibilidad | **B**: conceptualmente replicable; nuestro motor de previsibilidad mide la misma familia sin LM |
| **Watermarking** (Kirchenbauer et al., 2023) | Marca en la generación con clave; detección exacta si el modelo la aplicó | **D**: requiere control del generador; no aplica a texto de autor desconocido |
| **Metric-based / DetectGPT con perturbaciones** | Curvatura de probabilidad | **C** |
| **Compresión (variantes de gzip + kNN)** | Distancia de compresión como proxy de estilo | **A**: implementado de forma descriptiva en `compression.complexity` |
| **Estilometría clásica (Yule, Honoré, Burrows)** | Riqueza léxica y palabras funcionales | **A**: implementado |

### 1.9 Lectura crítica del rendimiento publicado

Un examen práctico de 2026 sobre siete detectores concluye que **el AUROC es un mal proxy del punto de operación real** y que, fijando FPR = 1 %, el mejor detector del estudio detecta el 58 % del texto máquina. **[S]** Consecuencia de diseño asumida en Umbral:

- No se presenta una probabilidad calibrada sin evaluación propia en el punto de operación.
- Se informa el nivel de evidencia y el acuerdo, no solo un número.
- Se distingue siempre «precisión declarada por el proveedor» de «evaluación independiente».

---

## 2. Proveedores comerciales

### 2.1 Sapling (prioridad de integración)

| Aspecto | Hallazgo | Marca |
| --- | --- | --- |
| Endpoint | `POST https://api.sapling.ai/api/v1/aidetect` | [H] |
| Autenticación | Clave de 32 caracteres (`key` en el cuerpo) o `Authorization: Bearer`; si se envían ambos, prevalece `key` | [H] |
| Límite de entrada | 200 000 caracteres por petición; se recomienda ≥ 300 | [H] |
| Idiomas | en, es, pt, fr, de, it, nl, ja (detección automática; modelo multilingüe `ml20261009` para no inglés) | [H] |
| Respuesta | `score` (0–1), `ai_fraction`, `verdict` (`human`/`mixed`/`ai`), `segments`, `sentence_scores` con offsets, `tokens` + `token_probs`, `version`, `language`, `low_confidence` + `low_confidence_reasons` | [H] |
| Retención | `zero_retention: true` disponible; por defecto `false` | [H] |
| Informes | `create_report: true` guarda el texto para generar un informe compartible; incompatible con `zero_retention` | [H] |
| Versiones | `20240606`, `20251027`, `20260820` (actual), `ml20261009` (multilingüe) | [H] |
| Precio | Desde 0,005 USD por 1000 caracteres, con descuentos por volumen | [H] |
| Cuota gratuita | Crédito de prueba para claves nuevas; **importe exacto no verificado** | [P]/[U] |
| Precisión | El propio proveedor advierte falsos positivos y falsos negativos y recomienda no interpretar el resultado como conclusión | [H] |

**Decisiones de integración:** adaptador propio en `src/lib/adapters/sapling.ts`; `zero_retention=true` por defecto; `create_report` **nunca** se envía; `sent_scores=true`; se aprovechan `segments`, `sentence_scores`, `ai_fraction`, `low_confidence` y `version`. Presupuesto de caracteres configurable (`SAPLING_CHAR_BUDGET`, por defecto 0 = sin envío).

### 2.2 GPTZero

| Aspecto | Hallazgo | Marca |
| --- | --- | --- |
| Endpoint | `POST https://api.gptzero.me/v2/predict/text` | [H] |
| Autenticación | Cabecera `x-api-key` (401 clave ausente/caducada; 403 clave no reconocida) | [H] |
| Límite de entrada | 150 000 caracteres en planes API | [H] |
| Idiomas | detección automática; modelo multilingüe para no inglés | [H] |
| Respuesta v2 | `documents[]` con `predicted_class`, `class_probabilities{human,ai,mixed}`, `confidence_category`, `document_classification`, `sentences[]` (`generated_prob`, `perplexity`, `highlight_sentence_for_ai`), `paragraphs[]`, `version`, `scanId`; se mantienen campos heredados (`completely_generated_prob`, `average_generated_prob`) | [H]/[S] |
| Uso / cuotas | `GET /v3/usage-stats` devuelve palabras usadas y restantes | [H] |
| Retención cero | No documentada | [U] |
| Precio | Por plan/volumen; no verificado por carácter | [U] |

**Decisiones:** adaptador independiente, desactivado por defecto, con parser tolerante a las dos variantes del esquema y validación estricta de la respuesta.

### 2.3 Originality.ai

- Autenticación `X-OAI-API-KEY`; límite de 500 peticiones/minuto; **la API requiere plan Enterprise**. **[H]**
- La cuenta activa **recarga automática de créditos** por defecto: riesgo económico directo. Cualquier integración futura debe desactivarla antes de emitir una petición. **[H]**
- Modelos: `model-5.0`, `model-5.0-max`, `multilang` (multilenguaje); retirada prevista de los modelos antiguos en diciembre de 2026. **[H]**
- **Estado:** no implementado. Solo se admite con autorización explícita, plan contratado y recarga automática desactivada. Coste no compatible con presupuesto 0.

### 2.4 Copyleaks

- API de escaneo en tiempo real disponible en planes de pago; detección de IA en «30+ idiomas», plagio en «100+». **[S]**
- Existe plan gratuito limitado en la interfaz web; **el acceso API no está incluido en el plan gratuito según las fuentes secundarias consultadas**. **[S]**
- **Estado:** **D** para la primera versión (sin cuota gratuita de API verificada). Documentación oficial no verificada en esta sesión.

### 2.5 Winston AI

- Autenticación con token Bearer; `POST /v2/ai-content-detection`; 1 crédito por palabra; **2000 créditos gratuitos al registrarse, sin tarjeta**. **[H]** (documentación del proveedor y SDK oficial)
- Mínimo declarado ~100 caracteres; 12 idiomas según benchmarking secundario. **[S]**
- **Estado:** **B** — técnicamente accesible con cuota gratuita, pero no implementado: fuera de la prioridad del encargo (Sapling primero) y con coste posterior no trivial.

### 2.6 Pangram

- Precio de referencia ~0,05 USD por 1000 palabras. **[S]**
- Documentación de API no consultada en esta sesión. **[U]**
- **Estado:** **U/D** — no implementado.

### 2.7 ZeroGPT, Hive, Turnitin, QuillBot, Scribbr, Writer, Crossplag

| Proveedor | API pública | Estado en Umbral |
| --- | --- | --- |
| ZeroGPT | No se ha verificado una API oficial documentada; el uso mayoritario es web | **No integrado.** No se usa scraping: sustituiría una integración inexistente y probablemente incumpliría sus términos |
| Hive | API de moderación con detección de contenido generado; precios enterprise/custom **[S]** | **D** — requiere contrato comercial |
| Turnitin | API reservada a instituciones educativas | **D** — sin acceso individual |
| QuillBot | Sin API pública de detección verificada | **No integrado** |
| Scribbr | Sin API pública verificada | **No integrado** |
| Writer | Enfocado a empresa; sin API de detección pública verificada | **No integrado** |
| Crossplag | Ofrece API de detección (planes de pago) **[U]** | **No integrado** |

**Regla aplicada:** solo se integra un proveedor si existe una API oficial, documentada y técnicamente accesible. No se automatizan cuentas personales ni se hace scraping.

### 2.8 Clasificación final de proveedores

| Clase | Criterio | Proveedores |
| --- | --- | --- |
| **A — implementado** | API oficial documentada y adaptador escrito | Sapling, GPTZero |
| **B — viable con recursos gratuitos** | Cuota gratuita real y API documentada | Winston AI |
| **C — viable con coste** | API documentada, sin cuota gratuita útil | Originality.ai, Copyleaks, Pangram |
| **D — no integrable ahora** | Enterprise, institucional o sin API | Hive, Turnitin, Crossplag, ZeroGPT, QuillBot, Scribbr, Writer |

---

## 3. Conjuntos de datos

Ninguno se ha descargado en esta sesión. La red del sandbox no permite acceder a Hugging Face y no se ha considerado justificado introducir un corpus sin revisar su licencia.

| Conjunto | Idiomas | Contenido | Licencia / acceso | Uso previsto |
| --- | --- | --- | --- | --- |
| **M4 / MULTITuD** | multilingüe, incluye español | múltiples generadores, dominios y longitudes | ver repositorio original | entrenamiento y evaluación cruzada |
| **MixSet** | en, es y otros | mezcla humano/máquina | ver repositorio | evaluación de generalización |
| **AuTexTification (IberLEF)** | es, en | tuits, noticias, artículos | condiciones de competición | evaluación específica de español |
| **RAID** (Dugan et al., 2024) | en principalmente | benchmark con 11 modelos y múltiples dominios y ataques | ver repositorio | evaluación en punto de operación TPR@FPR |
| **HC3** | incluye español | pares pregunta/respuesta humano-ChatGPT | ver repositorio | evaluación de sesgo de dominio |
| **TuringBench** | en | 19 generadores | ver repositorio | generalización entre generadores |

**Riesgos identificados [X]:**

1. Casi todos los corpus grandes están centrados en inglés; usarlos para afirmar precisión en español sería extrapolar.
2. La traducción automática introduce artefactos que el detector puede aprender como señal.
3. Los pares humano/máquina de un mismo corpus comparten tema y género: un clasificador puede aprender el tema, no el estilo.
4. La separación por fila produce fuga por autor o por generador.

**Consecuencia:** el pipeline exige `author`/`source`/`generator`, deduplica por similitud y no exporta modelo si no hay ≥ 200 documentos y ≥ 2 grupos (ver `ml/README.md`).

---

## 4. Herramientas y dependencias evaluadas

| Necesidad | Opción elegida | Motivo |
| --- | --- | --- |
| Segmentación de oraciones y palabras | `Intl.Segmenter` (Node 22) | Nativa, sin dependencias, consciente de la lengua |
| Compresión | `node:zlib` (deflate) | Nativa y determinista |
| Validación de entrada | `zod` | Contrato explícito y mensajes de error |
| Etiquetado gramatical | **No integrado** | `compromise` y `wink-pos-tagger` son solo inglés; spaCy `es_core_news_sm` (~12 MB) requeriría Python en producción |
| Embeddings | **No integrados** | Añadirían cientos de MB; sin ellos la similitud se declara léxica |
| PyTorch / transformers | **No instalados** | Sin GPU, con 3.8 GB de RAM; ningún método lo justifica en la primera versión |

**Sobre el etiquetado morfosintáctico:** se implementó un módulo **experimental** por sufijos y listas cerradas, marcado como `heuristic` y excluido del índice. No se presenta como análisis morfosintáctico de precisión. La alternativa real (spaCy) queda documentada como trabajo futuro.

---

## 5. Hipótesis propias (no hechos)

1. **[X]** En español, la combinación de previsibilidad secuencial, repetición de n-gramas y uniformidad estructural captura parte del fenómeno que los detectores comerciales aprenden de forma supervisada, pero con menor poder discriminativo.
2. **[X]** Los motores correlacionados (entropía, perplejidad y compresión) deben compartir un único voto de familia; de lo contrario, el índice se vuelve un promedio inflado de la misma medición.
3. **[X]** Un texto corto (< 200 palabras) no permite estimar previsibilidad secuencial de forma estable, ni siquiera con estimadores suavizados.
4. **[X]** La mayor parte de los falsos positivos provendrán de textos formales, traducidos o muy pautados, no del azar.

Ninguna de estas hipótesis se ha validado empíricamente en este proyecto. Se declaran como tales en la interfaz.

---

## 6. Referencias consultadas

- Sapling, *AI Detector API* — https://sapling.ai/docs/api/detector/ (consultado 2026-10-30).
- GPTZero, *API Docs* — https://docs.gptzero.me/ y referencia v2 (consultado 2026-10-30).
- Originality.ai, *API Documentation* — https://docs.originality.ai/ (consultado 2026-10-30).
- Winston AI, *API introduction* — https://docs.gowinston.ai/api-reference/introduction (consultado 2026-10-30).
- Fast-DetectGPT — https://github.com/baoguangsheng/fast-detect-gpt (consultado 2026-10-30).
- DetectLLM — https://aclanthology.org/2023.findings-emnlp.827/ y https://github.com/mbzuai-nlp/DetectLLM (consultado 2026-10-30).
- Hans et al., Binoculars (ICML 2024) — referencia secundaria vía benchmark independiente.
- Hu, Chen, Ho, RADAR (NeurIPS 2023) — referencia secundaria.
- Dugan et al., RAID (2024) — benchmark de evaluación.
- *A Practical Examination of AI-Generated Text Detectors for LLMs* (2026) — fuente secundaria con TPR@FPR=1 %.
- Shannon (1948); Yule (1944); Honoré (1979); McCarthy & Jarvis (2010); Covington & McFall (2010); Fernández Huerta (1959); Szigriszt Pazos (1992); Barrio-Cantalejo et al. (2008).
