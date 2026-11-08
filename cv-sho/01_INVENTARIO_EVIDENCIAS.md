# Inventario de evidencias — Sho Nakamura Salvatierra

**Fecha de auditoría:** 8 de noviembre de 2026
**Alcance:** revisión directa del repositorio `shonakamura06-stack/aa` (todas sus ramas y PR abiertos), de los sitios publicados enlazados en el propio código y de los siete archivos del paquete de traspaso.

## Cómo leer los niveles

| Nivel | Significado |
|---|---|
| **VERIFICADO** | Lo comprobé yo sobre el archivo, el commit o la URL pública en esta sesión. |
| **DOCUMENTADO** | Está escrito en un documento del propio proyecto (README, informe de pruebas), pero no lo reejecuté. |
| **DECLARADO** | Solo lo afirma Sho. Sin archivo ni enlace que lo respalde. |
| **POR VERIFICAR** | Existe material pendiente de recibir o de revisar. |
| **NO AFIRMAR** | Sería exagerado o incorrecto escribirlo en un CV hoy. |

---

## 1. Proyectos de software

### 1.1 Sintonía — plataforma de 11 juegos de fiesta multijugador

| Campo | Dato |
|---|---|
| Periodo con evidencia | 28 de octubre – 7 de noviembre de 2026 (commits) |
| Dónde | Repo `aa`, rama `arena/c6513f6f-aa`, PR #2 abierto. App en un único `index.html` de 4.529.249 bytes |
| URL pública | **https://sintonia-beta.vercel.app** — abierta y funcionando en esta sesión |
| Qué demuestra | Producto real, en producción, con 11 juegos: Dial de las Mentes, Verdad o Reto, El Impostor, Palabra Tabú, ¿Quién es más probable?, Yo nunca nunca, Historia en cadena, Trivia, Ranking imposible, Adivina el personaje, El Precio Justo |
| Rol del usuario | Diseño funcional y de producto. Los informes del repo documentan sus decisiones: la PC anfitriona no juega, los equipos no se asignan automáticamente, los puntos de pareja se dividen entre sus integrantes, seis rangos de precio con comparación decimal exacta, sistema antirrepetición por banco |
| Autoría del código | **De los 29 commits de la rama, 16 los firma `Arena Agent`** (agentes de IA) y 13 la cuenta de Sho (que actúa como autora de los cambios que él pidió y revisó). El código no es escritura manual suya |
| Pruebas | 42 archivos de prueba, ~2.352 líneas. 99 informes TAP guardados, de los cuales 21 son capturas de fallo *antes* de corregir y el resto la verificación posterior |
| Suites registradas | `suite-final.tap`: 62 pruebas, 60 pasan, 2 fallan (343 s). `suite-mision-continuada-final.tap`: 94 pruebas, 93 pasan. README afirma 58/58 sobre una versión anterior del HTML |
| Contenido | Inventario real: 4.583 entradas sumadas por banco/mercado (Dial 2.125; Verdad 1.040; Reto 540; Tabú 74; Impostor 100; Más probable 130; Yo Nunca 125; Historia 100; Ranking 30; Trivia 53; Personaje 34; Precio 252 en seis mercados). Objetivo declarado: 12.000 |
| Nivel | **VERIFICADO** (URL, código, informes, commits) |
| Qué falta | Decidir qué se escribe: hoy es un producto vivo con pruebas automatizadas y límites documentados, no un lanzamiento terminado. El propio repo dice que no hay validación con teléfonos físicos ni con la señalización pública |
| ¿Publicable en portafolio? | Sí, con URL y una frase clara sobre su rol |

**Inconsistencia detectada:** el total declarado en el informe es 4.583, pero la suma de las 17 filas del inventario da 4.586. Diferencia de 3. Conviene corregirlo antes de citar la cifra en cualquier lado.

### 1.2 Trazador · Math Wars — NO ESTABA EN EL PAQUETE

| Campo | Dato |
|---|---|
| Fecha | 29–30 de octubre de 2026 |
| Dónde | Rama `arena/12cd94a3-aa`, carpeta `trazador/` (3.095 líneas de JS, 1.073 de CSS, 285 de HTML) |
| URL pública | **https://trazador-math-wars.vercel.app** — abierta y funcionando en esta sesión |
| Qué es | Plano cartesiano interactivo para planear tiros en Math Wars (Roblox): dibujas la curva con puntos y la app calcula por mínimos cuadrados la ecuación que mejor encaja, detecta choques con obstáculos y devuelve la fórmula lista para pegar en el chat del juego |
| Qué demuestra | Aplicación web publicada, con matemática real implementada (ajuste polinómico de grado 1–8, ondas de 1–5, familias lineal/cuadrática/cúbica/valor absoluto/log/trig/exp/raíz), interfaz para móvil y escritorio |
| Nivel | **VERIFICADO** en cuanto a existencia y funcionamiento público. La autoría personal está **POR VERIFICAR**: hay que confirmar si el diseño y las decisiones son suyos y el código lo escribió un agente |
| Relevancia | Es la evidencia publicada más limpia que tiene. Un enlace que funciona vale más que diez proyectos sin publicar |

### 1.3 ELIGE TU PROBLEMA — juego de dilemas absurdos

| Campo | Dato |
|---|---|
| Fecha | 29 de octubre de 2026 |
| Dónde | Rama `arena/568d791a-aa`, PR #1 abierto. `index.html` único, 181 KB, sin dependencias |
| Qué demuestra | 66 dilemas originales en 10 categorías, 10 finales deterministas calculados con las decisiones, partidas de 5/10/20, reto del día, tarjeta PNG en canvas, guardado tolerante a fallos, accesibilidad |
| Pruebas | 7 suites automatizadas, 7/7 aprobadas (~54 s) sobre jsdom; `PRUEBAS.md` documenta 2.000 partidas simuladas para comprobar que los 10 finales son alcanzables |
| Nivel | **VERIFICADO** (código, pruebas e informe). Publicación: **NO** — el propio README dice que Netlify está pendiente y que no hubo navegador gráfico |
| Qué falta | Un despliegue de una hora de trabajo. Publicarlo convertiría un trabajo bueno en una prueba visible |

### 1.4 Umbral — plataforma de análisis de texto

| Campo | Dato |
|---|---|
| Fecha | 1 de noviembre de 2026 |
| Dónde | Rama `arena/0892cbf1-aa`, carpeta `umbral/`. Next.js 16 + React 19 + TypeScript + Zod + Vitest |
| Qué demuestra | Arquitectura con 15 analizadores propios, orquestador con concurrencia y timeouts, agregador por grupos de dependencia, 185 pruebas automatizadas según su README |
| Nivel | **DOCUMENTADO**. El README es inusualmente honesto: marca como deshabilitado el clasificador ML, como no ejecutados los adaptadores de terceros y como inexistente la probabilidad conjunta calibrada |
| Qué falta | Correr `npm test` para confirmar las 185 pruebas. Sin ejecutar, la cifra es una declaración del propio informe |
| Relevancia para el CV | Alta para la versión tecnológica: es el proyecto donde mejor se ve criterio de ingeniería y rigor al distinguir lo probado de lo no probado |

### 1.5 devkit — CLI de auditoría de interfaz con navegador real

| Campo | Dato |
|---|---|
| Fecha | 30 de octubre de 2026 |
| Dónde | Rama `arena/1ac7bf76-aa` |
| Qué demuestra | Herramienta que audita contraste y layout con Chromium real mediante `getComputedStyle` y `getBoundingClientRect`, tokens derivados de Radix corregidos hasta cumplir WCAG AA, regresión visual y puerta de calidad en CI |
| Nivel | **DOCUMENTADO** |
| Uso en CV | Margen. Sirve como línea de "pruebas y control de calidad", no como proyecto propio |

### 1.6 Grafica-con-la-promo-HEIFFENS26 — repo público

| Campo | Dato |
|---|---|
| Dónde | Repo público `shonakamura06-stack/Grafica-con-la-promo-HEIFFENS26` |
| Qué contiene | **Solo un README de 142 bytes y un commit inicial del 7 de agosto de 2026.** No hay código |
| Posible relación | La descripción habla de acompañar a la promoción en "el bello arte de las matemáticas". Puede ser el contador de sellos del paquete. **Confirmar** |
| Nivel | **POR VERIFICAR**. Hoy no demuestra nada: un repo vacío es peor que ningún repo |

### 1.7 Lo que NO se puede atribuir

`ponytail/` (carpeta del repo `main`) es un proyecto de terceros: lleva la licencia MIT de **DietrichGebert** y su README original, con insignias de estrellas y de Trendshift. Está copiado en el repositorio. **No aparece en ningún CV ni portafolio.** Lo menciono porque un reclutador técnico que abra el repo lo verá y no debe confundirse con trabajo propio.

---

## 2. Documentos y escritura

| Evidencia | Fecha | Estado | Nivel |
|---|---|---|---|
| `CV_Sho_Nakamura.docx` y `.pdf` | 27 oct 2026 | Revisado antes; **no está en este entorno** | DOCUMENTADO |
| `Reflexion_futuro_tecnologia_plan_IA.docx` | oct 2026 | Documento de tres páginas revisado antes | DOCUMENTADO |
| Documentos de posición, discursos y dos resoluciones de BOLMUN 2026 | 2023–2026 | Anunciados, no recibidos | POR VERIFICAR |
| `Texto pegado(4).txt` | nov 2026 | Llega con estructura OOXML de Word, no texto. Sigue ilegible | POR VERIFICAR |
| Informes técnicos de Sintonía (`AUDITORIA-SINTONIA.md`, `CONTINUACION-MISION.md`, `CONTINUACION-MULTIJUGADOR.md`) | oct–nov 2026 | En el repo, en español, con estructura de hallazgo, causa, criterio de aceptación y verificación | VERIFICADO |

**Observación importante:** esos informes son el mejor ejemplo de redacción técnica que tiene, y no están en el CV. Están escritos por los agentes bajo su criterio de aceptación, así que la autoría es mixta, pero el método de trabajo —decidir qué se considera aceptable, exigir reproducción del fallo antes de corregir, separar lo probado de lo no probado— sí es un argumento profesional defendible.

---

## 3. Formación, certificados y reconocimientos

| Evidencia | Estado | Nivel | Qué falta |
|---|---|---|---|
| Cuarto lugar, Olimpiada de Robótica SPIKE UPSA 2026, entre 32 equipos | En el CV anterior | DECLARADO | Certificado o acta, nombre exacto de la categoría, foto del robot, qué módulo armó él |
| BOLMUN, cuatro ediciones 2023–2026 (Costa de Marfil, Rusia, Afganistán, China) | En el CV anterior | DECLARADO | Tres certificados anunciados; falta ver a qué edición corresponde cada uno |
| Dos resoluciones redactadas en BOLMUN 2026 | Declarado | DECLARADO | Los documentos. No afirmar que fueron aprobadas |
| Triatlón de Ciencias Exactas UCB, 29 sep 2026 | En el CV anterior | DECLARADO | Certificado |
| Dos insignias IBM SkillsBuild en Credly | Declarado | POR VERIFICAR | La URL enviada es de gestión (`/edit/badges/credly`), no la pública. Hace falta el perfil público y comprobar que las insignias estén visibles |
| Beca del 60 % en UNIVALLE | Reserva confirmada según él | POR VERIFICAR | Nombre oficial del programa y documento. No escribir "becario" ni "matriculado" |
| Certificado STEM | Emitido con el nombre de su hermano | NO AFIRMAR | No usar hasta que lo rectifiquen |
| Promedio superior a 80 en cuarto y quinto de secundaria | Declarado | DECLARADO | Boleta o constancia del colegio |
| Segundo y quinto puesto de curso | En el CV anterior | DECLARADO | Sin documento a la vista |
| Inglés B1–B2 | Autoevaluado | DECLARADO | Ninguna prueba. C1 en curso, **no logrado** |

---

## 4. Experiencia práctica y servicio

| Evidencia | Estado | Nivel | Qué falta |
|---|---|---|---|
| Robótica LEGO SPIKE y Arduino; basurero automático con sensor; carritos publicitarios | En el CV anterior | DECLARADO | Fotos, componentes, código, si fue individual o en grupo |
| Torneo escolar de ajedrez 2026, organizador | En el CV anterior | DECLARADO | Nombre del evento, participantes, tareas concretas, si fue solo o con equipo |
| CEPCAS: jornadas en refugios de niños y de perros, donaciones a bomberos | Declarado | POR VERIFICAR | Nombre completo de CEPCAS, fechas, número de jornadas. Sin eso, se escribe de forma general |
| Excel: funciones, tablas dinámicas, gráficos, validación, limpieza, macros/VBA | Declarado, sin ningún archivo | **POR VERIFICAR — es el hueco más grande** | Un `.xlsx` y, si hay macros, el `.xlsm` original. Un PDF no sirve: se pierde el VBA |
| Zapier: automatizaciones reales | Declarado | POR VERIFICAR | Un flujo: disparador, aplicaciones, pasos, resultado |
| Soporte básico de Android | Declarado | DECLARADO | Marginal. No presentar como soporte técnico profesional |
| Minecraft técnico (Redstone, Create, Mekanism) | Declarado | DECLARADO | Sin vídeos publicados no es experiencia. Puede ser interés |

---

## 5. Resumen numérico del inventario

- **2 proyectos con URL pública funcionando**, comprobados por mí esta sesión: Sintonía y Trazador.
- **2 proyectos completos sin publicar**: ELIGE TU PROBLEMA y Umbral.
- **1 repo público vacío**: Grafica-con-la-promo-HEIFFENS26.
- **0 archivos de Excel recibidos.** Cero. Y es la habilidad que más pesa en la versión administrativa.
- **0 certificados recibidos.** Los siete que menciona el paquete (tres BOLMUN, UPSA, UCB, dos IBM) están todos sin ver.
- **1 certificado que no se puede usar** (STEM, nombre equivocado).
