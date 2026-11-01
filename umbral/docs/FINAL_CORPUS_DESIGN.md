# Diseño definitivo del corpus de Umbral

**Versión:** 1.0 · **Fecha:** 30 de octubre de 2026
**Estado:** **NO aprobado.** Recomendación condicionada, pendiente de la auditoría de consistencia del §5. Nada de este documento autoriza a empezar a recoger datos.
**Sustituye a:** §3, §4 y §5 de `DATASET_RESEARCH.md` y al documento `DESIGN_REVIEW.md`. **Ninguno de los dos se ha modificado**; quedan como referencia histórica.

**Restricciones respetadas en su elaboración:** sin descargas, sin instalación de dependencias, sin cambios en la aplicación, sin commits ni push. La simulación de componentes se ejecutó con Python estándar sobre datos sintéticos.

---

## 1. Etiquetado definitivo

### 1.1 Esquema aprobado

| Clase | Categorías | Predicado |
|---|---|---|
| **Humano** | A, B | `∀s: o(s)=H` |
| **Máquina** | C, E | `∀s: o(s)=M` ∧ el texto no contiene fragmento humano |
| **Mixto** | D, F | contiene fragmentos `H` y `M`, o contiene `M` editado por persona |

Objetivos binarios derivados del mismo registro:

- **`target_clean`** — Humano (A,B) vs Máquina (C,E). Excluye mixtos. Es el contraste sin contaminación interna.
- **`target_any_ai`** — Humano vs *cualquier* participación de IA (C,D,E,F). Es el escenario de despliegue.

### 1.2 Por qué E es máquina y D/F son mixtos

La clasificación responde a **quién escribió los tokens**, no a quién tuvo la idea. Es la única definición que un detector puede aprender y que un auditor puede verificar.

| Categoría | Tokens escritos por humano | Tokens escritos por máquina | Clase |
|---|---|---|---|
| A, B | 100 % | 0 % | Humano |
| C | 0 % | 100 % | Máquina |
| **E** | **0 %** | **100 %** | **Máquina** |
| **D** | prefijo (p. ej. 30 %) | continuación (70 %) | **Mixto** |
| **F** | ediciones | borrador (mayoría) | **Mixto** |

E conserva el **contenido** de un documento humano, pero **ni un solo token** del original: si el detector ve el texto, lo que ve es prosa de máquina. D conserva texto humano literal, y F contiene decisiones de redacción humanas sobre texto de máquina. Por eso D y F no pueden llamarse «máquina» sin falsear el FPR.

**Consecuencia que hay que aceptar:** E tiene autoría textual de máquina y autoría intelectual humana. Eso se registra, no se diluye.

### 1.3 Procedencia del contenido ≠ autoría del fragmento

Son dos ejes ortogonales y el registro guarda los dos:

```
text_origin      ∈ {human, machine, mixed}     quién escribió los tokens
content_origin   ∈ {human_parent, model, mixed} de dónde vienen las ideas y la estructura
```

| Caso | `text_origin` | `content_origin` |
|---|---|---|
| A, B | human | human |
| C (instrucción breve) | machine | model |
| **E (reescritura)** | machine | **human_parent** |
| **D (continuación)** | mixed | mixed |
| **F (borrador IA + edición)** | mixed | mixed |

Con esto, un detector puede analizarse contra «autoría textual» y un estudio de originalidad contra «procedencia del contenido». Mezclarlos era el error del esquema anterior.

### 1.4 Fragmentos

```
spans: [{start, end, origin: "H"|"M", edited: bool, editor_id?}]
boundary_index        solo D: token donde acaba el prefijo humano
human_share           calculado; nunca estimado
human_share_method    "boundary" | "edit_diff" | null
```

- **D:** `human_share = boundary_index / n_tokens` (exacto).
- **F:** `human_share = 1 − tokens_preservados_del_borrador / tokens_finales` (diff por tokens).
- **Cualquier otro caso:** `human_share = null` y el documento queda fuera de los análisis que dependan de esa cifra.

### 1.5 Anotación reproducible

Manual v1 con árbol de decisión · doble anotación del 10 % · κ de Cohen para categóricas y α de Krippendorff con offsets para fragmentos · registro JSONL **solo-añadir** con `label_version` · validaciones automáticas (todo D con `boundary_index`, todo F con log de edición, ningún `human_share` sin método).

---

## 2. Diseño por etapas

| | **Piloto** | **v0.5** | **v1 (avanzada)** |
|---|---|---|---|
| Documentos | **600** | **1.500** | **4.240** |
| Familias (originales) | 120 | 300 | 848 |
| Versiones humanas (A+B) | 120 | 300 | 1.600 |
| Versiones de IA (C+E) | 240 | 600 | 1.800 |
| Mixtos (D+F) | 240 | 600 | 840 |
| Géneros | 3 | 6 | 9 |
| Países con autor declarado | 2 | 3 | 6 |
| Familias de generador | 2 | 3 | 4 |
| Horas estimadas | **70 h** | **150 h** | **430 h** |
| Coste monetario | 0 USD | 0 USD | 0 USD |

### 2.1 Composición exacta por categoría

| Categoría | Piloto | v0.5 | v1 |
|---|---|---|---|
| A · humano publicado | 60 | 130 | 700 |
| B · humano consentido | 60 | 170 | 900 |
| C · generado desde cero | 120 | 300 | 900 |
| D · continuación | 120 | 300 | 600 |
| E · reescritura | 120 | 300 | 900 |
| **F · híbrido** | **120** | **300** | **240** |
| Total | 600 | 1.500 | 4.240 |

En el piloto y en v0.5 cada familia genera las cinco versiones; en v1 la proporción cambia porque A y B se amplían para sostener precisión estadística del lado humano.

### 2.2 Recursos gratuitos concretos y su caducidad

| Recurso | Uso | Riesgo |
|---|---|---|
| Wikipedia ES / Wikisource (dumps) | Texto humano A | Ninguno de licencia; requiere filtrar revisiones por fecha |
| Voluntarios con consentimiento | Texto humano B y ediciones F | Depende de personas, no de cuotas |
| Niveles gratuitos de modelos (200–500 req/día por proveedor) | C, D, E | **No garantizados**: pueden cambiar sin aviso |
| Modelos abiertos pequeños en CPU | Alternativa si caen las cuotas | Calidad menor y mucho más lentos |
| `scikit-learn` + Python estándar | Métricas y agregación | — |

**Ninguna etapa depende de una cuota gratuita concreta para ser válida.** Si un proveedor retira su nivel gratuito a mitad de la recolección, se sustituye el generador y se registra la fecha: los documentos ya generados conservan su `generator_version` y siguen siendo utilizables. Lo que **no** se hace es mezclar dos versiones de un modelo sin registrarlo.

### 2.3 Qué se puede ejecutar en cada etapa

| Experimento | Piloto 600 | v0.5 1.500 | v1 4.240 |
|---|---|---|---|
| E1 · in-domain | Solo verificación de flujo | Sí, con IC anchos | Sí |
| E2 · modelo no visto | **Sí, indicativo** | **Sí** | Sí |
| E3 · género no visto | **No** (test ≈ 50 docs) | **No** (test ≈ 160 docs) | **Sí, exploratorio** (test ≈ 520) |
| E4 · variedad no vista | **No** (test ≈ 75 docs) | **No** (test ≈ 230 docs) | **Sí** (test ≈ 800) |
| E5 · modo no visto (F) | No concluyente | **Sí, indicativo** | Sí |

Los tamaños de test de E3–E5 proceden de la simulación del §5 y no de una suposición.

---

## 3. Macrogéneros

Se conservan **los nueve géneros en los metadatos**. Los cuatro macrogéneros son una capa de **reporte**, no de entrenamiento ni de recolección.

| Macrogénero | Géneros incluidos | Criterio |
|---|---|---|
| **G1 · Informativo publicado** | noticia, how-to | Expositivo, publicado, longitud media-alta |
| **G2 · Académico-argumentativo** | ensayo | Argumentación extensa, registro formal, un solo género |
| **G3 · Digital espontáneo** | tuit, conversación, correo, reseña | Breve, informal o dialógico, producido por personas en plataformas |
| **G4 · Especializado** | ficción, legal | Registros especializados, longitud alta, producción experta |

**Por qué así:** agrupa por registro, longitud y contexto de producción, que son los tres factores que más afectan a las métricas de estilo. **Lo que se pierde:** G4 mezcla ficción (creativa) con legal (formularia), y G2 contiene un solo género, de modo que no mide variabilidad interna. Se acepta a cambio de tamaños utilizables; ambas limitaciones se declaran en cada informe.

**Márgenes recalculados con la distribución real** (efecto de diseño 1,6):

| Macrogénero | Géneros | v0.5 · H | FPR@1 % | v1 · H | FPR@1 % |
|---|---|---|---|---|---|
| G1 · Informativo | 2 | 67 | ±5,95 pp | 356 | ±1,49 pp |
| G2 · Académico | 1 | 33 | **±10,91 pp** | 178 | ±2,38 pp |
| G3 · Digital | 4 | 133 | ±3,15 pp | 711 | ±0,97 pp |
| G4 · Especializado | 2 | 67 | ±5,95 pp | 356 | ±1,49 pp |

Reparto **proporcional al número de géneros** (2/1/4/2 sobre 300 y 1.600 humanos), no a partes iguales.

**Conclusión:** en **v0.5 ningún macrogénero permite una afirmación sobre el 1 %**: el mejor caso es ±3,15 pp y el peor ±10,91 pp. Los macrogéneros solo son reportables en v1, y aun allí G2 —que contiene un único género— queda en ±2,38 pp. Con los nueve géneros, v1 daría ±2,38 pp por género: por eso se agrupa para el reporte principal y la granularidad se presenta como exploratoria.

---

## 4. Particiones

### 4.1 Claves

| Clave | Tipo | Normalización |
|---|---|---|
| `family_id` | identidad | — |
| `author_pseudo_id` | identidad | seudónimo estable; vacío si no se conoce |
| `source_document_id` | identidad | **URL por página**: esquema + host + ruta, sin query, sin fragmento, sin `www`, minúsculas, sin barra final |
| `near_dup_cluster` | identidad | MinHash de 5-gramas de palabras, Jaccard ≥ 0,75 |
| `prompt_instance_id` | identidad | hash del prompt exacto |
| `prompt_template_id` | **eje** | instrucción sin variables |
| `topic_cluster` | **eje (medido)** | k-means sobre TF-IDF, k ≈ n/20, con tope de 6 familias por cluster |
| `genre`, `country`, `model_family`, `mode` | **ejes** | — |

**Dominio frente a página:** se bloquea por **página**, no por dominio. Bloquear por dominio convierte cualquier periódico en una componente única. El dominio se usa solo para las cuotas de recolección.

### 4.2 Qué significa «eje» y por qué no es una excusa

Un eje no se bloquea globalmente porque **es el objeto del experimento**: E3 oculta géneros, E4 países, E2 modelos. Bloquearlos siempre haría imposible ocultarlos. Pero eso no deja la fuga sin control: se **mide** el solapamiento entre train y test para cada eje y se reporta:

```
overlap_eje = |valores(eje) en test ∩ valores(eje) en train| / |valores(eje) en test|
```

Si `overlap` supera el 20 %, el resultado se marca como **no generalizable a ese eje** y se publica el valor medido junto a la métrica.

### 4.3 Las cinco particiones

| Exp. | Clave oculta | Train | Test | Verificación |
|---|---|---|---|---|
| **E1** | ninguna | 80 % de componentes | 20 % de componentes | componentes disjuntas |
| **E2** | 2 familias de generador | C y E de las otras | C y E de las ocultas + sus padres | valores de `model_family` disjuntos |
| **E3** | 2 géneros | componentes puras en los otros 7 | componentes puras en los 2 ocultos | `genre` disjunto |
| **E4** | 2 países | componentes puras en los otros 4 | componentes puras en los 2 ocultos | `country` disjunto |
| **E5** | F y E retenido | C, D, E parcial | **F completo** + E retenido | `mode` disjunto |

Una componente **impura** en el eje (contiene familias de ambos lados) **no se usa en ese experimento**. Esa pérdida se cuantifica en §5.3.

---

## 5. Riesgo de componentes gigantes

### 5.1 Simulación

Corpus sintético con estructura plausible: familias con autor, fuente, tema y prompt; cuotas variables; 3 % de casi duplicados; 15–20 semillas por escenario. El código está descrito al final y se ejecutó con Python estándar.

### 5.2 Sin cuotas de recolección, el corpus colapsa

| Corpus | Claves | Componentes | Mayor | % en gigantes |
|---|---|---|---|---|
| 600 | identidad | 2,3 | 592 | 98,7 % |
| 600 | + tema | 1,0 | 600 | 100 % |
| 1.500 | identidad | 4,0 | 1.482 | 98,8 % |
| 4.240 | identidad | 9,5 | 4.194 | 98,9 % |

**Hallazgo principal:** el cierre transitivo, sin topes de recolección, produce **una sola componente**. Cualquier autor prolífico o cualquier tema compartido conecta todo con todo. La partición no es un problema de algoritmo, es un problema de **diseño de la recolección**.

### 5.3 Con topes absolutos (fuente ≤ 6 familias, autor ≤ 3, tema ≤ 6, prompt ≤ 8)

| Corpus | Claves | Componentes | Mediana | p90 | p95 | Mayor | % en gigantes | % utilizable |
|---|---|---|---|---|---|---|---|---|
| 600 | identidad | 54 | 5 | 15 | 38 | 176 | 42,9 % | **57,1 %** |
| 600 | + tema | 29 | 5 | 10 | 47 | 434 | 72,3 % | 27,7 % |
| 600 | + tema + prompt | 15 | 5 | 49 | 455 | 519 | 86,6 % | 13,4 % |
| 1.500 | identidad | 164 | 5 | 11 | 21 | 276 | 23,1 % | **76,9 %** |
| 1.500 | + tema | 101 | 5 | 7 | 12 | 914 | 60,9 % | 39,1 % |
| 1.500 | + tema + prompt | 63 | 5 | 7 | 11 | 1.153 | 76,9 % | 23,1 % |
| 4.240 | identidad | 528 | 5 | 10 | 18 | 406 | 10,3 % | **89,7 %** |
| 4.240 | + tema | 366 | 5 | 9 | 12 | 1.998 | 47,1 % | 52,9 % |
| 4.240 | + tema + prompt | 245 | 5 | 7 | 10 | 2.850 | 67,2 % | 32,8 % |

**Lectura:** bloquear por tema o por plantilla de prompt **no es gratis**: reduce el corpus utilizable del 57 % al 28 % en el piloto y del 90 % al 33 % en v1. No se eliminan esas claves por comodidad; se decide con el coste delante:

- **Tema:** no se usa como clave de bloqueo global. Se controla en la recolección (≤ 6 familias por cluster) y se **mide** su solapamiento entre particiones. La variante «tema bloqueado» se ejecuta como **análisis de sensibilidad** y se reporta su coste (28 % del corpus en el piloto).
- **Plantilla de prompt:** igual, salvo en el experimento que la estudie.

### 5.4 Coste por experimento

Documentos utilizables tras el cierre, con topes absolutos:

| Corpus | E2 (train/test) | E3 (train/test) | E4 (train/test) |
|---|---|---|---|
| 600 | 110 / 125 | 202 / **46** | 165 / **74** |
| 1.500 | 377 / 392 | 691 / **161** | 571 / **234** |
| 4.240 | 1.263 / 1.259 | 2.229 / **517** | 1.824 / **800** |

Aplicando la regla «cada contribuyente pertenece a un solo género y a un solo país» (que hace puras las componentes que forma):

| Corpus | E3 test | E4 test |
|---|---|---|
| 600 | 55 | 91 |
| 1.500 | 192 | 247 |
| 4.240 | 578 | 824 |

**Conclusión:** **E3 y E4 no son ejecutables en el piloto ni en v0.5.** Necesitan al menos ~500 documentos de test por eje para un resultado exploratorio, y eso solo se alcanza en v1. Es una limitación estructural del cierre transitivo, no un defecto de implementación.

### 5.5 Medidas anti-gigante (todas en la recolección, no en la partición)

1. Tope de **6 familias por fuente** y **3 por autor**.
2. Tope de **6 familias por cluster de tema**; el clustering se rehace si se supera.
3. **Página, no dominio**, como clave de fuente.
4. Regla del **contribuyente único**: un autor aporta a un solo género y un solo país.
5. Regla de exclusión: una componente mayor que el **5 % del corpus** va solo a *train* y se excluye de toda evaluación.
6. Informe obligatorio por partición: nº de componentes, mediana, p90, p95, mayor, % excluido.

---

## 6. Cálculos estadísticos

### 6.1 Protocolo de conjuntos (fijado antes de medir)

| Conjunto | Uso | Regla |
|---|---|---|
| **train** | ajuste del detector | 60 % de componentes |
| **dev** | selección de modelo **y de umbral** | 20 % |
| **calib** | calibración de probabilidades (Platt/isotónica) | 10 % |
| **test** | medición final, congelado | 10 % |

**El umbral se elige en `dev` con el FPR objetivo y se aplica una sola vez en `test`.** Elegirlo en test infla el TPR entre 3 y 8 puntos en corpus de este tamaño; no se hace.

**En el piloto no hay `test`**: se trabaja con validación cruzada por componentes sobre `dev`, y **no se publica ninguna cifra de rendimiento**.

### 6.2 Wilson (independiente) frente a bootstrap agrupado

| Método | Cuándo | Qué mide |
|---|---|---|
| Wilson sobre n/DE | comunicación rápida | aproximación conservadora |
| **Bootstrap por componentes** (2.000 réplicas) | cifra publicable | IC que respeta la dependencia |
| Hanley–McNeil | solo referencia teórica | no usar para afirmar precisión |

### 6.3 Piloto 600 — qué se puede decir (y qué no)

Composición 120 H · 120 C · 120 D · 120 E · 120 F. DE = 1,6 supuesto; se sustituirá por el medido.

| Cantidad | Valor con DE | Comentario |
|---|---|---|
| FPR@1 % global | **±3,47 pp** | No distingue un 1 % de un 3 % |
| TPR (H vs C+E) | ±7,26 pp | Con 150 positivos efectivos |
| TPR (H vs C+D+E+F) | ±5,16 pp | — |
| AUROC (limpio) | ±3,90 pp | — |
| AUROC (cualquier IA) | ±3,12 pp | — |
| FPR por macrogénero | **±11,85 pp** | Inútil: no se reporta |
| Calibración (ECE) | no estimable | Requiere ≥ 1.000 documentos |

**El piloto sirve para cuatro cosas y ninguna más:** verificar el flujo de datos, medir ρ (ICC por métrica), detectar defectos de etiqueta, y estimar tiempos. **No sirve para proclamar precisión.**

### 6.4 v0.5 1.500 — qué se puede afirmar

| Cantidad | Valor con DE |
|---|---|
| FPR@1 % global | **±1,75 pp** |
| TPR (H vs C+E) | ±4,62 pp |
| AUROC (limpio) | ±2,46 pp |
| AUROC (cualquier IA) | ±1,97 pp |
| FPR por macrogénero | entre ±3,15 y ±10,91 pp |
| ECE | todavía no fiable (5 bins máximo) |

### 6.5 v1 4.240 — qué se puede afirmar

| Cantidad | Valor con DE |
|---|---|
| FPR@1 % global | **±0,64 pp** |
| TPR (H vs C+E) | ±2,67 pp |
| AUROC | ±1,33 pp |
| FPR por macrogénero | ±0,97 a ±2,38 pp |
| FPR por país | ±2,80 pp |

### 6.6 Documentos totales frente a documentos independientes

Regla de reporte obligatoria en toda tabla:

```
n_documentos   n_componentes   n_efectivo (n/DE)   DE   método del IC
```

Un resultado con 4.240 documentos y 528 componentes **no** son 4.240 observaciones. Publicar solo la primera cifra es el error que este documento corrige.

---

## 7. Costes y tiempos

| Etapa | Documentos | Horas de recolección | Horas de anotación | Horas de generación | Total |
|---|---|---|---|---|---|
| Piloto | 600 | 25 | 12 | 8 | **~70 h** |
| v0.5 | 1.500 | 55 | 30 | 20 | **~150 h** |
| v1 | 4.240 | 150 | 90 | 45 | **~430 h** |

Desglose del piloto: 120 textos humanos (60 de Wikipedia + 60 donados, 15 min cada uno ≈ 30 h), 120 ediciones F (20 min ≈ 40 h con 12 voluntarios), 360 generaciones (≈ 8 h de operación), doble anotación de 60 documentos (≈ 12 h).

**Riesgo de calendario:** las 40 h de F son el cuello de botella real, no la generación. Si no hay voluntarios, el piloto se reduce a 60 F y E5 pasa a «no evaluable».

---

## 8. Limitaciones que persisten

1. **ρ se desconoce**: todos los márgenes usan DE = 1,6 como supuesto. El piloto lo medirá.
2. **E3 y E4 no son posibles antes de v1**, por el coste del cierre transitivo.
3. **F es un híbrido de laboratorio**, no uso espontáneo.
4. **Representatividad latinoamericana no demostrable**: 150 documentos por país es una cuota, no una muestra.
5. **Sin modelos frontera gratuitos**, C y E estarán dominados por modelos abiertos pequeños.
6. **La simulación es sintética**: describe el comportamiento del algoritmo bajo supuestos plausibles, no el corpus real. Los valores exactos cambiarán; el orden de magnitud, no.
7. **Contaminación del preentrenamiento no auditable**.
8. **La componente mayor siempre existirá**: con topes, en v1 es ~10 % del corpus.

---

## 9. Licencia y decisión comercial

**Situación:** AuTexTification 2023 es **CC-BY-NC-SA-4.0**; IberAuTexTification 2024 es **CC-BY-NC-ND-4.0**; MULTITuDE es de acceso restringido y no redistribuible.

**Recomendación:** mantener Umbral como **herramienta gratuita de investigación** y conservar la opción comercial **por separación de datos**, no por renuncia:

| Nivel | Contenido | Uso permitido |
|---|---|---|
| **T1 · reutilizable** | Corpus propio (CC BY-SA), Wikipedia (CC BY-SA), OASSt2 (Apache-2.0), datasets MIT | Entrenamiento, evaluación y producto |
| **T2 · solo investigación** | AuTexTification (NC-SA), IberAuTexTification (NC-ND), MULTITuDE (restringido) | **Solo evaluación y publicaciones**; nunca entrenar el modelo desplegable |

Regla operativa: **cada artefacto de modelo declara su nivel de datos**, y el modelo de producto **solo** se entrena con T1. T2 sirve para medir y para publicar, que es exactamente para lo que sus licencias lo permiten.

Matiz jurídico que no se puede resolver aquí: el alcance de *share-alike* sobre modelos entrenados con texto NC-SA es discutido. La postura conservadora —y la que se adopta— es **no entrenar con T2 ningún modelo que pueda llegar a un producto**.

---

## 10. Recomendación final (condicionada, no aprobada)

**Recomendación técnica:** el piloto de 600 documentos es viable **si y solo si** se cumplen las siete condiciones siguientes antes de recoger el primer texto. **La aprobación queda retenida**: no se ha verificado aún que los porcentajes del §5 sean reproducibles (ver aviso al final del anexo).

1. **Cuotas fijadas en el recolector**, no después: ≤ 6 familias por fuente, ≤ 3 por autor, ≤ 6 por cluster de tema.
2. **Regla del contribuyente único**: cada autor aporta a un solo género y un solo país.
3. **Página como unidad de fuente**; el dominio solo para cuotas.
4. **F desde el primer día**, con log de edición y diff; sin log no hay F.
5. **Ninguna cifra de rendimiento del piloto**, ni interna: solo ICC, tiempos y defectos de etiqueta.
6. **Protocolo de umbral cerrado**: dev para selección, test solo en v0.5 y v1.
7. **Nivel de licencia declarado por documento** desde el inicio (T1/T2).

**Criterios de parada** (si el piloto los incumple, se rediseña antes de gastar más horas):

- ρ > 0,6 en la mayoría de métricas ⇒ los tamaños de v0.5 no bastan y hay que replantear el DE.
- Corpus utilizable < 50 % tras el cierre ⇒ topes demasiado laxos.
- κ < 0,6 en la doble anotación de A–F ⇒ el manual no es aplicable y hay que reescribirlo.
- Menos de 100 documentos F con log válido ⇒ E5 sale del protocolo.

**Lo que este documento no autoriza:** descargar AuTexTification, generar los 2.400 textos de máquina de v1, ni construir el corpus definitivo. Solo el piloto, y solo con las condiciones anteriores.

---

## Anexo · Reproducibilidad de la simulación

Los valores del §5 proceden de un script de ~90 líneas ejecutado con **Python estándar** (sin `numpy`, `scipy` ni `pandas`), semillas 0–14 y 0–19 según el bloque. Parámetros exactos:

- **Familias:** `N / 5`; cada familia recibe autor, fuente, tema y plantilla de prompt por muestreo Zipf (s ≈ 1,2) sobre poblaciones de tamaño `0,7·F`, `0,45·F`, `0,30·F` y `0,35·F`.
- **Versiones:** 5 por familia (A–F repartidas), atributos heredados de la familia.
- **Casi duplicados:** 3 % de documentos enlazados a un documento aleatorio.
- **Topes:** porcentuales (3 % de familias por fuente, 2 % por autor) o absolutos (6 / 3 / 6 / 8).
- **Union-Find** con compresión de caminos y unión por tamaño; una componente por valor de clave.
- **Métricas:** nº de componentes, mediana, p90, p95, mayor, % de documentos en componentes > 5 % de N, % utilizable.
- **Experimentos:** una componente es *pura* en un eje si todos sus documentos comparten el mismo valor; las impuras se excluyen de ese experimento y se contabilizan aparte.

Las cifras son medias de las semillas. La simulación describe el **comportamiento del algoritmo** bajo supuestos plausibles, no el corpus real: los valores exactos cambiarán al medir el corpus, el orden de magnitud no.

> **Aviso de verificación (30/10/2026).** Los scripts que produjeron las cifras del §5 **no están conservados**: vivían en `/tmp/sim` y el entorno se reinició. Las cifras siguen siendo las que se obtuvieron, pero **hoy no son reproducibles a partir del repositorio**. Mientras eso no se corrija, los valores del §5 deben tratarse como *no verificados* y la recomendación del §10 como *retenida*. La reconstrucción de los scripts está pendiente de autorización explícita.
