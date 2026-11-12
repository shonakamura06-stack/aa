# BoomSolver — Auditoría Fase 0

Fecha: 2026-11-12 · Rama `arena/9fd9886d-aa`

Este documento es una auditoría **verificable**: cada afirmación sale de haber
leído y ejecutado el código, no de la documentación del proyecto.

---

## 0. Dónde está el proyecto (hallazgo que cambia el plan)

El repositorio `shonakamura06-stack/aa` **no contiene BoomSolver**. Contiene:

| Ruta | Qué es |
|---|---|
| `README.md` | 8 bytes: `# aa` / `sa` |
| `ponytail/` | Un plugin/CLI ajeno (248 archivos, tests de `uninstall.test.js`) |
| `skills/` | Fichas de instrucciones para agentes |

`grep -ril boomsolver` sobre todo el repo: **0 resultados**. No existe
`MECANICAS_BoomSolver.md`, ni el PDF de capturas, ni código del juego.

El único artefacto real del proyecto es el archivo adjunto
`index(20).html` (7,18 MB). Su estructura:

| Offset | Contenido |
|---|---|
| 0 – 55 KB | HTML + CSS de la interfaz |
| 55 KB – 118 KB | `<script type="text/plain" id="ocrLibrary">` (Tesseract embebido) |
| 118 KB – 229 KB | `id="ocrWorker"` |
| 229 KB – 4,18 MB | `id="ocrCore"` (wasm base64) |
| 4,18 MB – 6,98 MB | `id="ocrLanguage"` (spa.traineddata) |
| 6,98 MB – 7,18 MB | **la aplicación real: 3.686 líneas de JS** |

Además, ese HTML **no se puede abrir tal cual**: arrastra un script de
Cloudflare (`__CF$cv$params`) y su CSP; la app depende de `localStorage`, de
`navigator.mediaDevices` y de `file:`/`http:`. Se auditó extrayendo el bloque
JS a `/tmp/app_main.js` y leyéndolo completo.

**Consecuencia para el plan:** no hay nada que "conservar" del repo. Se
construyó un proyecto nuevo en `boomsolver/` **portando** lo que del v21 era
sólido (catálogo de objetos, reglas de fusión, convención de espejos, tipos de
nivel) y **rehaciendo** lo que era la raíz de los errores. El HTML original se
conserva como referencia de la interfaz y del detector, no como base de código.

---

## 1. Arquitectura actual (del v21, según el código real)

Todo vive en un solo ámbito global dentro de un `<script>`. Secciones por número:

| Sección | Líneas | Responsable | Estado real |
|---|---|---|---|
| 1. Elementos y presets | 1–330 | `BUILTIN_TILES`, `getTileBehavior`, `loadPreset` | Funciona. 8 presets escritos a mano (`lvl42`, `lvl40`, `lvlDet`, `lvl35`, `lvl32`, `lvl57`, `lvl59`, `lvl49`, `lvl47`, `lvl43`, `lvl31`). |
| 2. Intérprete de capturas | 331–996 | `interpretImage` (~600 líneas) | Funciona parcialmente. Detección de rejilla por conteo de píxeles "tan"/"verde" y clasificación por umbrales de color. |
| 3. Física y buscador | 997–1453 | `simulateTurn`, `generateFusionPartitions`, `solveWithRules` | **Aquí están los defectos graves** (ver §5). |
| 4. Creador de elementos | 1454–1608 | `parseSpanishRuleLocally`, Gemini | Funciona, pero el objeto creado sólo tiene color+HP: no tiene física propia. |
| 5. Render | 1609–2175 | `renderBoard`, `renderTray`, `onCellClick` | Funciona. |
| 6. Solver UI | 2176–2497 | `runAISolver`, `solveInWorker` | Funciona; el Web Worker se crea con `Blob` + `toString()` de las funciones. |
| 7. Escaneo visual | 2498–2625 | `triggerScanAnimation`, `handleLoadedImage` | Funciona. |
| 8. Captura de pantalla | 2626–2976 | `grabScreenFrame` | Funciona (requiere permiso de pantalla). |
| 9. Proveedores de visión | 2977–3619 | Gemini / Groq / OpenRouter | Funciona si hay clave; llama a URLs externas. |
| 10. OCR local | 3620–3686 | Tesseract embebido | Funciona sin red (los datos van incrustados). |

**Generación de niveles: no existe.** `grep -in "generat"` sólo devuelve
`generateFusionPartitions` (fusiones), `generateContent` (Gemini) y
`responseMimeType`. No hay generador, ni semillas, ni dificultad, ni validación
de solubilidad.

---

## 2. Código real vs. `MECANICAS_BoomSolver.md`

El documento técnico **no está en el repositorio**, así que esta comparación se
hace contra lo que el propio código v21 declara y contra lo que el usuario
describe. Tabla implementado / parcial / ausente / no verificado:

| Capacidad declarada en v21 | Código | Prueba ejecutable | Veredicto |
|---|---|---|---|
| Simulación por olas y reacciones encadenadas | `simulateTurn` (líneas 1106–1214) | — | **Parcial**: hay bucle de olas, pero ver defectos §5.1–§5.5 |
| Detonadores con cables | líneas 1131–1152 | — | **Parcial**: funciona, pero el detonador nunca se consume (queda vivo tras explotar) |
| Reacción en cadena del mismo tipo | `eff === 'chain_same_type'` (línea 1154) | — | **Ausente en la práctica**: ningún objeto produce ese efecto; es código muerto |
| Espejos con reflexión | líneas 1085–1091 | — | **Sí**, con convención `slash: right→up` (heredada; se conservó y se probó) |
| Índice precalculado de alcance y análisis memoizado | `cascade`, `directTargetSet` (1310–1344) | — | **Sí**, aunque incompleto (sólo guarda casillas alcanzadas, no HP ni portales) |
| Búsqueda en Web Worker, límite temporal y cancelación | `solveInWorker` (2419–2436) | — | **Parcial**: hay Worker y botón de parada, pero **no hay límite temporal** |
| Poda de estados imposibles | `visitedStates` (1380) | — | **Insegura** (ver §5.4) |
| Verificación final con el simulador | línea 1392 | — | **Sí**: cada hoja se revalida. Es lo mejor del v21 y se conservó el concepto |
| Simulador manual con mecha, fusiones, deshacer, reiniciar y animación | `pushSimHistory`, `tryFuseInSim`, `playAnimation` | — | **Sí** |
| Editor de tablero, paleta, tamaño, cables, JSON e historial local | `renderPalette`, `validateLevel`, `restoreLevel` | — | **Sí**, con validación de importación bastante buena |
| Detección local de imágenes y OCR | `interpretImage`, Tesseract | — | **Parcial**, confunde objetos (lo confirma el usuario) |
| Portales | — | — | **Ausente** |
| Géiseres / temporizadores | — | — | **Ausente** |
| Objetivos compuestos (varios positivos + negativos) | `objectiveMode` (un `<select>`) | — | **Ausente**: un solo objetivo a la vez |
| Métrica separada de pólvora | `baseBombsCount` + `simPlacedCost` | — | **Parcial**: calcula pólvora, pero el buscador sólo minimiza `cost` (=pólvora) y lo llama "mínimo de bombas" |

---

## 3. Inventario real de objetos del editor

`BUILTIN_TILES` (líneas 5–26) + generación dinámica de `enemy_*` + tipos
personalizados. **Éste es el inventario que el código realmente maneja**, con
su comportamiento tal como está escrito en `getTileBehavior` (líneas
1013–1040):

| typeId | Nombre en el editor | Rol | HP | Bloquea rayo | ¿Se destruye? | Efecto al recibir explosión |
|---|---|---|---|---|---|---|
| `empty` | Vacío | pasable | 0 | no | no | — |
| `void` | Fuera del mapa | obstáculo | 999 | sí | no | — |
| `wall` | Muro | obstáculo | 999 | sí | no | — |
| `rock_soft` | Roca (1) | obstáculo | 1 | sí | sí | — |
| `rock_hard` | Roca dura (2) | obstáculo | 2 | sí | sí | — |
| `gem` | Diamante (1) | objetivo | 1 | **no** | sí | — |
| `chest_wood` | Cofre (1) | objetivo | 1 | **sí** | sí | — |
| `chest_iron` | Hierro (2) | objetivo | 2 | sí | sí | — |
| `switch` | Botón Rojo | objetivo | 1 | **no** | **no** | se activa (no se destruye) |
| `crystal` | Cristal ⚠ | peligro | 1 | sí | **no** | derrota |
| `cat` | Gato ⚠ | peligro | 1 | sí | **no** | derrota |
| `dynamite` | Dinamita | disparador | 1 | sí | sí | explosión configurable |
| `detonator` | Detonador | disparador | 1 | sí | **no** | detona cables |
| `magma_rock` | Roca de magma | disparador | 1 | sí | sí | cruz de alcance `magmaRange` |
| `mirror_slash` | Espejo / | obstáculo | 0 | **no** | no | redirige 90° |
| `mirror_backslash` | Espejo \ | obstáculo | 0 | no | no | redirige 90° |
| `enemy_1..4` | Enemiga 1..4 | disparador | 1 | sí | sí | `explode_+N`; la 3 usa 3×3 |
| `custom_*` | Elementos creados | según formulario | 1–5 ó 999 | según | según | `none`/`explode`/`magma`/`chain_same_type` |

**Objetos de las capturas que el código NO tiene** (`typeId` inexistente, por
tanto sin física): **portales azul y morado**, **géiseres con temporizador**.
Los iconos con candado y la figura naranja del editor tampoco están en
`BUILTIN_TILES`; su `typeId` real **no se ha podido determinar** (ver Q9).

---

## 4. Estado real de portales, géiseres y objetivos compuestos

**Antes del trabajo de hoy: 0 de 3.**

- No existe `portal` en `BUILTIN_TILES`, ni en `getTileBehavior`, ni en
  `getEffectBlastCells`, ni en el detector. Cero apariciones de la cadena
  `portal` en las 3.686 líneas.
- No existe `geyser`. La única aparición de `timer` en el motor es
  `animTimer` (animación) y `screenAutoTimer` (captura).
- `objectiveMode` es un `<select>` de un solo valor
  (`auto|rocks|chests|gems|switches`); `buildGoalsFromBoard` (línea 2190)
  devuelve **un único `Map`** de objetivos. Las condiciones negativas sólo
  existen como peligro global (romper un cristal = derrota), no como
  condición por nivel.

---

## 5. Riesgos que producen soluciones falsas o mínimos incorrectos

Éstos son los defectos concretos del v21. Cada uno se corrigió o se aisló en
el motor nuevo.

### 5.1 El buscador no minimiza el número de bombas
`solveWithRules` ordena por `part.cost`, que es **pólvora**, y lo presenta como
"mínimo de bombas" (`renderSolutions`, línea 2330: `Coste hallado: ${sol.cost} bombas`).
Además `sort` compara antes `cost` que `bombCountOnBoard`. Una N4 (1 bomba, 8
de pólvora) se considera *peor* que cuatro N1 (4 bombas, 4 de pólvora) y el
resultado se etiqueta como "mínimo de bombas". **Es la confusión central que
el usuario pide resolver.**

### 5.2 Corta la enumeración a 4 soluciones sin avisar
`solveInWorker(..., maxSolutions = 4)` y, dentro de `bt`, `return` en cuanto
`found.length >= maxSolutions && part.cost === minCostFound`. No hay
`truncated`, ni total conocido, ni estado de optimalidad.

### 5.3 `onlyMinCost` corta la búsqueda de forma no demostrada
`if (rules.onlyMinCost && part.cost > minCostFound) break;` se aplica **antes**
de haber encontrado nada (`minCostFound = Infinity` lo salva de milagro) y
después mientras se recorre el árbol. Como los cargamentos están ordenados por
pólvora pero las soluciones no son monótonas en pólvora, esto puede **perder
un mínimo demostrable**.

### 5.4 La memoización es insegura
```js
const stateKey = `${mechaPos}|${sortedEntries}|${remSig}`;
if (visitedStates.has(stateKey)) return;
```
`visitedStates` es **global a todo el bucle de particiones**. Dos particiones
distintas con el mismo `sortedEntries` pero distinta receta de fusiones se
podan entre sí. Y el estado no incluye reglas, ni HP, ni cables.

### 5.5 La simulación no es fiel en cuatro puntos
1. `getEffectBlastCells` recibe `unexplodedBlockers` calculado **una vez por
   ola** con `[...unexplodedBombs, ...unexplodedTriggers]`, pero los
   disparadores se añaden en el bucle: el orden de iteración de `frontier`
   cambia qué bloquea.
2. La destrucción se aplica al final de la ola (`brokenThisWave`) — correcto —
   pero `unexplodedTriggers` se vacía **antes** de aplicar los daños, de modo
   que un objeto destruido en la ola *n* deja de bloquear en la ola *n+1*
   aunque siguiera vivo al calcularla.
3. Un peligro alcanzado hace `return` inmediato con `valid: false`, pero
   `hpMap` se devuelve a medias: el diagnóstico posterior mezcla estados.
4. El detonador nunca se destruye (`disappearsOnBreak: false`) pero tampoco se
   consume: puede detonar una y otra vez si otra onda lo vuelve a alcanzar.

### 5.6 El detector confunde objetos por diseño
`interpretImage` clasifica con umbrales de color sobre toda la casilla
(`gem` si `cyan/total > 0.055`, `cat` si `orange > 0.15 && white > 0.025`…).
No hay confianza, ni alternativas, ni estado de revisión. Un cofre de madera y
una gema pueden compartir tono; el gato y el oro del cofre se diferencian sólo
por una heurística de área. No hay fixture etiquetado ni matriz de confusión.

### 5.7 El "verificador" no existe como tal
`runAISolver` compara el tablero al final y avisa si cambió, pero no hay una
pasada de verificación independiente ni contrato buscador↔simulador.

---

## 6. Plan de implementación por impacto y dependencia

Orden real de ejecución (lo hecho hoy está marcado):

| # | Entrega | Impacto | Depende de | Estado |
|---|---|---|---|---|
| 1 | Catálogo único de objetos con estado de confirmación | Alto | — | **hecho** |
| 2 | Motor determinista por ticks con cola de eventos | Crítico | 1 | **hecho** |
| 3 | Portales + géiseres en el motor, con parámetros explícitos | Crítico | 2 | **hecho** |
| 4 | Objetivos compuestos y condiciones negativas | Crítico | 2 | **hecho** |
| 5 | Solver: 3 modos, dos métricas, optimalidad honesta, enumeración completa | Crítico | 2,4 | **hecho** |
| 6 | Generador por restricciones con validación por el solver | Alto | 5 | **hecho** |
| 7 | Dificultad explicable | Medio | 5 | **hecho** |
| 8 | Detector con confianza, alternativas y revisión | Alto | 1 | **hecho** (núcleo) |
| 9 | UI que use el mismo motor (editor, solver, simulación, generador) | Medio | 2,5,6 | **hecho** |
| 10 | Web Worker + cancelación en la UI | Medio | 5 | pendiente (hoy la búsqueda corre en el hilo, con presupuesto de tiempo) |
| 11 | OCR real cableado al detector (temporizadores de géiser) | Medio | 8 | pendiente (la firma `ocrDigits` ya está inyectada y probada) |
| 12 | Banco de fixtures etiquetados con las capturas del PDF | Alto | 8 | **bloqueado**: no hay PDF en el repositorio |
| 13 | Calibración por tema visual (pradera, mina, lava, sala azul) | Medio | 12 | bloqueado por 12 |
| 14 | Hints, contrafactuales, comparación de soluciones (UI) | Medio | 5 | parcial (API hecha, UI mínima) |

---

## 7. Preguntas que hay que resolver con el usuario

Están completas, con impacto físico y prueba necesaria, en
[`RULES_OPEN_QUESTIONS.md`](RULES_OPEN_QUESTIONS.md). El resumen:

| # | Pregunta | Por qué cambia la física |
|---|---|---|
| Q1 | ¿Azul↔azul y morado↔morado? ¿Y con 4 portales? | Deciden el destino del rayo y por tanto qué se destruye |
| Q2 | Dirección y alcance al salir si hay muro justo delante | Decide si la onda continúa o muere |
| Q3 | Pareja incompleta o destino ocupado | Decide si el rayo se pierde o se ignora el portal |
| Q4 | ¿Todos los géiseres arrancan al pulsar Detonar? | Si no, un géiser fuera de alcance nunca explota |
| Q5 | ¿La unidad 1–5 es segundos, ticks o etapas? | Cambia el instante de cada explosión y las cadenas |
| Q6 | Orden cuando géiser y bomba coinciden | Cambia el resultado en el mismo tick |
| Q7 | ¿El géiser bloquea, recibe daño o sólo cuenta atrás? | Cambia si una onda lo atraviesa |
| Q8 | ¿Un géiser puede activar otro géiser? | Cambia el número de olas |
| Q9 | ¿Qué son los objetos con candado y la figura naranja? | No se les puede asignar rol sin ello |
| Q10 | Patrón de cada bomba enemiga | Cambia el daño total disponible |
| Q11 | "A la vez" = ¿misma detonación, ola o tick? | Cambia si el objetivo compuesto es alcanzable |
| Q12 | ¿El cristal siempre es derrota? | Cambia si el nivel es resoluble o no |

---

## 8. Cómo reproducir la auditoría

```bash
# 1. Extraer el JS de la aplicación del HTML adjunto
python3 - <<'PY'
s = open("/tmp/arena-coding-uploads/index(20).html", encoding="utf-8", errors="replace").read()
start = s.index('<script>', 6_980_000) + 8
end = s.index('</script>', start)
open("/tmp/app_main.js", "w").write(s[start:end])
PY
wc -l /tmp/app_main.js          # 3686 líneas
grep -in "portal\|geyser\|timbre" /tmp/app_main.js   # 0 resultados de mecánica

# 2. Comprobar que el repo no tiene proyecto
grep -ril boomsolver . | wc -l   # 0

# 3. Ejecutar las pruebas del proyecto nuevo
cd boomsolver && node --test "tests/*.test.mjs"
```

---

## 9. Lo que se conservó deliberadamente del v21

- La **convención de espejos** `slash: right→up` (`mirrorTurn`), porque era
  coherente y el usuario no la cuestiona. Se congeló con pruebas.
- El **catálogo de `typeId`** (`chest_wood`, `chest_iron`, `rock_soft`,
  `magma_rock`, `enemy_1..4`…) para no romper los presets ni los JSON ya
  exportados. El formato nuevo es `version: 2` y acepta los antiguos.
- Los **umbrales de pólvora** N1=1, N2=2, N3=4, N4=8 y los alcances 1..4.
- La idea de **verificar cada hoja con el simulador** al final de la búsqueda.
- La **paleta y los presets** de nivel, como datos de arranque de la UI.

## 10. Lo que se descartó y por qué

- `getEffectBlastCells` como función de onda con bloqueadores compartidos:
  sustituida por trazado de rayo por tick (`traceRay`).
- La memoización por `visitedStates` global: eliminada. La exhaustividad del
  nuevo solver hace innecesaria la poda agresiva y permite demostrar el óptimo.
- El cortafuegos de 4 soluciones y el `onlyMinCost` no demostrado: sustituidos
  por enumeración completa con `optimalityProven`, `bestKnown`, `timedOut` y
  `cancelled`.
- La clasificación por umbral de color único en el detector: sustituida por
  perfil multi-señal con confianza, alternativas y estado de revisión.
