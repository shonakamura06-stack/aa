# Revisión crítica del diseño del corpus de Umbral

**Versión:** 0.1 (propuesta para aprobación) · **Fecha:** 30 de octubre de 2026
**Estado:** **no aprobado**. Este documento corrige el informe `DATASET_RESEARCH.md` y sustituye su §3, §4 y §5 en lo relativo al diseño del corpus.
**Lo que no hace:** no descarga datos, no entrena nada, no modifica `DATASET_RESEARCH.md` ni la aplicación.

> Este documento revisa trabajo propio. Diez afirmaciones del informe anterior resultaron falsas o incompletas; se listan con su ubicación exacta y la corrección. No se defiende ninguna decisión por el hecho de haberla propuesto antes.

---

## 0. Resumen de lo que cambia

| Decisión anterior | Decisión revisada |
|---|---|
| Una única partición por `hash(family_id)` | **Componentes conexas** por cierre transitivo de todas las claves, y **una partición por experimento** |
| A–F como categorías excluyentes | **Vector de rasgos**: modo de génesis + edición posterior + contenido mixto |
| Etiqueta solo a nivel de documento | **Etiqueta por fragmento** obligatoria en D y F |
| Wikipedia por país como proxy de variedad | **Cuatro campos de país distintos**; Wikipedia solo aporta «país del tema» |
| FPR por género de ±0,9 pp | **±1,10 pp** con 390 negativos; ±2,38 pp con la composición propuesta |
| Corpus definitivo H+C+D+E (10.000) | **A+B+C+D+E+F (4.240)**, con F desde el inicio |
| IC de AUROC por Hanley–McNeil | **Bootstrap por componentes**; Hanley–McNeil solo como referencia |

---

## 1. Errores encontrados en el informe actual

| # | Ubicación | Lo que afirma | Lo que es cierto | Gravedad |
|---|---|---|---|---|
| **E1** | §4.2 | Separar por 6 claves y asignar con `hash(family_id)` | El hash agrupa **solo familias**. Un autor con cuatro familias puede quedar repartido entre train y test. Garantiza una clave de seis | Crítica |
| **E2** | §4.3, §5 | Una partición única sirve para E1–E5 | E2–E5 ocultan ejes distintos e incompatibles entre sí: ninguna partición única puede tener a la vez «modelos vistos» y «modelos no vistos» | Crítica |
| **E3** | §5.6 | «≈390 negativos ⇒ FPR@1 % ±0,9 pp» | IC95 Wilson = **[0,40 % – 2,61 %]**, semiamplitud **±1,10 pp** | Alta |
| **E4** | §5.5–5.6 | «2.000» usado como total de documentos y como número de negativos | Son cantidades distintas; con reparto 2:1, 2.000 documentos dan ~667 negativos | Alta |
| **E5** | §5.5 | «8.000 ⇒ AUROC ±0,5 pp» | ±0,62 pp sin agrupamiento; **±0,79 pp** con DE = 1,6 | Media |
| **E6** | §5.5 | «12.000 ⇒ por género ±1,4 pp» | ±1,71 pp; **±2,16 pp** con DE = 1,6 | Media |
| **E7** | §5.2–5.6 | IC de AUROC con Hanley–McNeil sobre datos agrupados | Ese error estándar **asume independencia**; con 3–5 versiones por original los intervalos son demasiado estrechos | Alta |
| **E8** | §7.7, §2.3 | Categorías geográficas de Wikipedia como base de variedad | Miden **de qué trata el artículo**, no quién lo escribió ni cómo escribe | Crítica |
| **E9** | §3 | A–F mutuamente excluyentes | D y F se solapan por construcción; sin etiqueta por fragmento no hay proporción humana defendible | Alta |
| **E10** | §5.6 | Corpus definitivo = H + C + D + E | **No incluye ningún documento F** ⇒ E5 es inejecutable. Y 10.000 documentos no eran alcanzables con 0 USD | Crítica |

**Lo que resiste la revisión:** el intervalo de 200 negativos ([0,27 % – 3,57 %]), la tabla de semiamplitud por tamaño, y la conclusión de que 200 negativos por género no sostienen una afirmación sobre el 1 %.

---

## 2. Correcciones metodológicas

Cinco principios que sustituyen a los del informe anterior.

1. **La unidad de independencia es la componente conexa**, no la familia ni el documento.
2. **Cada experimento tiene su propia partición.** Un documento puede ser *train* en E1 y *test* en E3; se declara explícitamente.
3. **La etiqueta es un vector de rasgos**, con etiqueta por fragmento, no un enum excluyente.
4. **El país son cuatro campos separados** y solo uno de ellos se puede demostrar con datos públicos de Wikipedia.
5. **Todo intervalo se calcula sobre n efectivo** y se contrasta con bootstrap por grupos; el efecto de diseño **se mide**, no se supone.

**Lo que se deja de hacer:** asignar por hash de una sola clave, reportar «n = 10.000» sin decir cuántas componentes hay, y presentar intervalos calculados como si los documentos fueran independientes.

---

## 3. Diseño revisado del corpus

### 3.1 Modelo formal del documento

Un documento `d` se representa como:

```
d = (T, S(d), E(d), L(d))

T          texto completo
S(d)       partición ordenada en fragmentos contiguos s₁ … sₙ, sin huecos ni solapes
o(s) ∈ {H, M}   origen del fragmento: humano o máquina
E(d)       registro de eventos de edición humana sobre fragmentos M (vacío si no hubo)
L(d)       linaje: (padre, modo, prompt_id, generador, versión, parámetros de decodificación)
```

Todo fragmento debe declararse; **no se admite el fragmento «indeterminado»** dentro de un documento etiquetado. Si el origen de un fragmento no se conoce, el documento entero pasa a `provenance = unknown` y queda fuera de los análisis de modo.

### 3.2 Categorías A–F como predicados

| Cat. | Predicado | Qué exige el registro |
|---|---|---|
| **A** | `∀s: o(s)=H` ∧ `L=∅` ∧ publicación con licencia verificada | `source_url`, `license`, `license_evidence` |
| **B** | `∀s: o(s)=H` ∧ `L=∅` ∧ donación ∧ `consent_id ≠ null` | consentimiento firmado, país declarado |
| **C** | `∀s: o(s)=M` ∧ `padre=∅` (solo instrucción) | prompt completo y parámetros |
| **D** | `∃ i: o(s₁…sᵢ)=H ∧ o(sᵢ₊₁…sₙ)=M` ∧ modo = continuación | **`boundary_index`** |
| **E** | `∀s: o(s)=M` ∧ `padre` = documento humano ∧ modo = reescritura ∧ `sim(T, T_padre) ≥ τ` | padre, τ y su valor medido |
| **F** | `∃s: o(s)=M` ∧ `E(d) ≠ ∅` | **log de edición** y diff |

`τ` (similitud mínima para aceptar una reescritura) se fija en el piloto; candidato inicial: ROUGE-L ≥ 0,5 **o** coseno de embeddings ≥ 0,85. Se reporta el valor usado.

### 3.3 Documentos mixtos: qué se etiqueta exactamente

**La categoría D ya es mixta**: contiene texto humano y texto de máquina. Llamarla «máquina» es una decisión de análisis, no un hecho del documento. Lo mismo vale para F.

Por eso el registro guarda tres campos independientes:

```
mode            ∈ {A, B, C, D, E}      génesis del documento
post_editing    ∈ {none, human}        ¿hubo edición humana posterior?
mixed_content   ∈ {false, true}        ¿coexisten H y M en el mismo documento?
```

Y de ahí se derivan **tres objetivos de clasificación**, calculados del mismo registro:

| Objetivo | Clases | Para qué sirve |
|---|---|---|
| `target_clean` | humano (A, B) vs máquina (C, E) | Contraste sin texto humano dentro del documento |
| `target_any_ai` | humano vs cualquier participación de IA (C, D, E, F) | Escenario de despliegue |
| `target3` | humano / máquina / **mixto** (D, F) | Reporte principal del corpus |

**¿F debe ser clase propia?** Sí, pero no sola: **D y F forman la clase «mixto»**. Incluir F en «máquina» tiene dos efectos indeseables: entrena al detector a llamar «máquina» a un texto mayoritariamente humano, y hace que el FPR medido no corresponda al de un texto realmente mixto. Umbral declara que no emite veredicto de autoría; forzar F dentro de «máquina» contradice esa línea.

### 3.4 Etiqueta por fragmento y cálculo de la proporción

Sin offsets no hay proporción defendible. Campos mínimos:

```
spans: [{start, end, origin: "H"|"M", edited: bool}]
boundary_index      # solo D
human_share         # calculado, nunca estimado
human_share_method  # "boundary" | "edit_diff" | null
```

**Cómo se obtiene la proporción sin inventarla:**

1. **D (construcción controlada):** la proporción es el índice de frontera. Exacta.
2. **F (proceso observado):** se parte de un borrador de IA, la persona edita con historial o entrega el texto final, y se calcula
   `human_share = 1 − tokens_preservados_del_borrador / tokens_del_texto_final`
   con un diff a nivel de token.
3. **Cualquier otro caso:** `human_share = null`. **No se estima a ojo.** Un documento sin registro del proceso no entra en los análisis de F.

### 3.5 Esquema de anotación reproducible

- **Manual v1** con árbol de decisión y seis ejemplos por categoría, incluidos los casos límite (D+F, E con reescritura parcial, F con edición mínima).
- **Doble anotación del 10 %** de la muestra; **κ de Cohen** para variables categóricas y **α de Krippendorff con offsets** para fragmentos; adjudicación registrada con su motivo.
- **Registro inmutable y solo-añadir** (JSON Lines): ninguna etiqueta se sobrescribe; se añade una nueva con `label_version` y fecha.
- **Validaciones automáticas:** todo D tiene `boundary_index`; todo F tiene `E(d) ≠ ∅`; ningún `human_share` sin `human_share_method`; ningún `mode` con fragmentos de origen desconocido.

---

## 4. Nueva estrategia de particiones

### 4.1 Por qué el hash de `family_id` no sirve

Con `hash(family_id) % 100` se cumple «ninguna familia en dos conjuntos» y **nada más**. Casos concretos que se cuelan:

- un autor que dona 4 ensayos → 4 familias → pueden caer 2 en train y 2 en test;
- un periódico con 300 textos → 300 familias → reparto aleatorio en ambos lados;
- una plantilla de prompt reutilizada 500 veces → el modelo aprende la plantilla;
- un tema de actualidad cubierto por 40 documentos → el detector aprende el tema.

### 4.2 Algoritmo: cierre transitivo por componentes

```
1. Claves de bloqueo por documento (TODAS, no una):
     family_id
     author_pseudo_id
     source_document_id        (URL canónica o id de fichero)
     publisher_domain
     prompt_template_id        (instrucción sin variables)
     topic_cluster             (TF-IDF/embedding, umbral a fijar en el piloto)
     near_dup_cluster          (MinHash ≥ 0,75)
2. Grafo no dirigido: nodo = documento; arista si comparten CUALQUIER clave.
3. Union-Find → componentes conexas = unidades de independencia.
4. Cada componente hereda el vector de atributos:
     {géneros, países, familias de generador, modos}
5. Para cada experimento, asignar COMPONENTES COMPLETAS a train/dev/test
   respetando la restricción del eje oculto.
6. Verificar por script; el build falla si la verificación no pasa.
```

**Propiedad que se gana:** si dos documentos comparten autor, fuente, prompt, tema o son casi duplicados, están en la misma componente **por construcción**, y una componente nunca se parte. La garantía deja de depender de una sola clave.

**Coste que hay que asumir:** las componentes pueden ser grandes. Un periódico con 300 textos es una componente de 300. Hay que reportar el tamaño de la mayor y, si supera el 5 % del corpus, tratarla como conjunto propio o excluirla del test.

### 4.3 Una partición por experimento

| Exp. | Eje oculto en test | Contiene el train | Contiene el test | Mínimo del test |
|---|---|---|---|---|
| **E1** | ninguno (comparte todo) | 80 % de las componentes | 20 % de las componentes | 800 documentos |
| **E2** | 2 familias de generador | C y E de las familias restantes | C y E de las 2 familias ocultas + sus documentos padre | 480 positivos |
| **E3** | 2 géneros | 7 géneros | 2 géneros completos | 400 documentos |
| **E4** | 2 países | 4 países (B y sus derivados D/E) | 2 países completos | 300 documentos |
| **E5** | modos mixtos y E retenido | C, D y E parcial | **F completo** + E retenido | 480 documentos |

Tres precisiones que el informe anterior no hacía:

- **E2 exige ≥ 4 familias de generador en el corpus** (2 para entrenar, 2 para ocultar). Con 3 familias, E2 no se ejecuta y no se reporta.
- **E4 solo puede usar documentos con `author_country_declared`** y sus derivados D/E. Una continuación hereda la variedad del prefijo; **C no la hereda**, porque se genera desde una instrucción.
- **E5 exige F**. Si no hay F, E5 se elimina del protocolo; **no se sustituye por E**, que es otra cosa.

### 4.4 Verificación automática antes de entrenar

1. Para cada experimento: la intersección de **valores de clave** entre train y test es vacía (valores, no documentos).
2. Los valores del eje oculto presentes en test no aparecen en train.
3. Reporte obligatorio por split: nº de componentes, nº de documentos, tamaño de la mayor, balance de clases.
4. Prohibido publicar «n = X» sin indicar cuántas componentes independientes hay.

---

## 5. Nueva propuesta de tamaños de muestra

### 5.1 La cifra que detectaste, confirmada

| Negativos | FP | FPR | IC95 (Wilson) | Semiamplitud |
|---|---|---|---|---|
| 200 | 2 | 1,00 % | [0,27 % – 3,57 %] | ±1,65 pp |
| **390** | **4** | **1,03 %** | **[0,40 % – 2,61 %]** | **±1,10 pp** |
| 1.000 | 10 | 1,00 % | [0,54 % – 1,83 %] | ±0,64 pp |
| 2.000 | 20 | 1,00 % | [0,65 % – 1,54 %] | ±0,45 pp |
| 4.000 | 40 | 1,00 % | [0,74 % – 1,36 %] | ±0,31 pp |

El «±0,9 pp» del informe era un 20 % más estrecho que el intervalo real.

### 5.2 Tamaños necesarios (sin y con agrupamiento)

**FPR del 1 %** — semiamplitud en puntos porcentuales:

| Negativos | Sin agrupar | DE = 1,6 |
|---|---|---|
| 200 | ±1,65 | ±1,74 |
| 500 | ±0,95 | ±1,10 |
| 1.000 | ±0,64 | ±0,78 |
| 2.000 | ±0,45 | ±0,55 |
| 4.000 | ±0,31 | ±0,39 |

Negativos necesarios para un objetivo: **±2 pp** → 140 (210 con DE) · **±1 pp** → 440 (650) · **±0,5 pp** → 1.610 (**2.520**).

**AUROC con A = 0,90:**

| n por clase | Sin agrupar | DE = 1,6 |
|---|---|---|
| 500 | ±1,98 pp | ±2,50 pp |
| 1.000 | ±1,40 pp | ±1,77 pp |
| 2.000 | ±0,99 pp | ±1,25 pp |

**TPR con FPR fija (TPR = 0,70):**

| Positivos | Sin agrupar | DE = 1,6 |
|---|---|---|
| 100 | ±8,84 pp | ±11,36 pp |
| 240 | ±5,76 pp | ±7,29 pp |
| 400 | ±4,47 pp | ±5,66 pp |
| 1.000 | ±2,84 pp | ±3,59 pp |

### 5.3 Efecto de diseño y correlación intrafamilia

`DE = 1 + (m − 1)·ρ`, con `m` versiones por original y `ρ` la correlación intra-componente.

| m | ρ | DE | 1.000 textos valen como |
|---|---|---|---|
| 3 | 0,2 | 1,40 | 714 |
| 3 | 0,4 | 1,80 | 556 |
| 3 | 0,6 | 2,20 | 455 |
| 5 | 0,4 | 2,60 | 385 |

**ρ no se supone: se estima.** El piloto debe reportar el ICC(1) de cada métrica con `family_id` como factor. Si ρ = 0,6 en vez de 0,4, todos los intervalos se ensanchan un 17 % y varias filas de la tabla siguiente pasan a «no».

### 5.4 Método de intervalos con agrupamiento

- **Bootstrap por componentes**, 2.000 réplicas, remuestreando componentes completas (no documentos). Es el número publicable.
- **Umbral elegido en dev, evaluado en test.** Nunca en el mismo conjunto: elegir el umbral y medir TPR en el mismo test infla el resultado.
- **Wilson sobre n/DE** se acepta solo para comunicación rápida, nunca como cifra principal.
- **Hanley–McNeil** queda como referencia teórica; no se usa para afirmar precisión sobre datos agrupados.

### 5.5 Composición propuesta (responde a E10)

| Categoría | v0.5 mínima | v1 definitiva | Nota |
|---|---|---|---|
| A · humano publicado | 400 | 700 | Wikipedia, Wikisource, dominio público |
| B · humano consentido | 500 | **900** | **150 por país** en 6 países |
| C · desde cero | 250 | 900 | 3–4 familias de generador |
| D · continuación | 150 | 600 | sobre 600 originales |
| E · reescritura | 150 | 900 | sobre 900 originales |
| **F · híbrido** | **50** | **240** | **nuevo: sin F no hay E5** |
| **Total** | **1.500** | **4.240** | |

### 5.6 Qué sostiene cada tamaño (DE = 1,6)

| Afirmación | v0.5 (1.500) | v1 (4.240) |
|---|---|---|
| FPR@1 % global | ±0,91 pp | **±0,64 pp** |
| AUROC global | ±2,2 pp | **±1,14 pp** |
| FPR@1 % por género (9) | no calculable | **±2,38 pp** |
| FPR@1 % por país (150 c/u) | no calculable | **±2,80 pp** |
| TPR por familia de modelo | ±4,62 pp | **±4,40 pp** |
| TPR en F (E5) | ±15,25 pp | **±7,26 pp** |

**Consecuencia que corrige el informe:** con 4.240 documentos **no** se puede sostener un FPR por género de ±2 pp; haría falta ~1.900 negativos, es decir ~3.000 documentos solo del lado humano. Hay dos salidas honestas: reportar ±2,38 pp y decirlo, o agrupar los 9 géneros en **4 macrogéneros** (informativo, académico, conversacional, literario/legal) y entonces sí cabe ±2 pp.

### 5.7 Viabilidad con 0 USD

| Componente | v1 | Cómo | Horas estimadas |
|---|---|---|---|
| Humanos A + B | 1.600 | Wikipedia/Wikisource (A) + 900 donaciones con consentimiento (B) | ~230 h |
| Máquinas C + D + E | 2.400 | Niveles gratuitos (200–500/día) o modelos locales pequeños | ~40 h de operación |
| Híbridos F | 240 | 30–40 voluntarios × 6–8 ediciones con registro | ~100 h |
| Anotación doble (10 %) | 424 | 2 anotadores | ~60 h |

**Total: 0 USD y ~430 horas de trabajo humano.** Si esas horas no existen, el corpus real es v0.5 (1.500 documentos) y entonces **E2, E4 y E5 no se publican**: quedan E1 y E3, con intervalos anchos.

---

## 6. Limitaciones que seguirían existiendo

1. **ρ es desconocido hasta el piloto.** Determina si varias afirmaciones son posibles o no.
2. **F será un híbrido de laboratorio.** Edición controlada de borradores de IA por voluntarios: mide un proceso, no el uso espontáneo. E5 dirá «detecta este tipo de híbrido», no «detecta híbridos».
3. **Representatividad latinoamericana: no demostrable.** 150 documentos por país es una **cuota estratificada**, no una muestra probabilística. Se podrá escribir «incluye 150 textos de autores que declaran México»; nunca «representa a México».
4. **Los modelos gratuitos no son los que usa la gente.** Sin acceso de pago a modelos frontera, C y E estarán dominados por modelos abiertos pequeños; la generalización a GPT-4/Claude/Gemini queda sin medir.
5. **Contaminación del preentrenamiento: no auditable.** Solo se mitiga declarando la fecha de corte de cada generador.
6. **Licencias.** AuTexTification 2023 es NC-SA: sirve para medir, no para un producto comercial. Un corpus propio debería publicarse con licencia compatible (p. ej. CC BY-SA) para ser redistribuible.
7. **Componente gigante.** Una fuente con cientos de textos hunde la independencia efectiva sin que se note en el total.
8. **Wilson sobre n/DE es una aproximación.** La cifra publicable es el bootstrap por componentes.

---

## 7. Alineación con las cuatro etapas de Umbral

| Etapa | Qué necesita del corpus | Estado de este diseño |
|---|---|---|
| 1 · Perfiles multidimensionales sin veredictos | Nada: funciona con texto suelto | No afectada |
| 2 · Investigación con corpus etiquetado y control de fugas | Corpus A–F, particiones por componente | **Este documento** |
| 3 · Clasificadores y detectores académicos | Splits train/dev/test por experimento, métricas con IC | Depende de la aprobación de v0.5/v1 |
| 4 · Agregación calibrada y comparación con proveedores | Conjunto de calibración separado y no filtrado | Requiere reservar un split adicional; no está contemplado todavía |

La distinción peninsular/latinoamericano se mantiene como criterio: **ninguna cifra medida en español peninsular se presentará como rendimiento en español latinoamericano**.

---

## 8. Decisiones pendientes de aprobación

1. **Etiquetado:** ¿tres clases (humano / máquina / mixto) o binario con mixto excluido?
2. **Tamaño:** ¿v1 (4.240 documentos, ~430 h) o v0.5 (1.500, ~150 h, sin E2/E4/E5)?
3. **Géneros:** ¿9 géneros con ±2,38 pp por género, o 4 macrogéneros con ±2 pp?

Ninguna de las tres se puede resolver con más investigación: son decisiones de alcance.

---

## Anexo · Fórmulas y reproducibilidad

- **Wilson (1927):** `(p̂ + z²/2n ± z·√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n)`, con z = 1,95996.
- **Hanley–McNeil (1982):** `SE(A) = √[(A(1−A) + (n₁−1)(Q₁−A²) + (n₀−1)(Q₂−A²)) / (n₁n₀)]`, con `Q₁ = A/(2−A)`, `Q₂ = 2A²/(1+A)`.
- **Efecto de diseño:** `DE = 1 + (m−1)ρ`; `n_eff = n/DE`.
- **Correlación (Fisher, α = 0,05, potencia 80 %):** n ≈ 85 para r = 0,3; 194 para r = 0,2; 783 para r = 0,1.

Todas las cifras de este documento se recalcularon con Python estándar (sin dependencias) en la sesión de revisión. Si algún número no coincide con `DATASET_RESEARCH.md`, **prevalece este documento**.
