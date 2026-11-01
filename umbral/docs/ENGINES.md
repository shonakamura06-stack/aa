# Catálogo de motores

Generado automáticamente desde `/api/engines` el 2026-10-30.
Versión del motor: `0.1.0` · **19 unidades de análisis** (15 analizadores propios).

Cada entrada distingue su naturaleza: un analizador que mide la longitud de las oraciones **no** es un modelo entrenado, y un adaptador comercial **no** es un método propio.

| # | Motor | Naturaleza | Familia | Grupo de dependencia | Validación | Direccional | Idiomas | Mín. palabras |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `entropy.lexical` | Estadístico | Información y previsibilidad | `information-theoretic` | Sin evaluación propia | sí | es/en | 80 |
| 2 | `diversity.lexical` | Estadístico | Estilometría | `lexical-richness` | Sin evaluación propia | no | es/en | 60 |
| 3 | `richness.yule` | Estadístico | Estilometría | `lexical-richness` | Sin evaluación propia | no | es/en | 100 |
| 4 | `repetition.ngram` | Estadístico | Repetición y estructura | `sequence-repetition` | Sin evaluación propia | sí | es/en | 80 |
| 5 | `rhythm.burstiness` | Estadístico | Repetición y estructura | `sentence-rhythm` | Sin evaluación propia | sí | es/en | 80 |
| 6 | `structure.regularity` | Estadístico | Repetición y estructura | `sentence-rhythm` | Sin evaluación propia | sí | es/en | 80 |
| 7 | `predictability.perplexity` | Estadístico | Información y previsibilidad | `information-theoretic` | Sin evaluación propia | sí | es/en | 120 |
| 8 | `compression.complexity` | Estadístico | Información y previsibilidad | `information-theoretic` | Descriptivo | no | es/en | 60 |
| 9 | `redundancy.similarity` | Estadístico | Repetición y estructura | `sequence-repetition` | Sin evaluación propia | sí | es/en | 100 |
| 10 | `stylometry.functionwords` | Estadístico | Estilometría | `function-word-profile` | Descriptivo | no | es/en | 100 |
| 11 | `discourse.connectors` | Lingüístico | Superficie lingüística | `discourse-markers` | Sin evaluación propia | no | es/en | 80 |
| 12 | `syntax.complexity` | Lingüístico | Superficie lingüística | `sentence-rhythm` | Heurístico | no | es/en | 80 |
| 13 | `morphosyntax.profile` | Lingüístico | Estilometría | `function-word-profile` | Heurístico | no | es/en | 120 |
| 14 | `orthography.punctuation` | Lingüístico | Superficie lingüística | `orthography` | Descriptivo | no | es/en | 50 |
| 15 | `readability.indices` | Lingüístico | Superficie lingüística | `sentence-rhythm` | Descriptivo | no | es/en | 60 |
| 16 | `ml.stylometric-classifier` | Clasificador entrenado | Clasificador entrenado | `trained-classifier` | Sin evaluación propia | sí | es/en | 150 |
| 17 | `commercial.sapling` | Detector comercial | Detectores comerciales | `vendor-sapling` | Precisión declarada por el proveedor | sí | es/en | 50 |
| 18 | `commercial.gptzero` | Detector comercial | Detectores comerciales | `vendor-gptzero` | Precisión declarada por el proveedor | sí | es/en | 50 |
| 19 | `commercial.mock` | Detector comercial | Detectores comerciales | `simulated` | Descriptivo | sí | es/en | 50 |

## Fichas detalladas

### 1. Entropía léxica — `entropy.lexical`

- **Naturaleza:** Estadístico · familia «Información y previsibilidad»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `information-theoretic` (un grupo = un voto en el agregador)
  - Comparte varianza con `predictability.perplexity`: Usa la misma distribución de tokens del documento; la entropía condicional y la perplejidad de bigramas son transformaciones de los mismos conteos.
  - Comparte varianza con `compression.complexity`: Ambos resumen el contenido informacional del mismo texto con métodos distintos.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 80 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Entropía de Shannon de la distribución de palabras y entropía condicional de bigramas.

**Metodología.** Se tokeniza con Intl.Segmenter, se normalizan las palabras a minúsculas y se calcula la entropía de la distribución empírica de unigramas y la entropía condicional H(siguiente|actual) del modelo de bigramas del propio texto.

**Variables analizadas.** Frecuencia absoluta de cada tipo léxico; Pares de palabras consecutivas; Distribución de probabilidad empírica

**Fórmulas.**

- *Entropía de Shannon*: `H = -Σ p(w) · log2 p(w)` — En bits por palabra.
- *Entropía normalizada*: `H_norm = H / log2(V)` — V = número de tipos distintos; permite comparar textos de distinto vocabulario.
- *Entropía condicional de bigramas*: `H(B|A) = -Σ p(a,b) · log2 p(b|a)` — Mide la incertidumbre del siguiente token dado el anterior.

**Limitaciones.**

- Depende de la longitud: en textos cortos la entropía se subestima.
- Un texto muy técnico tiene entropía alta sin relación con la autoría.
- No distingue autoría: solo cuantifica dispersión del vocabulario.

**Anclas de señal** (`normalizedEntropy`): [0.7 → 0.8], [0.85 → 0.55], [0.93 → 0.35], [0.98 → 0.22]

> Una entropía léxica normalizada baja indica un vocabulario concentrado en pocos tipos, patrón frecuente en texto muy predecible. Anclas iniciales, no calibradas con corpus etiquetado; se declaran como no validadas.

**Referencias.** Shannon, C. E. (1948). A Mathematical Theory of Communication.

### 2. Diversidad léxica — `diversity.lexical`

- **Naturaleza:** Estadístico · familia «Estilometría»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `lexical-richness` (un grupo = un voto en el agregador)
  - Comparte varianza con `richness.yule`: Ambos se calculan sobre la distribución de frecuencias de tipos del mismo texto.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 60 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** TTR, MATTR, MTLD y proporción de hapax con control de longitud.

**Metodología.** Se calcula el Type-Token Ratio simple (sensible a la longitud), el MATTR por ventanas deslizantes de 50 palabras, el MTLD con umbral 0.72 en ambas direcciones y el porcentaje de hapax legomena.

**Variables analizadas.** Tipos léxicos distintos; Longitud del texto; Ventanas de 50 palabras; Palabras de frecuencia 1

**Fórmulas.**

- *TTR*: `TTR = V / N`
- *MATTR*: `MATTR = (1/(N-w+1)) · Σ (V_i / w)` — w = 50 palabras.
- *MTLD*: `MTLD = N / factores` — Un factor se cierra cuando TTR ≤ 0.72; se promedian dirección directa e inversa.
- *Hapax*: `Hapax% = 100 · V1 / V`

**Limitaciones.**

- El TTR simple no es comparable entre textos de distinta longitud; por eso se informan MATTR y MTLD.
- MTLD es sensible a variaciones menores en textos cortos.
- No tiene dirección interpretativa validada: un texto artificial puede tener diversidad alta o baja.

**Referencias.** McCarthy, P. M. & Jarvis, S. (2010). MTLD, vocd-D, and HD-D: A validation study.; Covington, M. A. & McFall, J. D. (2010). Cutting the Gordian knot: MATTR.

### 3. Riqueza léxica estilométrica — `richness.yule`

- **Naturaleza:** Estadístico · familia «Estilometría»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `lexical-richness` (un grupo = un voto en el agregador)
  - Comparte varianza con `diversity.lexical`: Misma distribución de frecuencias de tipos.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 100 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Índice K de Yule, R de Honoré y D de Simpson: riqueza independiente de la longitud.

**Metodología.** Se construye la distribución de frecuencias de tipos léxicos y se calculan tres índices clásicos de estilometría que penalizan la concentración de repeticiones sin depender linealmente de la longitud del texto.

**Variables analizadas.** Distribución de frecuencias de tipos; Número total de palabras; Tipos con frecuencia 1

**Fórmulas.**

- *K de Yule*: `K = 10⁴ · (Σ nᵢ² − N) / N²` — Menor K = mayor diversidad.
- *R de Honoré*: `R = 100 · log(N) / (1 − V1/V)` — Solo si V1 < V.
- *D de Simpson*: `D = Σ nᵢ(nᵢ−1) / (N(N−1))` — Probabilidad de repetir tipo al azar.

**Limitaciones.**

- Los índices de riqueza siguen siendo sensibles al género textual y al tema.
- No existe evidencia de que discriminen autoría humana frente a generada.
- Con menos de 100 palabras los índices son inestables.

**Referencias.** Yule, G. U. (1944). The Statistical Study of Literary Vocabulary.; Honoré, A. (1979). Some simple measures of richness of vocabulary.

### 4. Repetición de n-gramas — `repetition.ngram`

- **Naturaleza:** Estadístico · familia «Repetición y estructura»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `sequence-repetition` (un grupo = un voto en el agregador)
  - Comparte varianza con `redundancy.similarity`: La similitud entre oraciones se apoya en el mismo solapamiento de n-gramas que la repetición.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 80 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Repetición de unigramas, bigramas, trigramas y 4-gramas, y repeticiones consecutivas.

**Metodología.** Se extraen secuencias de n palabras consecutivas sobre tokens normalizados. Para cada orden n se calcula la proporción de instancias que pertenecen a n-gramas repetidos y el n-grama más repetido. También se cuentan repeticiones inmediatas de la misma palabra.

**Variables analizadas.** n-gramas de orden 1 a 4; Repeticiones consecutivas de un token; Trigramas repetidos

**Fórmulas.**

- *Proporción repetida*: `R_n = (Σ_{c>1} c) / T_n` — T_n = total de n-gramas.
- *Distinción léxica*: `D_n = V_n / T_n`
- *Repetición consecutiva*: `C = |{i : wᵢ = wᵢ₊₁}| / N`

**Limitaciones.**

- La repetición es legítima en textos técnicos, jurídicos o con estribillos.
- No distingue repetición retórica de repetición mecánica.
- En textos cortos la proporción de trigramas repetidos es casi siempre 0.

**Anclas de señal** (`trigramRepeatedShare`): [0 → 0.3], [0.03 → 0.5], [0.1 → 0.72], [0.25 → 0.9]

> La reutilización literal de secuencias de tres palabras por encima de lo esperable indica generación repetitiva o plantillas. Anclas iniciales no calibradas.

### 5. Burstiness (ritmo oracional) — `rhythm.burstiness`

- **Naturaleza:** Estadístico · familia «Repetición y estructura»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `sentence-rhythm` (un grupo = un voto en el agregador)
  - Comparte varianza con `structure.regularity`: Ambos describen la distribución de longitudes del texto (oraciones y párrafos).
  - Comparte varianza con `syntax.complexity`: La longitud oracional es la variable compartida.
  - Comparte varianza con `readability.indices`: Las fórmulas de legibilidad usan palabras por oración.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 80 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Variabilidad de la longitud de las oraciones: media, dispersión, B de Goh-Barabási y uniformidad.

**Metodología.** Se segmentan oraciones con Intl.Segmenter, se cuenta el número de palabras de cada una y se describe su distribución. La burstiness B compara desviación típica y media; la uniformidad mide qué fracción de oraciones se aleja menos de un 20 % de la media.

**Variables analizadas.** Longitud de cada oración en palabras; Media y desviación típica; Cuartiles; Fracción de oraciones cercanas a la media

**Fórmulas.**

- *Burstiness de Goh-Barabási*: `B = (σ − μ) / (σ + μ)` — Rango (−1, 1).
- *Coeficiente de variación*: `CV = σ / μ`
- *Uniformidad*: `U = |{i : |Lᵢ − μ| ≤ 0.2μ}| / M` — M = número de oraciones. Alta U = longitudes muy homogéneas.

**Limitaciones.**

- La homogeneidad de longitudes puede deberse a un género textual pautado (informativo, académico).
- Con menos de 8 oraciones las medidas de dispersión son inestables.
- No considera el contenido ni la sintaxis interna de la oración.

**Anclas de señal** (`burstinessB`): [-0.7 → 0.85], [-0.4 → 0.68], [-0.15 → 0.48], [0.15 → 0.3], [0.45 → 0.18]

> Textos con longitudes de oración muy homogéneas (B muy negativo) muestran menos variación de ritmo que la prosa humana espontánea. Anclas iniciales no calibradas.

### 6. Regularidad estructural — `structure.regularity`

- **Naturaleza:** Estadístico · familia «Repetición y estructura»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `sentence-rhythm` (un grupo = un voto en el agregador)
  - Comparte varianza con `burstiness`: Misma variable de longitud, agregada por párrafo.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 80 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Uniformidad de longitudes de párrafo y de oraciones por párrafo.

**Metodología.** Los párrafos se delimitan por líneas en blanco. Se analiza la distribución de palabras por párrafo y de oraciones por párrafo, más la entropía de los tramos de longitud detectados.

**Variables analizadas.** Palabras por párrafo; Oraciones por párrafo; Distribución de tramos de longitud

**Fórmulas.**

- *CV de párrafo*: `CV_p = σ_p / μ_p`
- *Entropía de tramos*: `H_tramos = −Σ p_b log2 p_b` — b = tramo de 25 palabras.
- *Regularidad*: `1 − min(1, CV_p)`

**Limitaciones.**

- Los párrafos dependen del formato de origen (saltos de línea manuales).
- Un texto de un solo párrafo no permite estimar regularidad estructural.
- La uniformidad estructural refleja también plantillas de redacción humanas.

**Anclas de señal** (`paragraphLengthCV`): [0.05 → 0.85], [0.2 → 0.65], [0.4 → 0.45], [0.7 → 0.25]

> Párrafos de extensión casi idéntica sugieren generación por bloques. Anclas iniciales no calibradas; requiere al menos 3 párrafos.

### 7. Previsibilidad (bigramas, leave-one-out) — `predictability.perplexity`

- **Naturaleza:** Estadístico · familia «Información y previsibilidad»
- **Versión:** 1.1.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `information-theoretic` (un grupo = un voto en el agregador)
  - Comparte varianza con `entropy.lexical`: Comparte los conteos de unigramas y bigramas con la entropía léxica.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 120 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Entropía cruzada y perplejidad de un modelo de bigramas estimado exclusivamente con el propio documento (leave-one-out). No es la perplejidad de un modelo de lenguaje externo.

**Metodología.** Cada token se evalúa con los conteos del texto excluyendo su propia instancia (deleted estimation con α = 0.1) e interpolando bigrama y unigrama (0.6 / 0.4). El resultado es una entropía cruzada en bits por palabra, estable con textos cortos y sin fuga de información. Se informa además la proporción de bigramas observados más de una vez.

**Variables analizadas.** Secuencias de términos normalizados; Conteos de unigramas y bigramas del propio texto; Cobertura de contextos repetidos

**Fórmulas.**

- *Unigrama suavizado (leave-one-out)*: `p₁(w) = (c(w) − 1 + α) / (N − 1 + αV)` — α = 0.1; V = tamaño del vocabulario.
- *Bigrama suavizado (leave-one-out)*: `p₂(w|a) = (c(a,w) − 1 + α) / (c(a) − 1 + αV)` — Solo válido si c(a) > 1; si no, se retrocede al unigrama.
- *Mezcla*: `p(w|a) = 0.6·p₂ + 0.4·p₁`
- *Entropía cruzada*: `H = −(1/N)·Σ log₂ p(wᵢ | wᵢ₋₁)` — bits por palabra.
- *Perplejidad*: `PP = 2^H` — Del modelo de bigramas propio, no de un LLM.
- *Previsibilidad relativa*: `PR = H_bigrama / H_unigrama` — Bajo = el contexto explica mucho del texto.

**Limitaciones.**

- No es la perplejidad de un modelo de lenguaje: es la entropía cruzada de un modelo de bigramas cuyos parámetros salen del propio documento.
- Al estimarse del propio texto, mide autoconsistencia interna, no la probabilidad de que un modelo externo hubiera escrito esto.
- Sensible a la longitud: con pocos tokens la cobertura de bigramas cae y la estimación se vuelve inestable (por eso exige 120 palabras y ≥10 % de bigramas repetidos).
- Sensible al vocabulario: nombres propios, tecnicismos y citas suben la perplejidad sin relación alguna con la autoría.
- La estimación dejando uno fuera no corrige el sesgo de tema, género textual ni registro.
- No hay ningún corpus de referencia en español implicado: comparar este valor entre documentos de temas distintos no es válido.

**Anclas de señal** (`relativePredictability`): [0.55 → 0.85], [0.7 → 0.62], [0.82 → 0.42], [0.92 → 0.25]

> Una razón baja entre entropía de bigramas y de unigramas indica que el contexto explica gran parte del texto, es decir, alta previsibilidad secuencial. Anclas iniciales no calibradas con corpus etiquetado.

**Puntuación por fragmento:** previsibilidad relativa por oración (percentil dentro del texto)

### 8. Complejidad por compresión — `compression.complexity`

- **Naturaleza:** Estadístico · familia «Información y previsibilidad»
- **Versión:** 1.0.0
- **Validación:** Descriptivo
- **Grupo de dependencia:** `information-theoretic` (un grupo = un voto en el agregador)
  - Comparte varianza con `entropy.lexical`: La compresibilidad y la entropía empírica miden redundancia del mismo flujo de tokens.
  - Comparte varianza con `predictability.perplexity`: Ambas estiman cuánta estructura secuencial hay en el texto.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 60 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Relación de compresión deflate y redundancia secuencial frente a una línea base barajada.

**Metodología.** Se comprime el texto con deflate (nivel 9) y se compara con la compresión de la misma lista de palabras reordenada de forma pseudoaleatoria con semilla fija. La diferencia aísla la redundancia que proviene del orden de las palabras de la que proviene del vocabulario.

**Variables analizadas.** Bytes UTF-8 del texto; Bytes comprimidos; Comprimiión de la versión barajada

**Fórmulas.**

- *Relación de compresión*: `CR = bytes_comprimidos / bytes_originales`
- *Redundancia secuencial*: `RS = 1 − CR / CR_barajado` — >0 = el orden aporta estructura.

**Limitaciones.**

- Deflate detecta repeticiones de corto alcance; no modela estructura semántica.
- El resultado depende del idioma y de la codificación UTF-8.
- No se interpreta como señal de autoría.

**Referencias.** Grassegger et al. (2021). Low-Resource Text Classification: A Parameter-Free Classification Method with Compressors (variante conceptual).

### 9. Redundancia entre oraciones — `redundancy.similarity`

- **Naturaleza:** Estadístico · familia «Repetición y estructura»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `sequence-repetition` (un grupo = un voto en el agregador)
  - Comparte varianza con `repetition.ngram`: Mide solapamiento léxico, que es una forma de repetición de n-gramas entre oraciones.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 100 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Similitud léxica entre pares de oraciones y detección de oraciones casi duplicadas.

**Metodología.** Se eliminan palabras funcionales y se representa cada oración como un vector de frecuencias de palabras de contenido. Se calcula la similitud de coseno y la de Jaccard entre todos los pares de oraciones, más la proporción de pares con similitud ≥ 0.8. No se usan embeddings: es similitud léxica, no semántica.

**Variables analizadas.** Pares de oraciones; Palabras de contenido por oración; Coseno y Jaccard por par

**Fórmulas.**

- *Coseno léxico*: `cos(q,d) = (q·d) / (‖q‖‖d‖)`
- *Jaccard*: `J(A,B) = |A∩B| / |A∪B|`
- *Redundancia media*: `R̄ = media de coseno sobre todos los pares` — Se descartan pares con menos de 3 palabras de contenido en común.

**Limitaciones.**

- Sin embeddings no detecta paráfrasis: dos oraciones pueden repetir la misma idea con vocabulario distinto.
- Textos con muchas oraciones cortas producen similitudes bajas por falta de solapamiento.
- No distingue redundancia de progresión temática legítima.

**Anclas de señal** (`meanPairSimilarity`): [0.05 → 0.3], [0.15 → 0.45], [0.3 → 0.7], [0.5 → 0.85]

> Una similitud léxica media alta entre oraciones indica que el texto reformula el mismo contenido con el mismo vocabulario. Anclas iniciales no calibradas.

### 10. Estilometría de palabras funcionales — `stylometry.functionwords`

- **Naturaleza:** Estadístico · familia «Estilometría»
- **Versión:** 1.0.0
- **Validación:** Descriptivo
- **Grupo de dependencia:** `function-word-profile` (un grupo = un voto en el agregador)
  - Comparte varianza con `morphosyntax.profile`: El perfil morfosintáctico reutiliza las mismas listas de palabras funcionales.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 100 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Perfil de clase cerrada: proporción de palabras funcionales, pronombres, artículos, preposiciones y forma de la distribución léxica.

**Metodología.** Se compara cada token con listas cerradas de palabras funcionales del español o del inglés. Se calculan proporciones por categoría, entropía de la distribución de palabras funcionales, longitud media de palabra y pendiente de Zipf. La estilometría clásica usa estas proporciones como huella de estilo, no como prueba de autoría.

**Variables analizadas.** Palabras funcionales; Pronombres; Artículos; Preposiciones; Conjunciones; Longitud de palabra; Pendiente de Zipf

**Fórmulas.**

- *Tasa de funcionales*: `TF = |{wᵢ ∈ clase cerrada}| / N`
- *Entropía de funcionales*: `H_fw = −Σ p(w) log2 p(w) / log2(V_fw)`
- *Pendiente de Zipf*: `log10(frecuencia) ≈ a + b·log10(rango)`

**Limitaciones.**

- Sin un corpus de referencia del mismo género e idioma, las proporciones no se pueden comparar con una línea base.
- El perfil depende del registro: un texto académico y uno conversacional difieren legítimamente.
- No hay calibración que convierta estas proporciones en probabilidad de autoría.

**Referencias.** Mosteller, F. & Wallace, D. (1964). Inference and Disputed Authorship: The Federalist.

### 11. Conectores discursivos — `discourse.connectors`

- **Naturaleza:** Lingüístico · familia «Superficie lingüística»
- **Versión:** 1.0.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `discourse-markers` (un grupo = un voto en el agregador)
  - Comparte varianza con `stylometry.functionwords`: Los conectores son un subconjunto de las palabras funcionales contadas por la estilometría.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 80 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Frecuencia, posición, diversidad y concentración de conectores discursivos por función retórica.

**Metodología.** Se busca cada conector de una lista cerrada por función (adición, contraste, causa, consecuencia, ejemplificación, orden, conclusión, finalidad, condición, temporal) con límites de palabra. Se mide frecuencia por 100 palabras, proporción en posición inicial de oración, número de conectores distintos y concentración en el conector más usado.

**Variables analizadas.** Apariciones por conector; Función retórica; Posición en la oración; Conectores distintos

**Fórmulas.**

- *Densidad*: `CD = 100 · apariciones / palabras`
- *Inicialidad*: `CI = apariciones en inicio de oración / apariciones`
- *Diversidad*: `CDiv = conectores distintos / apariciones`
- *Concentración*: `CC = máximo de apariciones / total`

**Limitaciones.**

- La lista es finita: no cubre todas las locuciones conectivas posibles.
- Un uso alto de conectores es un rasgo de registro académico, no una prueba de autoría.
- La detección de posición inicial es aproximada (primeros 12 caracteres de la oración).

### 12. Complejidad sintáctica (superficial) — `syntax.complexity`

- **Naturaleza:** Lingüístico · familia «Superficie lingüística»
- **Versión:** 1.0.0
- **Validación:** Heurístico
- **Grupo de dependencia:** `sentence-rhythm` (un grupo = un voto en el agregador)
  - Comparte varianza con `burstiness`: Comparte la distribución de longitudes de oración.
  - Comparte varianza con `readability.indices`: Ambos parten de palabras por oración.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 80 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Longitud oracional, densidad de marcadores de subordinación y coordinación, y dispersión de la longitud.

**Metodología.** Sobre las oraciones segmentadas se cuentan palabras y marcadores de subordinación de una lista cerrada. Se calcula una densidad de subordinación por oración y se describe la distribución de longitudes. No se construye árbol sintáctico ni se hace etiquetado gramatical: es una medida de superficie.

**Variables analizadas.** Palabras por oración; Marcadores de subordinación; Marcadores de coordinación; Distribución de longitudes

**Fórmulas.**

- *Densidad de subordinación*: `DS = marcadores_subordinación / oraciones`
- *Palabras por oración*: `PO = palabras / oraciones`
- *Entropía de longitudes*: `H_L = −Σ p(L) log2 p(L)`

**Limitaciones.**

- No es un análisis sintáctico: no identifica funciones, dependencias ni profundidad real de anidamiento.
- Los marcadores tienen usos no subordinantes (por ejemplo «que» como relativo o conjunción).
- La comparación entre géneros textuales requiere referencia propia de cada género.

### 13. Perfil morfosintáctico (experimental) — `morphosyntax.profile`

- **Naturaleza:** Lingüístico · familia «Estilometría»
- **Versión:** 0.1.0-experimental
- **Validación:** Heurístico
- **Grupo de dependencia:** `function-word-profile` (un grupo = un voto en el agregador)
  - Comparte varianza con `stylometry.functionwords`: Comparte las listas cerradas de funcionales.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 120 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Distribución aproximada de categorías gramaticales por lista cerrada y sufijos. No es un etiquetador entrenado.

**Metodología.** Los tokens de clase cerrada se asignan por lista (determinantes, preposiciones, conjunciones, pronombres). El resto se aproxima por sufijos: nominalizaciones, adjetivos, adverbios en -mente y formas verbales. No existe desambiguación contextual.

**Variables analizadas.** Sufijos derivativos; Listas cerradas de funcionales; Distribución de categorías aproximadas

**Fórmulas.**

- *Proporción de categoría*: `P_c = tokens_c / N`
- *Entropía del perfil*: `H = −Σ p_c log2 p_c`

**Limitaciones.**

- Ambigüedad no resuelta: «la» puede ser artículo o pronombre; «como» preposición o conjunción.
- Los sufijos generan falsos positivos frecuentes (por ejemplo «real» como adjetivo y como sustantivo).
- Los participios en -ado/-ido se agrupan en una categoría ambigua aparte: sin contexto no puede decidirse si son verbo, adjetivo o sustantivo.
- No sustituye a un etiquetador como spaCy es_core_news_sm, que requeriría un modelo de ~12 MB y no está integrado en esta versión.
- No se debe usar para afirmar precisión morfosintáctica.

### 14. Puntuación y ortografía — `orthography.punctuation`

- **Naturaleza:** Lingüístico · familia «Superficie lingüística»
- **Versión:** 1.0.0
- **Validación:** Descriptivo
- **Grupo de dependencia:** `orthography` (un grupo = un voto en el agregador)
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 50 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Distribución de signos de puntuación, hábitos tipográficos y marcas de descuido mecánico.

**Metodología.** Se cuentan los signos de puntuación del texto y se calculan ratios por oración y por coma. Se detectan patrones tipográficos: espacios antes de signo, falta de espacio tras coma, espacios dobles, comillas mezcladas, puntuación repetida y uso de signos de apertura del español.

**Variables analizadas.** Frecuencia por signo; Ratios coma/oración; Patrones tipográficos; Uso de acentos

**Fórmulas.**

- *Densidad de puntuación*: `DP = signos / oraciones`
- *Entropía de signos*: `H_s = −Σ p(s) log2 p(s)`
- *Ratio coma/punto*: `RC = comas / puntos`

**Limitaciones.**

- La puntuación correcta no es señal de texto artificial: no se interpreta en esa dirección.
- Los hábitos tipográficos varían por plataforma, corrector y registro.
- No se evalúa corrección gramatical ni ortográfica léxica: no hay diccionario integrado.

### 15. Legibilidad (índices en español e inglés) — `readability.indices`

- **Naturaleza:** Lingüístico · familia «Superficie lingüística»
- **Versión:** 1.0.0
- **Validación:** Descriptivo
- **Grupo de dependencia:** `sentence-rhythm` (un grupo = un voto en el agregador)
  - Comparte varianza con `burstiness`: Palabras por oración es una de sus entradas.
  - Comparte varianza con `syntax.complexity`: Longitud oracional compartida.
- **Interpretación direccional:** no: medida descriptiva
- **Idiomas declarados:** es, en · mínimo 60 palabras
- **Disponibilidad en esta instancia:** ready — Analizador local.

**Resumen.** Fernández-Huerta, Szigriszt-Pazos/INFLESZ y Flesch (inglés) con recuento silábico aproximado.

**Metodología.** Se estiman las sílabas por palabra agrupando vocales y aplicando reglas de hiato documentadas. Con sílabas por palabra y palabras por oración se aplican las fórmulas clásicas de legibilidad para español y, en inglés, Flesch Reading Ease y Flesch-Kincaid.

**Variables analizadas.** Sílabas por palabra; Palabras por oración; Longitud del texto

**Fórmulas.**

- *Fernández-Huerta*: `L = 206.84 − 0.60·P − 1.02·F` — P = sílabas por 100 palabras; F = oraciones por 100 palabras.
- *Szigriszt-Pazos / INFLESZ*: `P = 206.835 − 62.3·(S/Pal) − (Pal/Frases)`
- *Flesch Reading Ease*: `206.835 − 1.015·(palabras/oración) − 84.6·(sílabas/palabra)`
- *Flesch-Kincaid*: `0.39·(palabras/oración) + 11.8·(sílabas/palabra) − 15.59`

**Limitaciones.**

- El recuento silábico es aproximado: no aplica acentuación, diptongos irregulares ni triptongos completos.
- La legibilidad no mide calidad ni autoría; mide dificultad de lectura estimada.
- Las fórmulas están validadas para prosa expositiva, no para verso ni diálogo.

**Referencias.** Fernández Huerta, J. (1959). Medidas sencillas de lecturabilidad.; Szigriszt Pazos, F. (1992). Sistemas predictivos de legibilidad del mensaje escrito.; Barrio-Cantalejo et al. (2008). Validación de la escala INFLESZ.

### 16. Clasificador estilométrico entrenado — `ml.stylometric-classifier`

- **Naturaleza:** Clasificador entrenado · familia «Clasificador entrenado»
- **Versión:** 0.1.0
- **Validación:** Sin evaluación propia
- **Grupo de dependencia:** `trained-classifier` (un grupo = un voto en el agregador)
  - Comparte varianza con `entropy.lexical`: El vector de características incluye entropía y diversidad calculadas de forma equivalente.
  - Comparte varianza con `burstiness`: El vector de características incluye longitudes de oración.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 150 palabras
- **Disponibilidad en esta instancia:** dataset-required — Sin dataset licenciado no hay modelo entrenado.

**Resumen.** Regresión logística sobre 22 características estilométricas. Requiere un artefacto entrenado con datos etiquetados y evidencia de validación.

**Metodología.** Pipeline de ml/train.py: deduplicación por similitud, separación por autor y por modelo generador, estandarización, regresión logística class-balanced y exportación a JSON con métricas fuera de muestra. La inferencia en Umbral aplica exactamente el mismo vector de 22 características.

**Variables analizadas.** mean_sentence_words; sd_sentence_words; cv_sentence_words; mean_paragraph_words; cv_paragraph_words; ttr; mattr50; hapax_ratio; yules_k; unigram_entropy_norm; bigram_entropy_norm; trigram_repeat_share; bigram_repeat_share; consecutive_repeat_rate; mean_word_length; word_length_entropy; function_word_rate; comma_per_sentence; punct_per_sentence; connector_density; sentence_length_entropy; long_sentence_share

**Fórmulas.**

- *Regresión logística*: `p = 1 / (1 + e^−(β₀ + Σ βᵢ·zᵢ))` — zᵢ = característica estandarizada.
- *Estandarización*: `zᵢ = (xᵢ − μᵢ) / σᵢ`

**Limitaciones.**

- Sin dataset etiquetado con licencia y separación estricta no hay modelo: el motor queda deshabilitado y no vota.
- Estas características no son causales de autoría; el clasificador aprende sesgos del corpus de entrenamiento.
- Un modelo entrenado solo en inglés no es válido para español sin evaluación independiente.
- No se declara precisión sin métricas fuera de muestra con intervalos de confianza.

**Anclas de señal** (`probabilityAI`): [0 → 0], [1 → 1]

> La salida del clasificador es directamente su probabilidad calibrada; no se remapea.

**Referencias.** Solaiman et al. (2019). Release Strategies and the Social Impacts of Language Models (detector GPT-2).

### 17. Sapling AI Detector — `commercial.sapling`

- **Naturaleza:** Detector comercial · familia «Detectores comerciales»
- **Versión:** externo
- **Validación:** Precisión declarada por el proveedor
- **Grupo de dependencia:** `vendor-sapling` (un grupo = un voto en el agregador)
  - Comparte varianza con `commercial.gptzero`: Distintos proveedores, misma tarea y señales de entrenamiento relacionadas: sus errores están correlacionados aunque no sean idénticos. Se les asigna voto propio por ser implementaciones independientes.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 50 palabras
- **Disponibilidad en esta instancia:** disabled-by-user — UMBRAL_ENABLE_EXTERNAL=false: no se envía texto a terceros.

**Resumen.** Detector comercial de Sapling Intelligence, invocado desde el servidor con consentimiento explícito.

**Metodología.** POST https://api.sapling.ai/api/v1/aidetect con autenticación body-key. Se solicitan puntuaciones por oración cuando el proveedor las ofrece. Se envía zero_retention=true.

**Variables analizadas.** Texto íntegro (o limitado al máximo del proveedor); Puntuación global del documento; Puntuaciones por oración

**Fórmulas.**

- *Puntuación del proveedor*: `s = score_documento (escala del proveedor, 1 = generado por IA)` — No se recalcula ni se recalibra: se informa tal cual.

**Limitaciones.**

- Incluye score global, ai_fraction, verdict, segments, sentence_scores y token_probs.
- El modelo multilingüe (ml20261009) se aplica automáticamente al español salvo que se fije «version».
- create_report no se envía nunca: guardaría el texto en el proveedor.
- La precisión declarada por el proveedor no se ha replicado de forma independiente en este proyecto.
- Los detectores comerciales producen falsos positivos y falsos negativos documentados por sus propios autores.
- El texto se envía a un tercero: solo con consentimiento explícito por petición.

**Anclas de señal** (`providerScore`): [0 → 0], [1 → 1]

> La puntuación del proveedor se informa tal cual (0-1, 1 = más compatible con generación automática). No se remapea ni se recalibra: se desconoce su calibración en español y en este dominio.

**Puntuación por fragmento:** probabilidad por oración del proveedor

**Referencias.** https://sapling.ai/docs/api/detector/

### 18. GPTZero — `commercial.gptzero`

- **Naturaleza:** Detector comercial · familia «Detectores comerciales»
- **Versión:** externo
- **Validación:** Precisión declarada por el proveedor
- **Grupo de dependencia:** `vendor-gptzero` (un grupo = un voto en el agregador)
  - Comparte varianza con `commercial.sapling`: Distintos proveedores, misma tarea y señales de entrenamiento relacionadas: sus errores están correlacionados aunque no sean idénticos. Se les asigna voto propio por ser implementaciones independientes.
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 50 palabras
- **Disponibilidad en esta instancia:** disabled-by-user — UMBRAL_ENABLE_EXTERNAL=false: no se envía texto a terceros.

**Resumen.** Detector comercial de GPTZero, invocado desde el servidor con consentimiento explícito.

**Metodología.** POST https://api.gptzero.me/v2/predict/text con autenticación header-x-api-key. Se solicitan puntuaciones por oración cuando el proveedor las ofrece. El proveedor no documenta retención cero.

**Variables analizadas.** Texto íntegro (o limitado al máximo del proveedor); Puntuación global del documento; Puntuaciones por oración

**Fórmulas.**

- *Puntuación del proveedor*: `s = score_documento (escala del proveedor, 1 = generado por IA)` — No se recalcula ni se recalibra: se informa tal cual.

**Limitaciones.**

- Detecta el idioma automáticamente y usa modelo multilingüe para textos no ingleses.
- No se documenta un parámetro de retención cero: el adaptador lo declara como «provider-default».
- No se ha ejecutado contra la API real en este entorno (red saliente bloqueada).
- La precisión declarada por el proveedor no se ha replicado de forma independiente en este proyecto.
- Los detectores comerciales producen falsos positivos y falsos negativos documentados por sus propios autores.
- El texto se envía a un tercero: solo con consentimiento explícito por petición.

**Anclas de señal** (`providerScore`): [0 → 0], [1 → 1]

> La puntuación del proveedor se informa tal cual (0-1, 1 = más compatible con generación automática). No se remapea ni se recalibra: se desconoce su calibración en español y en este dominio.

**Puntuación por fragmento:** probabilidad por oración del proveedor

**Referencias.** https://docs.gptzero.me/

### 19. Proveedor simulado — `commercial.mock`

- **Naturaleza:** Detector comercial · familia «Detectores comerciales»
- **Versión:** externo
- **Validación:** Descriptivo
- **Grupo de dependencia:** `simulated` (un grupo = un voto en el agregador)
- **Interpretación direccional:** sí, con anclas documentadas
- **Idiomas declarados:** es, en · mínimo 50 palabras
- **Disponibilidad en esta instancia:** disabled-by-user — Simulación desactivada (UMBRAL_ALLOW_MOCK=false).

**Resumen.** Proveedor simulado para pruebas de interfaz. No es un detector real.

**Metodología.** Generación local de una respuesta ficticia reproducible. No contacta con ningún servicio.

**Variables analizadas.** Texto íntegro (o limitado al máximo del proveedor); Puntuación global del documento; Puntuaciones por oración

**Fórmulas.**

- *Puntuación del proveedor*: `s = score_documento (escala del proveedor, 1 = generado por IA)` — No se recalcula ni se recalibra: se informa tal cual.

**Limitaciones.**

- No es un detector: genera respuestas ficticias para probar interfaz y estados.
- Sus resultados llevan simulated: true y el agregador los descarta.
- La precisión declarada por el proveedor no se ha replicado de forma independiente en este proyecto.
- Los detectores comerciales producen falsos positivos y falsos negativos documentados por sus propios autores.
- El texto se envía a un tercero: solo con consentimiento explícito por petición.

**Anclas de señal** (`providerScore`): [0 → 0], [1 → 1]

> La puntuación del proveedor se informa tal cual (0-1, 1 = más compatible con generación automática). No se remapea ni se recalibra: se desconoce su calibración en español y en este dominio.

**Puntuación por fragmento:** probabilidad por oración del proveedor

