# Base científica de evaluación de Umbral — inventario de datos, licencias y diseño del corpus

**Estado:** investigación documental. **No se descargó ningún dataset, no se modificó código, no se instalaron dependencias.**
**Fecha de cierre de esta revisión:** 30 de octubre de 2026.
**Alcance:** qué datos existen, cuáles se pueden usar legítimamente, con qué calidad científica y qué tamaño hace falta para sostener cada afirmación que Umbral quiera publicar.

> **Advertencia legal.** Este documento **no es asesoría jurídica**. Las licencias se transcriben tal como aparecen en la fuente citada y se interpretan de forma **conservadora**: ante ambigüedad, el dataset se marca como *pendiente de autorización*. La calificación final de cada uso corresponde a quien publique.

---

## Resumen ejecutivo

1. **Sí existen corpus grandes en español**, pero **casi todo el «español» disponible es español peninsular**: las fuentes declaradas por AuTexTification 2023 son europeas (COAH/COAR de Jaén, MLSUM/El País, MultiEURLEX, tuits de política española). **No hay ningún corpus de detección con variedad latinoamericana declarada y suficiente.**
2. **El corpus español más moderno y más útil científicamente (IberAuTexTification 2024: GPT-4, Llama-2-70B, Mixtral, GPT-3.5, Cohere, AI21) está bajo CC-BY-NC-ND-4.0** y su propia ficha dice: *«si desea adaptar o construir sobre el dataset, contáctenos»*. Es decir: **sirve para medir, no para construir ni redistribuir** sin autorización.
3. **El corpus de Schaaff/Mindner/Schlippe —el único con etiqueta explícita de «IA-reescrito» en cuatro idiomas— no tiene licencia.** GitHub devuelve `license: null` ⇒ *todos los derechos reservados* por defecto. **Requiere autorización de los autores.**
4. **AuTexTification 2023 es el mejor punto de partida legal**: CC-BY-NC-SA-4.0 explícita, 52.191 textos en español, seis generadores y cinco dominios. Condiciones: uso no comercial, atribución y *share-alike*. Es el candidato para las primeras mediciones reales.
5. **MULTITuDE (11 idiomas, incluido español, 8 LLM) no es descargable**: Zenodo lo publica como *Restricted* con aceptación de términos (solo investigación, prohibido re-compartir). **Requiere solicitud.**
6. **M4 no es una opción para español**: cubre inglés, árabe, búlgaro, chino, indonesio, ruso y urdu — **ningún idioma iberoamericano**. Además su repositorio no tiene licencia.
7. **RAID (MIT, 6,2 M textos, 11 generadores, 4 estrategias de decodificación, 12 ataques adversariales) es el mejor banco para medir robustez**, pero es inglés (con checo y alemán) y sus textos humanos vienen de fuentes de terceros (p. ej. NYT) cuya titularidad el MIT del repositorio no puede ceder.
8. **Para construir el corpus latinoamericano hay que recopilar**, no comprar ni scrapear: Wikipedia ES (CC BY-SA), Wikisource (dominio público), libros de dominio público (CC-BY-SA), reseñas con licencia MIT, y **textos aportados voluntariamente con consentimiento**. Todo lo demás choca con licencias ND/NC o con términos de servicio.
9. **Los 2.000 documentos / 200 por género no sostienen ninguna afirmación fuerte.** Con 200 negativos por género, un FPR del 1 % tiene un intervalo del 95 % de **[0,27 %, 3,57 %]**: el dato no distingue «1 %» de «3,5 %». Un FPR del 1 % con ±0,5 pp exige **≈1.650 negativos**; un AUROC por género con ±2 pp exige **≈2.000 por clase**.
10. **La fuga más grave no es la partición aleatoria: es el diseño emparejado.** En AuTexTification cada texto de máquina es **continuación de un prefijo humano del mismo documento**. Si el humano va a *train* y su continuación a *test*, el clasificador puede memorizar el tema en lugar de aprender el estilo. Cualquier partición debe agrupar por `original_id`, no por fila.

---

## 0. Método: qué significa «verificado» aquí

Cada dato de este informe lleva una marca:

| Marca | Significado |
|---|---|
| **[V]** | Verificado leyendo la fuente primaria en esta revisión (ficha del dataset, `LICENSE`, API de GitHub/Hugging Face, artículo). |
| **[P]** | Parcial: la fuente lo afirma pero no pude abrir el artefacto exacto (p. ej. el PDF completo o el archivo de licencia). |
| **[X]** | No verificado. **No debe usarse para decidir.** |

Procedimientos concretos usados (reproducibles):

- Licencia de repositorios GitHub: `GET https://api.github.com/repos/{owner}/{repo}` → campo `license.spdx_id`. Un `null` significa **sin licencia**, no «licencia libre».
- Licencia de datasets de Hugging Face: `GET https://huggingface.co/api/datasets/{id}` → `cardData.license`; contraste con la sección *Licensing Information* de la ficha.
- Contenido literal de una licencia: `GET https://api.github.com/repos/{owner}/{repo}/license` (base64).
- Composición, tamaño y fuentes humanas: ficha del dataset y artículo de referencia.

**Regla que se aplica en todo el documento:** *disponible públicamente* ≠ *acceso abierto* ≠ *licencia de reutilización*. Un artículo en acceso abierto (CC BY) **no** licencia el dataset que describe. Y la licencia del **código** de un repositorio **no** licencia los **datos** que contiene.

### 0.1 Matriz de decisión

| # | Dataset | Idioma ES | Licencia de datos | Entrenar | Redistribuir | Veredicto |
|---|---|---|---|---|---|---|
| D01 | AuTexTification 2023 | ✅ 52.191 | CC-BY-NC-SA-4.0 | Sí, no comercial | Sí, NC + SA | **Uso inmediato (medición)** |
| D02 | IberAuTexTification 2024 | ✅ 33.980 | CC-BY-NC-ND-4.0 | Discutible | **No** | **Solo evaluación / pedir permiso** |
| D03 | Human-AI-Generated Text (Schaaff) | ✅ ~300 | **Sin licencia** | No | No | **Pedir permiso** |
| D04 | MULTITuDE | ✅ 11.586 | *Restricted* + términos | Sí, si se concede | **No** (prohibido) | **Solicitar acceso** |
| D05 | M4 | ❌ | Sin licencia en repo; varía por dominio | No | No | **Descartado para ES** |
| D06 | RAID | ❌ (EN/CS/DE) | MIT (repo) | Sí | Sí, con reservas de terceros | **Uso inmediato (robustez)** |
| D07 | CHEAT | ❌ | MIT (repo) | Con reservas | Con reservas | **Solo referencia** |
| D08 | HC3 | ❌ (EN/ZH) | CC-BY-SA-4.0 | Sí | Sí | **Solo referencia** |
| D09 | OASSt2 | ✅ (35 idiomas) | Apache-2.0 | Sí | Sí | **Uso inmediato (texto humano conversacional)** |
| D10 | GPT-2 Output Dataset | ❌ | MIT | Sí | Sí | **Solo referencia histórica** |
| D11 | esCorpius | ✅ 322 GB | CC-BY-NC-ND-4.0 | No | No | **Solo referencia** |
| D12 | Spanish Unannotated Corpora | ✅ 3 B palabras | MIT (repo) sobre fuentes de terceros | Con reservas | Con reservas | **No recomendado** |
| D13 | Wikipedia ES / Wikisource | ✅ | CC BY-SA / dominio público | Sí, con condiciones | Sí, con condiciones | **Base de construcción** |
| D14 | `spanish_books` | ✅ | CC-BY-SA-4.0 | Sí | Sí | **Base de construcción (literario)** |
| D15 | `punta-cana-spanish-reviews` | ✅ (RD) | MIT | Sí | Sí | **Aporte latinoamericano (reseñas)** |
| D16 | TextMachina (herramienta) | — | CC-BY-NC-ND-4.0 | — | — | **Referencia metodológica** |

---

## 1. Inventario

Los campos se presentan en el orden pedido: nombre, autores, año, publicación, enlace oficial, enlace directo de descarga, nº de documentos humanos, nº de documentos IA, idiomas, géneros, modelos generadores, generación vs reescritura, procedencia de los humanos, etiquetas, formato, tamaño, licencia de código, licencia de datos, permiso de entrenamiento, permiso de redistribución.

---

### D01 · AuTexTification 2023

| Campo | Valor |
|---|---|
| **Nombre** | AuTexTification 2023 (IberLEF 2023): detección y atribución de texto generado por máquina |
| **Autores** | Areg Mikael Sarvazyan, José Ángel González, Marc Franco-Salvador, Francisco Rangel, Berta Chulvi, Paolo Rosso |
| **Año** | 2023 |
| **Publicación** | *Procesamiento del Lenguaje Natural* 71:275–288; arXiv:2309.11285 |
| **Enlace oficial** | https://sites.google.com/view/autextification · https://github.com/autextification/AuTexTification-Overview |
| **Descarga directa** | https://huggingface.co/datasets/symanto/autextification2023 (74,3 MB) **[V]** |
| **Docs humanos** | **26.996** (en español) **[V]** |
| **Docs IA** | **25.195** (en español) **[V]** |
| **Idiomas** | Inglés y español **[V]** |
| **Géneros** | 5 dominios: tuits, reseñas, noticias, documentos legales, artículos «how-to» **[V]** |
| **Modelos generadores** | BLOOM-1B1, BLOOM-3B, BLOOM-7B1, Babbage, Curie, `text-davinci-003` **[V]** |
| **Generación vs reescritura** | **Generación por continuación de un prefijo humano** (no reescritura) **[V]** |
| **Procedencia de los humanos** | `multi_eurlex`, `xsum`, `csebuetnlp/xlsum`, `mlsum`, `amazon_polarity`, COAH y COAR (Universidad de Jaén), `carblacac/twitter-sentiment-analysis`, `cardiffnlp/tweet_sentiment_multilingual`, Kaggle «tweets política España», `wiki_lingua` **[V]** |
| **Etiquetas** | `label` (humano/máquina) y `model` para atribución; campos `id`, `prompt`, `text`, `domain` **[V]** |
| **Formato** | Repositorio HF con *loading script* (no convertible al visor automático); exportable a CSV/Parquet **[V]** |
| **Tamaño** | 163.000 instancias totales (ES+EN); 74,3 MB **[V]** |
| **Licencia de código** | Apache-2.0 en el repo del *overview* **[V]** |
| **Licencia de datos** | **CC-BY-NC-SA-4.0** (ficha HF, sección *Licensing Information*) **[V]** |
| **Permiso de entrenamiento** | **Sí, con condiciones**: no comercial, atribución, *share-alike* **[V/P]** |
| **Permiso de redistribución** | **Sí, con condiciones** (NC + SA + atribución), y con la carga adicional de que los textos humanos provienen de terceros **[P]** |

**Notas de auditoría**

- Es el **único corpus español con licencia explícita, verificada y relativamente permisiva** que encontré. Debe ser la primera medición real de Umbral.
- **El «español» es peninsular.** Revisando las fuentes una por una: COAH/COAR (reseñas de hoteles y restaurantes de España), MLSUM (prensa española), MultiEURLEX (legal de la UE), los tuits de Kaggle (política española). **No hay una sola fuente latinoamericana declarada.** Esto no es una inferencia: es la lista completa de fuentes que publica la ficha.
- **La decodificación no está documentada** en la ficha (temperatura, *top-p*, longitud objetivo). Sin esos parámetros, el corpus no es reproducible y no se puede atribuir una diferencia de estilo al modelo en lugar al muestreo.
- El diseño es **emparejado por prefijo**: humano y máquina comparten tema, entidades y registro. Esto abarata la detección y **explica por qué los resultados in-domain son optimistas**.

---

### D02 · IberAuTexTification 2024

| Campo | Valor |
|---|---|
| **Nombre** | IberAuTexTification 2024 (IberLEF 2024) |
| **Autores** | A. M. Sarvazyan, J. Á. González, F. Rangel, P. Rosso, M. Franco-Salvador |
| **Año** | 2024 |
| **Publicación** | *Procesamiento del Lenguaje Natural* 73:421–434 |
| **Enlace oficial** | https://portal.odesia.uned.es/en/dataset/iberautextification-2024 |
| **Descarga directa** | https://huggingface.co/datasets/Genaios/iberautextification (168.128 instancias) **[V]** · Zenodo 10.5281/zenodo.10853560 (train) y 10.5281/zenodo.11034382 (test): **ambos *Restricted*** **[V]** |
| **Docs humanos** | **17.317 en español** (suma de la columna ES de la fila `human`: chat 2.592, how-to 2.237, literario 2.752, noticias 2.397, reseñas 2.890, tuits 2.046, wiki 2.403) **[V, calculado]** |
| **Docs IA** | **16.663 en español** (33.980 totales − 17.317; coincide con la suma de los seis generadores por dominio) **[V, calculado]** |
| **Idiomas** | Catalán, inglés, español, euskera, gallego, portugués **[V]** |
| **Géneros** | 7: chat, how-to, noticias, literario, reseñas, tuits, Wikipedia **[V]** |
| **Modelos generadores** | `gpt-4`, `gpt-3.5-turbo-instruct`, `Llama-2-70b-chat`, `Mixtral-8x7B-Instruct`, `cohere.command-text-v14`, `ai21.j2-ultra-v1` **[V]** |
| **Generación vs reescritura** | Generación por continuación de prefijo con **TextMachina** **[V]** |
| **Procedencia de los humanos** | `OpenAssistant/oasst2`, `okapi_hellaswag`, `wiki_lingua`, `casum`, `xlsum`, `oscar`, `ca.wikisource`, `booksum`, `jorgeortizfuentes/spanish_books`, `Euskal-liburu`, `amazon_reviews_multi`, **`beltrewilton/punta-cana-spanish-reviews`**, `b2w-reviews01`, `tweetlid`, Wikipedia **[V]** |
| **Etiquetas** | `label`, `model`, `domain`, `language`, `prompt`, `id` **[V]** |
| **Formato** | HF con *loading script*; Zenodo (restringido) **[V]** |
| **Tamaño** | 168.128 documentos; 33.980 en español **[V]** |
| **Licencia de código** | TextMachina: CC-BY-NC-ND-4.0 **[V]** |
| **Licencia de datos** | **CC-BY-NC-ND-4.0** — la ficha añade: *«In case you wish to adapt or build upon the dataset please contact us»* **[V]** |
| **Permiso de entrenamiento** | **Discutible**: ND prohíbe distribuir material adaptado; entrenar un modelo sobre él es zona gris. **Interpretación conservadora: no.** **[P]** |
| **Permiso de redistribución** | **No** (ND). El portal ODESIA lo anunciaba como CC-BY-4.0: **el portal se equivoca o está desactualizado; prevalece la ficha del dataset** **[V]** |

**Notas de auditoría**

- **Es el corpus más valioso y el más restringido a la vez.** Es el único con GPT-4, Llama-2-70B y Mixtral en español, es decir, el único que mide generalización a modelos que la gente usa hoy.
- **Contradicción documental detectada:** la ficha HF describe en el resumen los seis modelos de 2023 (BLOOM/Babbage/Curie/davinci-003) y, tres párrafos más abajo, lista GPT-4, Llama-2, Mixtral, Cohere y AI21. La tabla de estadísticas confirma los modelos de 2024. **El resumen es un copiar-pegar del año anterior.**
- **Presencia latinoamericana mínima y no cuantificada:** solo `punta-cana-spanish-reviews` (República Dominicana) y `spanish_books` (recopilación chilena de libros de dominio público). No hay desglose por país, así que **no se puede afirmar qué proporción es latinoamericana**.
- **Uso legítimo recomendado:** emplearlo como **banco de evaluación externo** (medir y reportar métricas sin redistribuir texto ni derivados) y **pedir autorización por escrito** si se quiere entrenar o publicar un subconjunto.

---

### D03 · Human-AI-Generated Text Corpus (Schaaff, Schlippe & Mindner)

| Campo | Valor |
|---|---|
| **Nombre** | Human-AI-Generated Text Corpus |
| **Autores** | Kristina Schaaff, Tim Schlippe, Lorenz Mindner (IU International University) **[V]** |
| **Año** | 2023 (corpus educativo) · 2024 (versión que añade noticias en inglés) |
| **Publicación** | ICNLSP 2023, pp. 1–10, Online (ACL Anthology `2023.icnlsp-1.1`). Título: *Classification of Human- and AI-Generated Texts for English, French, German, and Spanish* **[V]** |
| **Enlace oficial** | https://github.com/iu-ai-research/human-AI-generatedTextCorpus (sucesor de `LorenzM97/human-AI-generatedTextCorpus`) **[V]** |
| **Descarga directa** | Archivos `wiki_human_generated.pkl`, `wiki_chatgpt_generated.pkl`, `news_human_generated.pkl`, `news_chatgpt_generated.pkl` en la raíz del repo **[V]** |
| **Docs humanos** | 100 por idioma (EN, FR, DE, ES) + 100 noticias EN **[V]** |
| **Docs IA** | 100 generados + 100 reescritos por idioma **[V]** |
| **Idiomas** | Inglés, francés, alemán, español **[V]** |
| **Géneros** | Educativo (10 categorías: biología, química, geografía, historia, informática, música, política, religión, deportes, artes visuales) + noticias EN **[V]** |
| **Modelos generadores** | ChatGPT (GPT-3.5) **[V]** |
| **Generación vs reescritura** | **Ambas, etiquetadas por separado**: texto generado desde cero y texto humano reescrito por el modelo **[V]** |
| **Procedencia de los humanos** | Artículos de Wikipedia **[V]** |
| **Etiquetas** | Tres clases: humano / IA / IA-reescrito **[V]** |
| **Formato** | `.pkl` (pickle de Python) **[V]** |
| **Tamaño** | Del orden de 1.200 textos; pocos MB **[P]** |
| **Licencia de código** | **Sin licencia** (`license: null` en la API de GitHub) **[V]** |
| **Licencia de datos** | **Sin licencia** ⇒ todos los derechos reservados **[V]** |
| **Permiso de entrenamiento** | **No** sin autorización expresa **[V/P]** |
| **Permiso de redistribución** | **No** **[V/P]** |

**Notas de auditoría**

- **Es el único recurso con etiqueta explícita de «IA-reescrito» en español**, la categoría E del diseño de Umbral. Por eso duele que no tenga licencia.
- **300 documentos por idioma es un tamaño de piloto, no de validación.** El propio artículo reporta para español ≈99 % F1 en IA generado y 86 % de exactitud/F1 en IA reescrito: la reescritura es, medible, mucho más difícil.
- Los humanos son **Wikipedia**: prosa enciclopédica, editada, con convenciones. Un detector entrenado aquí aprende «Wikipedia vs ChatGPT», no «humano vs IA».
- **Acción:** escribir a los autores pidiendo licencia o permiso escrito. Es la vía más barata de conseguir la categoría E en español.

---

### D04 · MULTITuDE

| Campo | Valor |
|---|---|
| **Nombre** | MULTITuDE: Large-Scale Multilingual Machine-Generated Text Detection Benchmark |
| **Autores** | Dominik Macko, Robert Moro, Adaku Uchendu, Jason S. Lucas, Michiharu Yamashita, Matúš Pikuliak, Ivan Srba, Thai Le, Dongwon Lee, Jakub Simko, Maria Bielikova |
| **Año** | 2023 |
| **Publicación** | EMNLP 2023, pp. 9960–9987; arXiv:2310.13606 |
| **Enlace oficial** | https://github.com/kinit-sk/mgt-detection-benchmark |
| **Descarga directa** | https://zenodo.org/records/10013755 — **«Restricted»**: hay que rellenar un formulario y aceptar términos **[V]** |
| **Docs humanos** | **7.992** (todos los idiomas) **[V]** |
| **Docs IA** | **66.089** **[V]** |
| **Idiomas** | 11: EN, ES, RU (train y test); NL, CA, CS, DE, ZH, PT, AR, UK (solo test) **[V]** |
| **Géneros** | Noticias (titulares como *prompt*) **[V]** |
| **Modelos generadores** | 8: `gpt-3.5-turbo`, `gpt-4`, `text-davinci-003`, `alpaca-lora-30b`, `vicuna-13b`, `opt-66b`, `llama-65b`, `opt-iml-max-1.3b` **[V]** |
| **Generación vs reescritura** | Generación a partir del titular de una noticia humana **[V]** |
| **Procedencia de los humanos** | Submuestra de **MassiveSumm** (noticias multilingües) **[V]** |
| **Etiquetas** | `text`, `label` (0/1), `multi_label` (modelo), `split`, `language`, `length`, `source` **[V]** |
| **Formato** | CSV (`multitude.csv`) **[P]** |
| **Tamaño** | 74.081 textos; español: **11.586** **[V]** |
| **Licencia de código** | GPL-3.0 en el repo **[V]** |
| **Licencia de datos** | **Ninguna licencia abierta**: acceso restringido con términos contractuales **[V]** |
| **Permiso de entrenamiento** | **Sí, si se concede el acceso**, y solo para investigación **[V]** |
| **Permiso de redistribución** | **Explicitamente prohibido**: «You will not re-share the dataset with anyone else not included in this request» **[V]** |

**Notas de auditoría**

- El término 4 del formulario dice literalmente: *«You understand how the dataset was created and that the "human" label may not be 100 % correct»*. **Los propios autores advierten de ruido en la etiqueta humana.** Cualquier medición de FPR hereda ese ruido.
- Es el mejor corpus multilingüe para medir **generalización entre idiomas** (el artículo reporta una caída de ~25,7 puntos de F1 al pasar del test inglés a otros idiomas). Pero **no se puede redistribuir**, así que Umbral no puede publicar un benchmark reproducible construido sobre él.
- Al ser de acceso restringido, **tampoco sirve como base de un producto**: si mañana alguien audita Umbral, no podrá reproducir la partición.

---

### D05 · M4 (y SemEval-2024 Task 8)

| Campo | Valor |
|---|---|
| **Nombre** | M4: Multi-generator, Multi-domain, Multi-lingual Black-Box Machine-Generated Text Detection |
| **Autores** | Yuxia Wang, Jonibek Mansurov, Petar Ivanov, Jinyan Su, Artem Shelmanov, Akim Tsvigun, Chenxi Whitehouse, Osama M. Afzal, Tarek Mahmoud, Toru Sasaki, Thomas Arnold, Alham Fikri Aji, Nizar Habash, Iryna Gurevych, Preslav Nakov |
| **Año** | 2024 |
| **Publicación** | EACL 2024 (long), pp. 1369–1407; arXiv:2305.14902 |
| **Enlace oficial** | https://github.com/mbzuai-nlp/M4 |
| **Descarga directa** | Datos enlazados desde el repositorio (sin URL directa estable verificada) **[X]** |
| **Docs humanos** | **35.798** muestreados (3.000 por dominio/lengua, salvo PeerRead con 5.798) **[V, calculado de la tabla]** |
| **Docs IA** | **112.097** (147.895 totales − 35.798 humanos) **[V, calculado de la tabla]** |
| **Idiomas** | Inglés + árabe, búlgaro, chino, indonesio, ruso, urdu. **Sin español, sin portugués, sin catalán** **[V]** |
| **Géneros** | Wikipedia, Reddit ELI5, WikiHow, PeerRead, resúmenes de arXiv + dominios periodísticos por idioma **[V]** |
| **Modelos generadores** | `text-davinci-003`, ChatGPT, GPT-4, Cohere, Dolly-v2, BLOOMz **[V]** |
| **Generación vs reescritura** | Generación desde título/titular **[V]** |
| **Procedencia de los humanos** | Wikipedia (CC BY-SA 3.0), Reddit ELI5, WikiHow (CC-BY-NC-SA), PeerRead (Apache), arXiv (CC0), y corpus nacionales por idioma **[V]** |
| **Etiquetas** | `label`, `model`, `source`, `language` **[P]** |
| **Formato** | JSON/CSV por dominio **[P]** |
| **Tamaño** | ≈148.000 textos muestreados **[V, calculado]** |
| **Licencia de código** | **Sin licencia** (`license: null`) **[V]** |
| **Licencia de datos** | **Sin licencia propia**: «los datos están sujetos a las licencias de los corpus subyacentes» **[V]** |
| **Permiso de entrenamiento** | Depende de cada subcorpus; **no verificable en bloque** **[X]** |
| **Permiso de redistribución** | **No se puede afirmar**; WikiHow es NC, Wikipedia exige SA, etc. **[V/P]** |

**Notas de auditoría**

- **Descartado para Umbral por dos motivos independientes:** no tiene español y su régimen de licencias es una agregación de licencias ajenas que nadie puede auditar de una vez.
- Es, sin embargo, **la mejor referencia metodológica** sobre lo que hay que medir: el artículo demuestra que los detectores **fallan hacia el lado peligroso** (clasifican texto de máquina como humano) en dominios y modelos no vistos.

---

### D06 · RAID

| Campo | Valor |
|---|---|
| **Nombre** | RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors |
| **Autores** | Liam Dugan, Alyssa Hwang, Filip Trhlík, Andrew Zhu, Josh Magnus Ludan, Hainiu Xu, Daphne Ippolito, Chris Callison-Burch |
| **Año** | 2024 |
| **Publicación** | ACL 2024 (long), pp. 12463–12492; arXiv:2405.07940 |
| **Enlace oficial** | https://raid-bench.xyz · https://github.com/liamdugan/raid |
| **Descarga directa** | https://huggingface.co/datasets/liamdugan/raid · `load_dataset("liamdugan/raid")` **[V]** |
| **Docs humanos** | **14.971** documentos (parte no adversarial) **[V]** |
| **Docs IA** | **509.014** generaciones no adversariales; **≈6,29 M** con ataques **[V]** |
| **Idiomas** | Inglés (más checo y alemán en `RAID-extra`) **[V]** |
| **Géneros** | 11: resúmenes arXiv, recetas, Reddit, resúmenes de libros, noticias NYT, poesía, reseñas IMDb, Wikipedia, noticias checas, noticias alemanas, código Python **[V]** |
| **Modelos generadores** | 11: GPT-2 XL, `text-davinci-002`, `gpt-3.5-turbo-0613`, `gpt-4-0613`, Mistral-7B (+chat), MPT-30B (+chat), Llama-2-70B-chat, Cohere Command (+chat) **[V]** |
| **Generación vs reescritura** | **Generación con 4 estrategias de decodificación** (greedy, sampling T=1, y ambas con *repetition penalty* Θ=1,2) + **12 ataques adversariales** (paráfrasis, homóglifos, sinónimos, eliminación de artículos, etc.) **[V]** |
| **Procedencia de los humanos** | Documentos públicos anteriores a 2022 (Wikipedia, arXiv, Reddit, IMDb, NYT, Project Gutenberg, etc.) **[V]** |
| **Etiquetas** | `model`, `decoding`, `attack`, `domain`, `title`, `generation` **[P]** |
| **Formato** | JSONL / HF datasets; tres bloques (train, test, extra) **[V]** |
| **Tamaño** | Train 802 MB (sin ataques) / 11,8 GB (con ataques); test 81 MB / 1,22 GB; extra 275 MB / 3,71 GB **[V]** |
| **Licencia de código** | **MIT** **[V]** |
| **Licencia de datos** | MIT declarada en el repositorio; **los textos humanos son de terceros** (p. ej. noticias del NYT), cuya titularidad el MIT no puede ceder **[V/P]** |
| **Permiso de entrenamiento** | **Sí** para el material propio del banco; **revisar** los documentos humanos de terceros **[V/P]** |
| **Permiso de redistribución** | **Sí** con atribución y aviso de licencia; ídem reserva sobre textos de terceros **[P]** |

**Notas de auditoría**

- **Es el único recurso de esta lista que permite medir lo que de verdad importa**: si un detector sobrevive a cambios de decodificación (temperatura, *repetition penalty*) y a ataques adversariales. La literatura muestra que **no** sobrevive: los detectores caen con paráfrasis y con modelos no vistos.
- **El 10 % del test se publica sin etiquetas** como conjunto oculto. Bien para comparar, mal para calibrar: no se puede ajustar el umbral contra él.
- **No tiene español.** Su valor para Umbral es metodológico: copiar el **esquema experimental** (decodificación × ataque × modelo), no los datos.
- Los documentos humanos son **anteriores a 2022**, lo que reduce —no elimina— el riesgo de que estén en el preentrenamiento de los modelos.

---

### D07 · CHEAT

| Campo | Valor |
|---|---|
| **Nombre** | CHEAT: A Large-scale Dataset for Detecting ChatGPT-writtEn AbsTracts |
| **Autores** | Peipeng Yu, Jiahan Chen, Xuan Feng, Zhihua Xia |
| **Año** | 2023 (v2, 2024) |
| **Publicación** | arXiv:2304.12008 |
| **Enlace oficial** | https://github.com/botianzhe/CHEAT |
| **Descarga directa** | `ieee-{init,generation,polish,fusion}.{jsonl,xlsx}` en el directorio `data/` **[V]** |
| **Docs humanos** | **15.395** resúmenes de IEEE Xplore **[V]** |
| **Docs IA** | **35.304** resúmenes generados por ChatGPT **[V]** |
| **Idiomas** | Inglés **[V]** |
| **Géneros** | Resúmenes científicos de ingeniería e informática **[V]** |
| **Modelos generadores** | `gpt-3.5-turbo` vía API **[V]** |
| **Generación vs reescritura** | **Las dos, y además híbridos**: `generation` (desde cero), `polish` (reescritura de un resumen humano), `fusion` (mezcla humano/IA) **[V]** |
| **Procedencia de los humanos** | Resúmenes indexados en IEEE Xplore, seleccionados con 30 palabras clave **[V]** |
| **Etiquetas** | Por archivo (init / generation / polish / fusion); sin etiqueta a nivel de fila más allá del fichero **[P]** |
| **Formato** | JSONL y XLSX **[V]** |
| **Tamaño** | 50.699 resúmenes; longitud media 163,9 palabras; vocabulario 130.272 **[V]** |
| **Licencia de código** | **MIT** **[V]** |
| **Licencia de datos** | MIT declarada en el repositorio, **pero los resúmenes humanos son de IEEE** **[V]** |
| **Permiso de entrenamiento** | **Con reservas**: el MIT del repositorio no puede otorgar derechos sobre texto de IEEE **[P]** |
| **Permiso de redistribución** | **Con reservas** por la misma razón **[P]** |

**Notas de auditoría**

- **Solamente referencia.** Ilustra muy bien el eje «generación / pulido / fusión», que es exactamente el eje A–F que Umbral necesita, pero en inglés y con textos de terceros.
- **Longitud media de 164 palabras**: por debajo del mínimo de 80 palabras de Umbral no, pero muy por debajo de un documento real. Un detector calibrado con resúmenes no transfiere a ensayos.

---

### D08 · HC3 (Human ChatGPT Comparison Corpus)

| Campo | Valor |
|---|---|
| **Nombre** | HC3: Human ChatGPT Comparison Corpus |
| **Autores** | Biyang Guo, Xin Zhang, Zecheng Wang, Minqi Jiang, Jinran Nie, Yuxuan Ding, Jianwei Yue, Yupeng Wu (Hello-SimpleAI) |
| **Año** | 2023 |
| **Publicación** | arXiv:2301.07597 |
| **Enlace oficial** | https://github.com/Hello-SimpleAI/chatgpt-comparison-detection |
| **Descarga directa** | https://huggingface.co/datasets/Hello-SimpleAI/HC3 **[V]** |
| **Docs humanos** | **No verificado en esta revisión** **[X]** |
| **Docs IA** | **No verificado en esta revisión** **[X]** |
| **Idiomas** | Inglés y chino **[V]** |
| **Géneros** | Preguntas y respuestas: wikiHow, Reddit, medicina, finanzas, apertura de LLM **[P]** |
| **Modelos generadores** | ChatGPT (GPT-3.5) **[P]** |
| **Generación vs reescritura** | Generación de respuestas a preguntas humanas **[P]** |
| **Procedencia de los humanos** | Respuestas reales de wikiHow, Reddit y foros médicos/financieros **[P]** |
| **Etiquetas** | `human_answers`, `chatgpt_answers` por pregunta **[P]** |
| **Formato** | JSONL / HF datasets **[V]** |
| **Tamaño** | Categoría HF «10K–100K» **[V]** |
| **Licencia de código** | Sin licencia en el repositorio (`license: null`) **[V]** |
| **Licencia de datos** | **CC-BY-SA-4.0** (ficha HF) **[V]** |
| **Permiso de entrenamiento** | **Sí**, con atribución y *share-alike* **[V]** |
| **Permiso de redistribución** | **Sí**, con las mismas condiciones **[V]** |

**Notas de auditoría**

- **No tiene español.** Se incluye porque su licencia es limpia y su estructura (pregunta → respuesta humana / respuesta IA) es la única plantilla abierta para el género «conversación».
- Ojo: las respuestas humanas son de foros y de wikiHow, con registros muy distintos entre sí. Mezclarlas como una sola clase «humano» introduce una varianza que el detector puede explotar como atajo.

---

### D09 · OASSt2 (OpenAssistant Conversations)

| Campo | Valor |
|---|---|
| **Nombre** | OpenAssistant/oasst2 |
| **Autores** | LAION / OpenAssistant (comunidad) |
| **Año** | 2023 |
| **Publicación** | arXiv:2304.07327 (OpenAssistant Conversations) |
| **Enlace oficial** | https://huggingface.co/datasets/OpenAssistant/oasst2 |
| **Descarga directa** | https://huggingface.co/datasets/OpenAssistant/oasst2 (no requiere *gate*) **[V]** |
| **Docs humanos** | Árboles de conversación escritos **íntegramente por personas**; categoría de tamaño 100K–1M mensajes **[V]** |
| **Docs IA** | **0** (no contiene texto generado por modelos) **[V]** |
| **Idiomas** | 35, entre ellos **español**, portugués, catalán, gallego, euskera **[V]** |
| **Géneros** | Conversación asistente–usuario (preguntas abiertas, código, escritura) **[P]** |
| **Modelos generadores** | No aplica **[V]** |
| **Generación vs reescritura** | No aplica: **es una fuente de texto humano** **[V]** |
| **Procedencia de los humanos** | Voluntarios que escribieron tanto el turno de usuario como el de asistente **[V]** |
| **Etiquetas** | `role`, `lang`, `message_id`, `parent_id`, `ranking` **[P]** |
| **Formato** | JSONL (árboles) **[P]** |
| **Tamaño** | Categoría HF «100K–1M» **[V]** |
| **Licencia de código** | Apache-2.0 **[V]** |
| **Licencia de datos** | **Apache-2.0** **[V]** |
| **Permiso de entrenamiento** | **Sí** **[V]** |
| **Permiso de redistribución** | **Sí**, con atribución **[V]** |

**Notas de auditoría**

- **Es la fuente de texto humano conversacional en español con mejor licencia que encontré.** Apache-2.0 no impone NC ni SA: se puede usar, derivar y redistribuir.
- **Trampa conceptual importante:** los turnos de «asistente» los escribieron **personas imitando a un asistente**. Es un registro artificial, más cercano al estilo IA que a una conversación espontánea. Como clase «humano» es atípica y **puede sesgar el detector hacia «esto suena a asistente ⇒ IA»**, precisamente el error que más daño hace.
- Uso recomendado: **clase humana del género «conversación», declarando la limitación**, y nunca como sustituto de conversación espontánea real.

---

### D10 · GPT-2 Output Dataset

| Campo | Valor |
|---|---|
| **Nombre** | GPT-2 Output Dataset |
| **Autores** | OpenAI (Irene Solaiman, Liam Dugan y otros) |
| **Año** | 2019–2020 |
| **Publicación** | arXiv:1908.09203 (*Release Strategies and the Social Impacts of Language Models*) |
| **Enlace oficial** | https://github.com/openai/gpt-2-output-dataset |
| **Descarga directa** | Enlaces del repositorio (S3) **[P]** |
| **Docs humanos** | 250.000 documentos de **WebText** (texto de enlaces salientes de Reddit) **[P]** |
| **Docs IA** | 250.000 muestras de GPT-2 (varias tallas) **[P]** |
| **Idiomas** | Inglés **[V]** |
| **Géneros** | Web heterogénea (Reddit saliente) **[P]** |
| **Modelos generadores** | GPT-2 Small/Medium/Large/XL **[P]** |
| **Generación vs reescritura** | Generación por continuación de un prompt de WebText **[P]** |
| **Procedencia de los humanos** | WebText (2019) **[P]** |
| **Etiquetas** | `model`, `prompt`, `text` **[P]** |
| **Formato** | JSONL comprimido **[P]** |
| **Tamaño** | Cientos de miles de textos; varios GB **[P]** |
| **Licencia de código** | **MIT** **[V]** |
| **Licencia de datos** | MIT declarada por OpenAI **[V]** |
| **Permiso de entrenamiento** | **Sí** **[V]** |
| **Permiso de redistribución** | **Sí** **[V]** |

**Notas de auditoría**

- **Solo valor histórico.** GPT-2 es de 2019: un detector que funcione contra GPT-2 no dice nada sobre GPT-4 o Llama-3. Sirve como **control negativo**: si un motor no distingue GPT-2 de WebText, no sirve para nada.
- WebText es texto de 2019: **la mitad «humana» está garantizada dentro del preentrenamiento de todos los modelos posteriores**, lo que invalida cualquier afirmación sobre memorización.

---

### D11 · esCorpius

| Campo | Valor |
|---|---|
| **Nombre** | esCorpius: A Massive Spanish Crawling Corpus |
| **Autores** | Asier Gutiérrez-Fandiño, David Pérez-Fernández, Jordi Armengol-Estapé, David Griol, Zoraida Callejas |
| **Año** | 2022 |
| **Publicación** | IberSPEECH 2022, pp. 126–130; arXiv:2206.15147 |
| **Enlace oficial** | https://lindat.cz/repository/xmlui/handle/11372/LRT-4807 |
| **Descarga directa** | https://huggingface.co/datasets/LHF/escorpius (33 archivos de 10 GB) **[V]** |
| **Docs humanos** | **104 millones** de documentos web **[V]** |
| **Docs IA** | 0 **[V]** |
| **Idiomas** | Español **[V]** |
| **Géneros** | Web heterogénea (noticias, foros, blogs, institutional) **[V]** |
| **Modelos generadores** | No aplica **[V]** |
| **Generación vs reescritura** | No aplica **[V]** |
| **Procedencia de los humanos** | *Common Crawl* (39.502 WARC) **[V]** |
| **Etiquetas** | `url`, `timestamp`, `paragraphs` por documento **[P]** |
| **Formato** | JSONL comprimido **[V]** |
| **Tamaño** | **322,5 GB**; 50.040 millones de *tokens* **[V]** |
| **Licencia de código** | No verificada **[X]** |
| **Licencia de datos** | **CC-BY-NC-ND-4.0** **[V]** |
| **Permiso de entrenamiento** | **No** para construir derivados distribuibles; NC y ND **[P]** |
| **Permiso de redistribución** | **No** para versiones modificadas **[V]** |

**Notas de auditoría**

- **Descartado por tamaño (322 GB) y por licencia (ND).** Extraer 2.000 documentos de aquí sería técnicamente posible, pero el resultado sería «material adaptado» que no se puede publicar.
- **No tiene etiquetas de autoría**: es materia prima, no un corpus de detección. Su utilidad sería como pool de texto humano si la licencia lo permitiera, y no lo permite con la holgura que Umbral necesita.

---

### D12 · Spanish Unannotated Corpora

| Campo | Valor |
|---|---|
| **Nombre** | Compilation of Large Spanish Unannotated Corpora (SUC) |
| **Autores** | José Cañete, Gabriel Chaperon, Rodrigo Fuentes, Jou-Hui Ho, Hojin Kang, Jorge Pérez |
| **Año** | 2019–2020 |
| **Publicación** | PML4DC @ ICLR 2020 |
| **Enlace oficial** | https://github.com/josecannete/spanish-corpora |
| **Descarga directa** | Zenodo, DOI 10.5281/zenodo.3247731 **[V]** |
| **Docs humanos** | 300.904.000 líneas **[V]** |
| **Docs IA** | 0 **[V]** |
| **Idiomas** | Español **[V]** |
| **Géneros** | Wikis, ParaCrawl, EUBookshop, MultiUN, OpenSubtitles, DGT, DOGC, ECB, EMEA, Europarl, GlobalVoices, JRC, News-Commentary **[V]** |
| **Modelos generadores** | No aplica **[V]** |
| **Generación vs reescritura** | No aplica **[V]** |
| **Procedencia de los humanos** | Compilación de corpus de OPUS y de las wikis en español (volcado de 20/04/2019) **[V]** |
| **Etiquetas** | `source` **[P]** |
| **Formato** | TXT/JSONL por fuente **[P]** |
| **Tamaño** | 3.000 millones de palabras; 18,4 GB de caracteres **[V]** |
| **Licencia de código** | **MIT** en el repositorio **[V]** |
| **Licencia de datos** | **No unificada**: cada fuente tiene la suya (ParaCrawl CC0, OpenSubtitles, EUBookshop, etc.) **[V]** |
| **Permiso de entrenamiento** | **Con reservas**, fuente por fuente **[P]** |
| **Permiso de redistribución** | **No se puede afirmar en bloque** **[P]** |

**Notas de auditoría**

- **El MIT del repositorio cubre el código de compilación, no el texto.** Es el error más frecuente al citar este recurso. Si Umbral redistribuye un subconjunto, hereda las obligaciones de cada corpus de origen.
- Predominantemente **español europeo** (Parlamento Europeo, DGT, ECB, El País). **Tampoco resuelve el problema latinoamericano.**
- Útil, en todo caso, como **fuente de texto humano no etiquetado** para estimar la distribución de referencia de las métricas (entropía, burstiness) en español real.

---

### D13 · Wikipedia en español y Wikisource

| Campo | Valor |
|---|---|
| **Nombre** | Wikipedia ES (volcados oficiales) y Wikisource ES |
| **Autores** | Comunidad Wikimedia |
| **Año** | Continuo (usar la fecha del volcado) |
| **Publicación** | No aplica |
| **Enlace oficial** | https://dumps.wikimedia.org/eswiki/ · https://es.wikisource.org |
| **Descarga directa** | `eswiki-latest-pages-articles.xml.bz2` **[V]** |
| **Docs humanos** | Millones de artículos **[V]** |
| **Docs IA** | 0 (aunque **puede haber texto generado por IA sin etiquetar**: riesgo real desde 2023) **[P]** |
| **Idiomas** | Español (con variedades mezcladas) **[V]** |
| **Géneros** | Enciclopédico; Wikisource: literario y documental **[V]** |
| **Modelos generadores** | No aplica |
| **Generación vs reescritura** | No aplica |
| **Procedencia de los humanos** | Edición colaborativa humana **[V]** |
| **Etiquetas** | Categorías, historial de revisiones, autoría por IP/usuario **[V]** |
| **Formato** | XML (dumps) **[V]** |
| **Tamaño** | Decenas de GB comprimidos **[P]** |
| **Licencia de código** | CC BY-SA / GFDL para el texto; software aparte **[V]** |
| **Licencia de datos** | **CC BY-SA** (los dumps recientes indican 4.0; las revisiones antiguas, 3.0) **[P]** |
| **Permiso de entrenamiento** | **Sí**, con atribución y *share-alike* **[V]** |
| **Permiso de redistribución** | **Sí**, con atribución, enlace a la licencia e historial de autores **[V]** |

**Notas de auditoría**

- **Es la única fuente de texto humano en español, de tamaño grande y licencia clara, que además permite filtrar por país** (categorías «Wikipedia:España», «Wikipedia:México», etc.), por época y por dominio. **Es la base realista del corpus latinoamericano.**
- **Dos riesgos:** (i) el texto es enciclopédico y editado, no escritura espontánea; (ii) desde 2023 hay artículos con texto generado por IA sin marcar, así que la etiqueta «humano» no es perfecta.
- **Ventaja decisiva para la fuga:** permite reconstruir **la fecha de cada revisión**. Se pueden elegir revisiones anteriores a la fecha de corte del modelo generador y demostrar que el texto humano no pudo haber sido escrito por ese modelo.

---

### D14 · `jorgeortizfuentes/spanish_books`

| Campo | Valor |
|---|---|
| **Nombre** | spanish_books (libros en español, dominio público) |
| **Autores** | Jorge Ortiz Fuentes (recopilación) |
| **Año** | 2023 |
| **Publicación** | No aplica (dataset de Hugging Face) |
| **Enlace oficial** | https://huggingface.co/datasets/jorgeortizfuentes/spanish_books |
| **Descarga directa** | Misma URL; **acceso con *gate* automático** (aceptar condiciones) **[V]** |
| **Docs humanos** | Categoría HF «10K–100K» **[V]** |
| **Docs IA** | 0 **[V]** |
| **Idiomas** | Español **[V]** |
| **Géneros** | Literario (libros de dominio público) **[P]** |
| **Modelos generadores** | No aplica |
| **Generación vs reescritura** | No aplica |
| **Procedencia de los humanos** | Digitalizaciones de obras en dominio público **[P]** |
| **Etiquetas** | Texto por libro **[P]** |
| **Formato** | HF datasets **[V]** |
| **Tamaño** | Categoría HF «10K–100K» filas **[V]** |
| **Licencia de código** | No aplica |
| **Licencia de datos** | **CC-BY-SA-4.0** **[V]** |
| **Permiso de entrenamiento** | **Sí**, con atribución y SA **[V]** |
| **Permiso de redistribución** | **Sí**, con las mismas condiciones **[V]** |

**Notas de auditoría**

- **Registro literario y anticuado.** Los libros de dominio público son, por definición, de autores muertos hace décadas: **el léxico y la sintaxis no representan el español latinoamericano actual**. Como clase «humano» enseña «español de 1900».
- Útil solo para el género «literario» y **con advertencia explícita**; no debe usarse como referencia general.

---

### D15 · `beltrewilton/punta-cana-spanish-reviews`

| Campo | Valor |
|---|---|
| **Nombre** | Reseñas en español de Punta Cana (República Dominicana) |
| **Autores** | Beltre W. (recopilación) |
| **Año** | 2023 |
| **Publicación** | No aplica |
| **Enlace oficial** | https://huggingface.co/datasets/beltrewilton/punta-cana-spanish-reviews |
| **Descarga directa** | Misma URL, sin *gate* **[V]** |
| **Docs humanos** | Categoría HF «10K–100K» **[V]** |
| **Docs IA** | 0 **[V]** |
| **Idiomas** | Español (caribeño) **[P]** |
| **Géneros** | Reseñas de turismo/hoteles **[P]** |
| **Modelos generadores** | No aplica |
| **Generación vs reescritura** | No aplica |
| **Procedencia de los humanos** | Reseñas de plataformas de viajes **[P]** |
| **Etiquetas** | Texto y valoración **[P]** |
| **Formato** | CSV / HF datasets **[P]** |
| **Tamaño** | Categoría «10K–100K» **[V]** |
| **Licencia de código** | No aplica |
| **Licencia de datos** | **MIT** **[V]** |
| **Permiso de entrenamiento** | **Sí** **[V]** |
| **Permiso de redistribución** | **Sí** **[V]** |

**Notas de auditoría**

- **Es el único recurso con licencia limpia y origen latinoamericano explícito que encontré.** Pero es **un solo género, una sola región y probablemente textos cortos**: no sostiene ninguna conclusión sobre «español latinoamericano» en general.
- **Riesgo de origen:** aunque el publicador declare MIT, las reseñas fueron escritas por usuarios de una plataforma. El MIT no puede ceder derechos de autor de terceros; **el riesgo es bajo pero no nulo**.
- Uso: **semilla** del género «reseñas» en variedad caribeña, declarando la limitación.

---

### D16 · TextMachina (herramienta, no dataset)

| Campo | Valor |
|---|---|
| **Nombre** | TextMachina: Seamless Generation of Machine-Generated Text Datasets |
| **Autores** | Areg Mikael Sarvazyan y otros |
| **Año** | 2024 |
| **Publicación** | arXiv:2401.03946 |
| **Enlace oficial** | https://github.com/Genaios/TextMachina |
| **Licencia** | **CC-BY-NC-ND-4.0** (`LICENSE` leído literalmente: *Attribution-NonCommercial-NoDerivatives 4.0 International*) **[V]** |
| **Uso para Umbral** | **Referencia metodológica.** Es la herramienta con la que se construyeron AuTexTification 2023 y 2024: define el flujo «texto humano → máscara → *prompt* → generación → emparejado» |

**Notas de auditoría**

- **Su licencia es más restrictiva que la de los datos de 2023**: NC y ND. Usarla como dependencia de un producto no es lo mismo que leer su documentación; **no se propone integrarla**, solo replicar su flujo conceptual con código propio.
- Lo valioso es su **esquema de metadatos** (documento original, máscara, *prompt*, generador, parámetros), que es exactamente lo que Umbral necesita para evitar fugas.

---

### 1.1 Recursos evaluados y **descartados** en esta ronda

| Recurso | Motivo del descarte | Marca |
|---|---|---|
| **TuringBench** | No localicé un repositorio oficial verificado en esta ronda; es inglés y de 2021. Sin licencia comprobada, no se usa. | **[X]** |
| **TweepFake** | Los textos son tuits reales: su redistribución choca con los términos de la plataforma. Inglés, 2021. | **[P]** |
| **GROVER / `grover` dataset** | Generador y datos de 2019, inglés, sin utilidad para español actual. | **[X]** |
| **Artículo ecuatoriano «Pol. Con.» (2024)** | **Búsqueda sin resultados pertinentes**: «Polo del Conocimiento» publica artículos sobre IA en educación y derecho, pero **no encontré ningún corpus de detección**. No se inventa: se excluye. | **[V, búsqueda negativa]** |
| **esCorpius** | 322 GB y CC-BY-NC-ND. | **[V]** |
| **M4 / SemEval-2024 Task 8** | Sin español y sin licencia unificada. | **[V]** |
| **OpenAI GPT-2 Output** | Modelo obsoleto; útil solo como control negativo. | **[V]** |

---

## 2. Evaluación crítica: calidad, sesgos y qué se puede afirmar

### 2.1 Catálogo de defectos

| Defecto | Dónde aparece | Efecto sobre la métrica | Mitigación posible |
|---|---|---|---|
| **Modelos generadores obsoletos** | AuTexTification 2023 (BLOOM-1B/3B/7B, Babbage, Curie, davinci-003), Schaaff (GPT-3.5), CHEAT (GPT-3.5), GPT-2 Output | El detector aprende marcas de 2021–2023. **No transfiere a GPT-4/Llama-3/Mixtral.** | Evaluar siempre en dos ejes: modelos vistos / no vistos. IberAuTexTification 2024 aporta los modernos. |
| **Un solo generador** | Schaaff, CHEAT, HC3 | Confunde «estilo del modelo» con «texto de máquina». | Exigir ≥3 familias de generadores por celda. |
| **Generación por continuación de prefijo** | AuTexTification 2023 y 2024, MULTITuDE (titular), RAID (continuación) | El texto de máquina **hereda tema, entidades y registro** del humano. El detector puede acertar por tema, no por estilo. **Infla AUROC in-domain.** | Brazo emparejado + brazo no emparejado; medir ambos por separado. |
| **Humanos homogéneos** | Wikipedia (Schaaff, D13), resúmenes IEEE (CHEAT), noticias (MULTITuDE, M4) | El detector aprende «Wikipedia vs ChatGPT». | Mínimo 9 géneros y 3 registros por género. |
| **Longitudes no comparables** | CHEAT 164 palabras; AuTexTification fragmentos; ensayos reales 500–1.500 | Métricas como TTR, entropía y compresión **correlacionan 0,79–0,99 con la longitud** (Shaib et al.). Un clasificador puede separar por longitud. | Emparejar longitud entre clases (±20 %) y reportar el efecto. |
| **Etiqueta «IA» que incluye reescritura** | Schaaff (clase aparte, bien), CHEAT (`polish` dentro de «IA»), AuTexTification (solo generación) | Mezclar «generado» y «reescrito» **baja artificialmente** el rendimiento aparente o lo sube según la mezcla. | Etiqueta de **modo** obligatoria: A–F del §3. |
| **Ruido en la etiqueta humana** | MULTITuDE lo declara («may not be 100 % correct»); Wikipedia desde 2023 puede contener IA | Techo artificial al FPR: un 1 % de «falsos positivos» puede ser texto de IA mal etiquetado. | Auditoría manual de una muestra; reportar la tasa de error de etiqueta. |
| **Fuga por tema** | Diseño emparejado de AuTexTification y MULTITuDE | Partición aleatoria ⇒ mismo tema en train y test. | Agrupar por `original_id` (ver §4). |
| **Contaminación del preentrenamiento** | Wikipedia, arXiv, Reddit, IMDb: todo está en los datos de entrenamiento de los LLM | El modelo **puede reproducir** el texto «humano»; el texto «humano» puede contener salidas de IA. | Usar documentos anteriores a la fecha de corte y **medir solapamiento n-grama** entre humano y máquina. |
| **Licencias NC/ND** | IberAuTexTification (ND), esCorpius (ND), TextMachina (ND), AuTexTification (NC-SA) | No se puede publicar el benchmark derivado; la reproducibilidad se rompe. | Pedir permiso escrito; o construir datos propios. |
| **Acceso restringido** | MULTITuDE, Zenodo de IberAuTexTification | Terceros no pueden replicar la partición. | Reservar el corpus propio como conjunto publicable. |

### 2.2 El «español» de los corpus existentes es español de España

Esto no es una impresión: es la consecuencia directa de las fuentes declaradas.

| Corpus | Fuentes humanas en español | Variedad |
|---|---|---|
| AuTexTification 2023 | COAH y COAR (Universidad de Jaén: hoteles y restaurantes **de España**), MLSUM (prensa **española**), MultiEURLEX (UE), Kaggle «tweets política **España**», WikiLingua | **100 % peninsular** (declarado) |
| IberAuTexTification 2024 | `punta-cana-spanish-reviews` (**República Dominicana**), `spanish_books` (recopilación **chilena**), OSCAR, Wikipedia, `amazon_reviews_multi`, XLSum | **Mayoritariamente peninsular; presencia latinoamericana mínima y sin desglose** |
| MULTITuDE | MassiveSumm (noticias multilingües) | **Sin desglose por país**; no verificable |
| M4 | — | **Sin español** |

**Consecuencia científica:** cualquier métrica obtenida hoy sobre estos corpus describe el **español peninsular escrito por adultos en registros formales**. Presentarla como «detección de texto en español» sería una generalización injustificada. En concreto, no se puede afirmar nada sobre:

- léxico regional (*celular/playera/popote/che*), que un modelo de estilo puede tratar como «rareza» y convertir en falsa señal;
- voseo, *ustedes*, diminutivos, marcadores discursivos caribeños o andinos;
- code-switching español–quechua/aimara/guaraní;
- registros escolares y universitarios latinoamericanos, que es donde el problema se usa de verdad.

### 2.3 América Latina: qué hay y qué falta

**Lo que hay (verificado):**

1. `punta-cana-spanish-reviews` — MIT, reseñas, Caribe. **Género único, tamaño por confirmar.**
2. `spanish_books` — CC-BY-SA, libros de dominio público, recopilación chilena. **Registro literario antiguo.**
3. OASSt2 en español — Apache-2.0, conversación, pero **escrita por voluntarios imitando a un asistente**; el país no está etiquetado.
4. Wikipedia ES — CC BY-SA, con categorías por país y **fecha de revisión**. La única base grande, limpia y filtrable por país.

**Lo que falta (y hay que recoger):**

- ensayos escolares y universitarios latinoamericanos con consentimiento;
- prensa regional con licencia explícita (casi ninguna la tiene);
- correos institucionales y textos administrativos (requieren donación voluntaria);
- transcripciones de habla espontánea (los corpus sociolingüísticos tipo PRESEEA exigen convenios y **no son redistribuibles**);
- textos híbridos reales (humano que edita una salida de IA), que **no existen en ningún corpus público**.

**Conclusión:** el corpus latinoamericano **no se compra ni se descarga: se construye con aportación voluntaria y consentimiento**, y esa es una decisión de producto, no solo de investigación.

### 2.4 Fugas estructurales que ya están en los datos (no en nuestra partición)

1. **Emparejamiento por prefijo.** En AuTexTification cada texto de máquina continúa un prefijo del humano correspondiente. Si se parte al azar, el mismo tema cae en train y test. **El AUROC publicado no mide lo que un usuario cree que mide.**
2. **Mismo titular como *prompt*.** En MULTITuDE y M4 los textos se generan desde el titular de la noticia humana: los primeros *tokens* son literalmente el mismo texto.
3. **Wikipedia en el preentrenamiento.** Los textos humanos de Schaaff son artículos de Wikipedia, presentes en los datos de entrenamiento de todos los modelos. Un detector puede estar reconociendo «esto lo he visto», no «esto lo escribió una persona».
4. **Misma fuente, muchos documentos.** 26.996 textos humanos en español salen de un puñado de corpus: la varianza efectiva es mucho menor que n. Con 3 versiones por original y una correlación intra-grupo ρ=0,3, **2.000 textos valen como 1.250 independientes** (véase §5.4).
5. **Solapamiento literal humano–máquina.** En generación por continuación, el inicio del texto de máquina **es** el prefijo humano. Cualquier clasificador de n-gramas lo detecta sin aprender nada.

### 2.5 Qué se puede concluir con cada corpus

| Corpus | Afirmación que **sí** sostiene | Afirmación que **no** sostiene |
|---|---|---|
| AuTexTification 2023 (ES) | «En texto periodístico/reviews/tuits **peninsulares** de 2023, estos 6 modelos son detectables con AUROC X (IC 95 %)» | «Umbral detecta texto de IA en español» |
| IberAuTexTification 2024 (ES) | «Frente a GPT-4/Llama-2/Mixtral en 7 dominios, un detector entrenado en 2023 rinde Y» (solo evaluación) | Cualquier afirmación con datos redistribuidos |
| Schaaff (ES) | «La reescritura es más difícil que la generación; 300 documentos dan un indicio» | Cualquier métrica estable: n=100 por clase |
| MULTITuDE (ES) | «La detección cae al cambiar de idioma» | Nada publicable (datos no redistribuibles) |
| RAID | «Este detector sobrevive / no sobrevive a paráfrasis y a cambios de decodificación» | Nada sobre español |
| Corpus propio Umbral | Lo que se haya medido con potencia suficiente (§5) | Nada sobre «todos los modelos» |

---

## 3. Diseño del corpus Umbral

### 3.1 Categorías de procedencia (A–F)

La categoría describe **cómo se produjo el texto**, no quién lo escribió. Es el metadato que impide confundir generación con reescritura y el que permite analizar por separado.

| Cat. | Nombre | Definición operativa | Ejemplo | Dificultad esperada |
|---|---|---|---|---|
| **A** | Humano profesional publicado | Texto humano publicado, con licencia verificable y autor identificable | Artículo de Wikipedia ES (CC BY-SA), libro de dominio público | Baja (si el tema no está en el prompt) |
| **B** | Humano espontáneo consentido | Texto aportado voluntariamente con consentimiento informado y sin edición por IA | Ensayo escolar, correo institucional, reseña | Baja–media |
| **C** | IA generada desde cero | Modelo recibe una instrucción breve y produce el documento completo | «Escribe un ensayo de 400 palabras sobre X» | Media |
| **D** | IA por continuación | Modelo recibe un prefijo humano y continúa | Prefijo de 100 palabras + continuación | **Baja artificialmente** (hereda estilo humano) |
| **E** | IA por reescritura | Modelo recibe un texto humano completo y lo reescribe («mejora el estilo sin cambiar el contenido») | *Polish* de CHEAT | **Alta** (conserva contenido y parte del estilo) |
| **F** | Híbrido declarado | Humano edita una salida de IA, o IA completa un texto humano; se registra la proporción estimada | Borrador IA + corrección humana | **La más alta y la más realista** |

**Regla:** la etiqueta binaria (`human` / `machine`) se deriva de la categoría, pero **el análisis siempre se reporta por categoría**. Un AUROC agregado que mezcle C, D, E y F es un número que no significa nada.

### 3.2 Los nueve géneros

| # | Género | Extensión objetivo | Registro | Fuente humana viable (licencia) |
|---|---|---|---|---|
| 1 | Noticia / crónica | 250–600 palabras | Formal-informativo | Wikipedia ES (actualidad), prensa con licencia explícita |
| 2 | Ensayo académico / escolar | 400–1.200 | Formal-argumentativo | **Aportación voluntaria (B)** con consentimiento |
| 3 | Reseña (producto, hotel, libro) | 80–300 | Informal-valorativo | `punta-cana` (MIT), AuTexTification ES (medición) |
| 4 | Tuit / hilo | 30–280 | Informal-breve | **Problemático**: X/Twitter prohíbe redistribuir. Solo aportación voluntaria |
| 5 | How-to / instructivo | 150–500 | Directivo | Wikipedia ES, WikiHow (NC: evitar) |
| 6 | Conversación / Q&A | 100–500 | Dialógico | OASSt2 ES (Apache-2.0), con la advertencia del §2 |
| 7 | Correo institucional | 80–300 | Formal-administrativo | **Aportación voluntaria (B)**, con anonimización |
| 8 | Literario / ficción | 300–1.000 | Literario | Wikisource, `spanish_books` (CC-BY-SA) |
| 9 | Legal / administrativo | 200–800 | Técnico-jurídico | Boletines oficiales de dominio público; **verificar cada país** |

**Cobertura geográfica mínima propuesta:** México, Colombia, Argentina, Chile, Perú, Bolivia (o Ecuador/Paraguay si hay disponibilidad), más España como referencia de control. **Etiqueta `country` obligatoria y `variety_confidence`** (declarada por el autor / inferida por léxico / desconocida).

### 3.3 Metadatos obligatorios por documento

```
id                     identificador único e inmutable
family_id              agrupa todas las versiones del mismo documento original
original_id            id del texto humano de origen (null en categoría A/B)
parent_id              id del texto del que deriva (para E y F)
author_pseudo_id       seudónimo estable del autor (nunca el nombre real)
consent_id             referencia al consentimiento firmado (categoría B/F)
source_type            wikipedia | wikisource | aportacion | corpus_publico | generado
source_url             URL de procedencia (cuando exista)
license                SPDX de la licencia del texto (p. ej. CC-BY-SA-4.0)
license_evidence       URL o hash del documento donde consta la licencia
country                ISO 3166-1 alfa-2
variety_confidence     declarada | inferida | desconocida
genre                  uno de los 9
register               formal | informal | tecnico | literario
word_count             número de palabras
created_at             fecha de creación o de la revisión
cutoff_check           true si el texto es anterior a la fecha de corte del generador
generator_family       bloom | gpt3 | gpt4 | llama2 | mixtral | cohere | ai21 | otro | null
generator_version      identificador exacto del modelo
generator_date         fecha de la llamada al modelo
generation_mode        C | D | E | F | null (A/B)
decoding               {temperature, top_p, max_tokens, repetition_penalty}
prompt_id              hash del prompt (no el prompt, si contiene datos personales)
human_edit_share       proporción estimada de edición humana en F (0–1)
pii_flags              lista de categorías detectadas y anonimizadas
contamination_flag     true si hay solapamiento n-grama con el corpus de entrenamiento conocido
split_group            clave de agrupación para la partición (ver §4)
notes                  incidencias de anotación
```

**Regla de oro:** si un campo no se puede rellenar, se escribe `null` **y el documento no entra en el análisis que dependa de ese campo**. No se imputa.

### 3.4 Relación con el original (el campo que evita la fuga)

Cada familia tiene exactamente esta forma:

```
original (A/B) ─┬─ C  (generado desde un prompt derivado del original)
                ├─ D  (continuación del original)
                ├─ E  (reescritura del original)
                └─ F  (híbrido: humano edita una salida de IA sobre el original)
```

- **`family_id` es la unidad de partición.** Nunca se parte por fila.
- **La categoría D comparte prefijo literal con el original** ⇒ se marca y se analiza aparte; en las métricas principales se excluye o se reporta separada.
- **El prompt de C no puede contener el texto del original**: solo tema e instrucción. Si se copia el original, C se convierte en D.

---

## 4. Estrategia de validación anti-fuga

### 4.1 Principio

> La unidad estadística es el **documento original**, no el texto. Todo lo que comparte origen, autor, fuente, prompt o tema va **al mismo lado** de la partición.

### 4.2 Ejes de agrupación (todos obligatorios)

| Eje | Clave de agrupación | Qué se evita |
|---|---|---|
| Documento original | `family_id` | Que el original esté en train y su reescritura en test |
| Autor | `author_pseudo_id` | Que el estilo del autor se memorice y se cuente como señal |
| Fuente | `source_url` normalizada (dominio + ruta) | Que el mismo medio o la misma página aparezca en ambos lados |
| Prompt | `prompt_id` | Que el mismo *prompt* esté en train y test |
| Tema | `topic_id` (derivado del original) | Que el clasificador aprenda el tema, no el estilo |
| Fecha | `created_at` | Que un texto posterior al corte contamine al anterior |

**Algoritmo:** ordenar por `family_id`, agrupar por las claves anteriores, y asignar grupos completos a *train* / *dev* / *test* con un hash estable (`sha256(salt + family_id) % 100`) para que la partición sea reproducible y pública sin revelar contenido.

### 4.3 Los cinco conjuntos de generalización

El corpus debe permitir medir **cinco transferencias distintas**, cada una con su propia tabla de resultados. Agregarlas en un solo número es lo que hace que los artículos parezcan buenos y los productos fallen.

| Experimento | Entrena en | Evalúa en | Pregunta que responde |
|---|---|---|---|
| **E1 · In-domain** | Géneros y modelos vistos | Mismo dominio, familias distintas | Techo optimista. **No debe ser el titular.** |
| **E2 · Modelo no visto** | 4 familias de generadores | 2 familias **nunca vistas** | ¿Generaliza a modelos nuevos? |
| **E3 · Género no visto** | 7 géneros | 2 géneros **nunca vistos** | ¿O es un detector de «ensayo»? |
| **E4 · Variedad no vista** | España + 3 países | 2 países **nunca vistos** | ¿Funciona en español latinoamericano no representado? |
| **E5 · Modo no visto** | C y D | E y F **nunca vistos** | ¿Detecta reescritura e híbridos? **Es el escenario real.** |

**Regla de reporte:** Umbral solo puede publicar una cifra de rendimiento acompañada de E2–E5. Un AUROC de E1 sin E2–E5 es publicidad, no evidencia.

### 4.4 Controles anti-fuga que deben ejecutarse *antes* de entrenar

1. **Deduplicación exacta** por hash del texto normalizado (minúsculas, sin puntuación, espacios colapsados).
2. **Deduplicación casi exacta** con MinHash/SimHash (Jaccard de 5-gramas de palabras, umbral 0,8). En generación por continuación, el umbral debe bajarse a 0,5 **solo para pares (D, original)**.
3. **Solapamiento de prefijo**: medir cuántos *tokens* iniciales comparten original y D. Si >20, marcar `contamination_flag`.
4. **Solapamiento de tema**: TF-IDF + coseno entre documentos de distinta clase; si la similitud media entre clases es mayor que dentro de clase, el tema domina y hay que rebalancear.
5. **Verificación de partición**: script que falla si un `family_id`, `author_pseudo_id`, `source_url` o `prompt_id` aparece en dos *splits*.
6. **Auditoría de etiqueta**: muestra aleatoria de 200 documentos revisada a mano, con tasa de error reportada e intervalo de confianza.
7. **Prueba de longitud**: entrenar un clasificador **solo con `word_count`**. Si supera AUROC 0,60, las clases no están emparejadas en longitud y hay que corregir antes de seguir. *(Este control es barato y desenmascara muchos «detectores».)*
8. **Prueba de tema**: clasificador solo con TF-IDF de sustantivos propios. Si supera 0,60, el tema está filtrando la respuesta.

**Ninguno de estos controles se ha ejecutado todavía**, porque no hay corpus. Se documentan aquí como requisito de aceptación del corpus futuro.

### 4.5 Qué no se puede controlar (y hay que declarar)

- **Contaminación del preentrenamiento** de los modelos generadores: no es auditable desde fuera. Mitigación: elegir textos anteriores al corte y **declarar la fecha del corte** de cada modelo.
- **Fuga por el propio benchmark**: si el corpus se publica, acabará en el entrenamiento de alguien. Mitigación: conjunto de test **congelado y no publicado** (o publicado con retraso y versionado).
- **Texto de IA mal etiquetado como humano** en Wikipedia desde 2023: tasa desconocida. Mitigación: revisar manualmente una muestra y reportar.

---

## 5. Tamaños: justificación numérica

Todos los cálculos son reproducibles con fórmulas estándar; se indican los supuestos. **No se ha medido ninguna de estas cantidades en datos reales todavía**: son cálculos de potencia, no resultados.

### 5.1 El problema de los 2.000 documentos / 200 por género

Con **200 negativos por género**, un FPR observado del 1 % (2 falsos positivos) tiene este intervalo de confianza del 95 % (Wilson):

| Negativos | Falsos positivos | FPR | IC 95 % | Amplitud |
|---|---|---|---|---|
| **200** | 2 | 1,00 % | **[0,27 % – 3,57 %]** | **3,30 pp** |
| 500 | 5 | 1,00 % | [0,43 % – 2,32 %] | 1,89 pp |
| 1.000 | 10 | 1,00 % | [0,54 % – 1,83 %] | 1,29 pp |
| 2.000 | 20 | 1,00 % | [0,65 % – 1,54 %] | 0,89 pp |
| 5.000 | 50 | 1,00 % | [0,76 % – 1,32 %] | 0,56 pp |
| 10.000 | 100 | 1,00 % | [0,82 % – 1,21 %] | 0,39 pp |

**Lectura:** con 200 negativos por género **no se puede afirmar «FPR del 1 %»**: el dato es compatible con un 0,27 % y con un 3,57 %. En un producto que acusa a personas, esa diferencia es la diferencia entre «aceptable» y «escándalo».

Negativos necesarios para un IC del FPR del 1 % con semiamplitud objetivo:

| Precisión buscada | Negativos necesarios |
|---|---|
| ±1,0 pp | ≈450 |
| ±0,5 pp | ≈1.650 |
| ±0,25 pp | ≈6.200 |
| ±0,1 pp | ≈38.200 |

**Por eso el número «200 por género» no es un error de cálculo: es un presupuesto de piloto presentado como validación.**

### 5.2 Precisión del AUROC

Error estándar por aproximación de Hanley–McNeil; IC 95 % = ±1,96·SE.

| n por clase | AUROC 0,80 | AUROC 0,90 | AUROC 0,95 |
|---|---|---|---|
| 200 | ±4,3 pp | ±3,1 pp | ±2,2 pp |
| 500 | ±2,7 pp | ±2,0 pp | ±1,4 pp |
| 1.000 | ±1,9 pp | ±1,4 pp | ±1,0 pp |
| 2.000 | ±1,4 pp | ±1,0 pp | ±0,7 pp |
| 5.000 | ±0,9 pp | ±0,6 pp | ±0,4 pp |
| 10.000 | ±0,6 pp | ±0,4 pp | ±0,3 pp |

**Lectura:** para afirmar «AUROC 0,90 ± 0,01» hacen falta **2.000 documentos por clase en esa condición**. Con 200 por clase, la diferencia entre un detector bueno (0,90) y uno mediocre (0,84) **no es distinguible**.

### 5.3 Otras cantidades que se quieren medir

| Cantidad | Fórmula / supuesto | n necesario |
|---|---|---|
| Diferencia de medias entre dos grupos (δ=0,05, σ=0,10, α=0,05, potencia 80 %) | `n = 2(z₁₋α/₂ + z₁₋β)²σ²/δ²` | **63 por grupo** |
| Ídem con δ=0,03 | ídem | 175 por grupo |
| Ídem con δ=0,02 | ídem | 393 por grupo |
| Proporción ±5 pp (p=0,5) | `n = z²p(1−p)/e²` | 385 |
| Proporción ±3 pp | ídem | 1.068 |
| Proporción ±2 pp | ídem | 2.401 |
| Correlación r=0,3 detectable (α=0,05, potencia 80 %) | Fisher z | 85 |
| Correlación r=0,2 | ídem | 194 |
| Correlación r=0,1 | ídem | 783 |

**Consecuencia para la validación de motores:** si Umbral quiere demostrar que una métrica propia (p. ej. entropía normalizada) **correlaciona** con la clase, necesita **≥194 documentos para detectar r=0,2 y ≥783 para detectar r=0,1**. Los pilotos de 40 documentos del `smoke` no demuestran nada: solo comprueban que el código corre.

### 5.4 Efecto de diseño por agrupamiento

Los documentos no son independientes: comparten original, autor y tema. `n_eff = n / (1 + (m−1)·ρ)`, con `m` versiones por familia y `ρ` correlación intra-familia.

| m | ρ | Efecto de diseño | 2.000 textos valen como |
|---|---|---|---|
| 3 | 0,1 | 1,20 | 1.667 |
| 3 | 0,3 | 1,60 | 1.250 |
| 3 | 0,5 | 2,00 | 1.000 |
| 5 | 0,3 | 2,20 | 909 |
| 5 | 0,5 | 3,00 | 667 |

**ρ no se conoce y hay que estimarlo en el piloto.** Es la primera cosa que el piloto debe producir: sin ρ no se puede dimensionar nada.

### 5.5 Qué cabe en cada tamaño

Celdas con 9 géneros × 2 clases × 3 versiones = **54 celdas**:

| Total de documentos | Documentos por celda | Qué permite |
|---|---|---|
| **600** | ≈11 | **Piloto**: verificar el flujo, estimar ρ y la varianza, calibrar tiempos. **Ninguna conclusión.** |
| **2.000** | ≈37 | Estimar AUROC global ±1,5 pp; **no** afirmar FPR@1 % por género (IC ±3,3 pp). |
| **8.000** | ≈148 | AUROC global ±0,5 pp; per-genre ±1,7 pp; FPR@1 % global con amplitud de IC ≤0,7 pp. |
| **12.000** | ≈222 | Per-genre AUROC ±1,4 pp; FPR@1 % per-genre con amplitud de IC ≤1,3 pp. |

### 5.6 Diseño propuesto: piloto y definitivo

**Piloto (600 documentos)**
`3 géneros × 50 originales × (1 humano + 3 versiones: C, D, E)` = 600.
Objetivo: ejecutar los 8 controles del §4.4, estimar ρ, medir tiempos y descubrir defectos de etiqueta. **No se publica ninguna métrica de rendimiento del piloto.**

**Versión 0.5 publicable (2.000 documentos)**
`6 géneros × 110 originales × (1 humano + 2 versiones)` ≈ 1.980, más 20 de reserva.
Objetivo: primera medición honesta con IC anchos, declarados como tales.

**Definitivo (8.000–10.000 documentos)**
Dos brazos:

- **Brazo P (emparejado, controlado):** `1.500 originales × (H + C + D + E)` = **6.000**.
- **Brazo U (realista, no emparejado):** `2.000 humanos + 2.000 máquinas` generados desde *prompts* independientes = **4.000**.

Total **10.000**. Negativos: 3.500 ⇒ FPR@1 % con IC de amplitud ≈0,6 pp. Positivos: 6.500, repartidos en ≥6 familias de generadores ⇒ ≈1.080 por familia ⇒ TPR a FPR fijo con IC ≈ ±3 pp. Per-genre (9 géneros): ≈390 humanos y ≈720 máquinas ⇒ AUROC ±1,7 pp, FPR@1 % ±0,9 pp.

### 5.7 Viabilidad real de esos tamaños con 0 USD

| Brazo | Documentos | Cómo se obtienen | ¿Viable hoy? |
|---|---|---|---|
| Humanos (A/B) | 3.500 | Wikipedia/Wikisource (A) + aportación voluntaria (B) | **Sí, con trabajo manual** |
| Máquinas C/E | ~5.000 | Llamadas a modelos (API o local) | **Cuello de botella** |
| Máquinas D | ~1.500 | Continuaciones | Ídem |

**Conclusión incómoda:** el brazo humano es alcanzable; **el brazo de máquina no**, sin cuota gratuita o sin cómputo propio. Generar 6.500 textos con calidad controlada, parámetros registrados y reproducibilidad exige acceso estable a modelos. Con cuotas gratuitas se puede aspirar a **1.500–2.500 textos de máquina**, es decir, a la versión 0.5, no al corpus definitivo.

Por eso la recomendación del §7 separa **medir** (posible hoy) de **construir** (requiere recursos o alianzas).

---

## 6. Presupuesto 0 USD

| Partida | Coste | Cómo se consigue a 0 USD | Riesgo |
|---|---|---|---|
| Datos con licencia | 0 | AuTexTification 2023 (CC-BY-NC-SA), OASSt2 (Apache-2.0), Wikipedia/Wikisource, `spanish_books`, `punta-cana` | Licencias NC limitan uso comercial futuro |
| Datos restringidos | 0 | Solicitud a MULTITuDE / IberAuTexTification / autores de Schaaff | Pueden denegarla; plazos |
| Generación de texto | **0 solo con cuotas gratuitas** | Modelos locales pequeños en CPU (calidad baja) o niveles gratuitos de proveedores | Límites de tasa, cambios de ToS, no reproducibilidad |
| Almacenamiento | 0 | Disco local; el corpus de 10.000 textos ≈ 50–100 MB | Nada relevante |
| Cómputo de evaluación | 0 | CPU; los motores de Umbral son estadísticos y scikit-learn ligero | Tiempo, no dinero |
| Anotación | 0 | Autoría propia + voluntarios con consentimiento | Sesgo del anotador único; hay que declararlo |
| Herramientas | 0 | Python estándar + Node/Next ya instalados | — |
| Asesoría legal | **sin presupuesto** | Interpretación conservadora propia | **Riesgo real**: las licencias ND/NC no se resuelven leyendo fichas |

**Coste total monetario: 0 USD.** El coste real es **tiempo** y **cobertura**: sin dinero no se compran licencias, no se paga anotación independiente y no se garantiza acceso a modelos modernos.

---

## 7. Recomendación final (8 puntos)

1. **Uso inmediato, hoy, sin pedir permiso a nadie.** Medir los motores de Umbral contra **AuTexTification 2023 en español** (52.191 textos, CC-BY-NC-SA-4.0, seis generadores, cinco dominios). Añadir **RAID** para el protocolo de robustez (no sus datos en español, sino su diseño experimental) y **OASSt2 ES** como texto humano conversacional con licencia limpia.
2. **Requiere autorización expresa (no usar antes).** (a) **Schaaff / Human-AI-Generated Text Corpus**: sin licencia; pedir permiso escrito por la categoría «IA-reescrito» en español. (b) **IberAuTexTification 2024**: CC-BY-NC-ND; pedir permiso para construir o publicar derivados. (c) **MULTITuDE**: solicitar acceso en Zenodo. Mientras no haya respuesta, **figuran como «pendiente de autorización»**.
3. **Solo referencia, nunca como base.** M4 (sin español, sin licencia), CHEAT (textos de IEEE), HC3 (sin español), GPT-2 Output (obsoleto), esCorpius (322 GB, ND), Spanish Unannotated Corpora (licencias mezcladas), TextMachina (NC-ND, solo metodología).
4. **Descartados.** TuringBench, TweepFake y GROVER (no verificados / términos de plataforma / obsoletos), el supuesto corpus ecuatoriano de *Pol. Con.* (**no existe: búsqueda negativa**), la compra de bases de datos, el scraping y la automatización de cuentas.
5. **Combinación recomendada.** *Núcleo propio latinoamericano* (Wikipedia ES por país + Wikisource + `spanish_books` + aportaciones voluntarias con consentimiento) **para construir**, y *bancos externos* (AuTexTification 2023, e IberAuTexTification 2024 si se autoriza) **para evaluar**. Nunca entrenar y evaluar con el mismo corpus.
6. **Tamaño de la primera versión.** **Piloto de 600 documentos** (3 géneros × 50 originales × 4 versiones) para estimar ρ y validar el flujo; **versión 0.5 de 2.000** para la primera medición publicable con intervalos honestos; **definitivo de 8.000–10.000** solo si se resuelve el acceso a modelos. **Los 2.000/200 no se presentan como validación** (§5.1).
7. **Características de los documentos.** 9 géneros; 150–600 palabras (mínimo 80, que es el umbral donde Umbral ya no devuelve índice); 6 países con `country` obligatorio; **3 versiones de máquina por original** (generación desde cero, continuación, reescritura) + híbridos cuando sea posible; metadatos completos del §3.3; sin PII; consentimiento firmado; longitud emparejada entre clases; fecha de corte declarada.
8. **Cómo construir el benchmark.** Partición **por `family_id`** con hash reproducible; cinco experimentos (E1–E5) reportados por separado; métricas primarias **AUROC, TPR@FPR 1 %, FPR con IC de Wilson, calibración (Brier/ECE)**; **siempre n, IC y número de documentos independientes**; test congelado y no publicado; los 8 controles anti-fuga del §4.4 ejecutados y registrados; y una sección fija de limitaciones que diga, en cada informe, **qué variedades y qué modelos no están representados**.

**La frase que debe acompañar a cualquier cifra:** *«medido sobre N documentos independientes de tales géneros, países y generadores; no se extiende a otros»*. Si esa frase no se puede escribir con datos, la cifra no se publica.

---

## 8. Fuentes verificables

Todas consultadas el 30 de octubre de 2026.

**Datasets y fichas**

1. AuTexTification 2023 — ficha HF con licencia y tabla de splits: https://huggingface.co/datasets/symanto/autextification2023
2. AuTexTification 2023 — artículo: https://arxiv.org/abs/2309.11285 · https://github.com/autextification/AuTexTification-Overview (Apache-2.0, verificado por API)
3. IberAuTexTification 2024 — ficha HF (CC-BY-NC-ND-4.0, tabla por dominio y modelo): https://huggingface.co/datasets/Genaios/iberautextification
4. IberAuTexTification 2024 — portal ODESIA (declara CC-BY-4.0: **contradice la ficha**): https://portal.odesia.uned.es/en/dataset/iberautextification-2024
5. IberAuTexTification 2024 — Zenodo restringido: https://zenodo.org/records/10853560 · https://zenodo.org/records/11034382
6. Human-AI-Generated Text Corpus — repositorio (sin licencia): https://github.com/iu-ai-research/human-AI-generatedTextCorpus
7. Human-AI-Generated Text Corpus — artículo: https://aclanthology.org/2023.icnlsp-1.1/
8. MULTITuDE — Zenodo restringido y términos: https://zenodo.org/records/10013755
9. MULTITuDE — artículo: https://aclanthology.org/2023.emnlp-main.616/
10. MULTITuDE — código: https://github.com/kinit-sk/mgt-detection-benchmark (GPL-3.0, verificado por API)
11. M4 — repositorio (sin licencia): https://github.com/mbzuai-nlp/M4
12. M4 — artículo y tabla de dominios/licencias: https://arxiv.org/html/2305.14902 · https://aclanthology.org/2024.eacl-long.83/
13. RAID — repositorio (MIT, verificado por API): https://github.com/liamdugan/raid
14. RAID — artículo: https://aclanthology.org/2024.acl-long.674/
15. CHEAT — repositorio (MIT, verificado por API): https://github.com/botianzhe/CHEAT
16. CHEAT — artículo: https://arxiv.org/abs/2304.12008
17. HC3 — ficha HF (CC-BY-SA-4.0, verificado por API): https://huggingface.co/datasets/Hello-SimpleAI/HC3
18. OASSt2 — ficha HF (Apache-2.0, 35 idiomas, verificado por API): https://huggingface.co/datasets/OpenAssistant/oasst2
19. GPT-2 Output Dataset — repositorio (MIT, verificado por API): https://github.com/openai/gpt-2-output-dataset
20. esCorpius — artículo y licencia: https://arxiv.org/abs/2206.15147 · https://lindat.cz/repository/xmlui/handle/11372/LRT-4807
21. Spanish Unannotated Corpora — repositorio (MIT en el código): https://github.com/josecannete/spanish-corpora
22. `spanish_books` — ficha HF (CC-BY-SA-4.0, verificado por API): https://huggingface.co/datasets/jorgeortizfuentes/spanish_books
23. `punta-cana-spanish-reviews` — ficha HF (MIT, verificado por API): https://huggingface.co/datasets/beltrewilton/punta-cana-spanish-reviews
24. TextMachina — repositorio y `LICENSE` (CC-BY-NC-ND-4.0, leído literalmente): https://github.com/Genaios/TextMachina
25. Wikipedia ES — volcados: https://dumps.wikimedia.org/eswiki/

**Métodos y estadística**

26. Wilson (1927), intervalo de confianza para proporciones — usado en §5.1.
27. Hanley & McNeil (1982), error estándar del AUROC — usado en §5.2.
28. Cohen (1988), potencia y tamaño del efecto — fórmulas de §5.3.
29. Shaib et al., *Measuring and Improving Consistency of Text Detectors* (arXiv:2403.00553) — TTR/MATTR/compresión correlacionan 0,79–0,99 con la longitud. **Umbral debe controlar longitud o truncar.**
30. Holtzman et al. (2020), *The Curious Case of Neural Text Degeneration* (ICLR) — la repetición depende de la decodificación (humano 0,28 % · greedy 73,66 % · nucleus p=0,95 0,36 %), **no del autor**.
31. Goh & Barabási (2008), EPL 81:48002 — definición de *burstiness* `B = (σ−m)/(σ+m)` sobre **tiempos entre eventos**, no sobre longitudes de oración.
32. Kim & Jo (2016), PRE 94:032311 — `B` está sesgado por el número finito de eventos: con 11–13 oraciones no es interpretable con precisión.

---

### Anexo · Registro de verificación

| Comprobación | Método | Resultado |
|---|---|---|
| Licencia de AuTexTification 2023 | ficha HF, sección *Licensing Information* | CC-BY-NC-SA-4.0 |
| Licencia de IberAuTexTification 2024 | ficha HF, sección *Licensing Information* | CC-BY-NC-ND-4.0 (el portal ODESIA dice CC-BY-4.0: **discrepancia**) |
| Licencia de Schaaff | `GET api.github.com/repos/iu-ai-research/human-AI-generatedTextCorpus` | `license: null` |
| Licencia de M4 | `GET api.github.com/repos/mbzuai-nlp/M4` | `license: null` |
| Licencia de RAID | `GET api.github.com/repos/liamdugan/raid` | MIT |
| Licencia de CHEAT | `GET api.github.com/repos/botianzhe/CHEAT` | MIT |
| Licencia de HC3 | `GET huggingface.co/api/datasets/Hello-SimpleAI/HC3` | cc-by-sa-4.0 |
| Licencia de OASSt2 | `GET huggingface.co/api/datasets/OpenAssistant/oasst2` | apache-2.0 |
| Licencia de TextMachina | `GET api.github.com/repos/Genaios/TextMachina/license` | CC BY-NC-ND 4.0 (texto leído) |
| Acceso a MULTITuDE | página de Zenodo | *Restricted*, con formulario y 5 condiciones |
| Corpus ecuatoriano «Pol. Con.» | búsqueda web dirigida | **sin resultados pertinentes** |

**Lo que este informe no ha hecho:** no descargó datos, no ejecutó ningún detector, no midió ningún corpus y no verificó ninguna cifra de rendimiento propia. Las cifras de §5 son cálculos de potencia estadística, no resultados empíricos.
