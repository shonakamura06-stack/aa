# BoomSolver — Informe de Fase 2 (validación y perfeccionamiento)

Rama `arena/9fd9886d-aa` · fecha 2026-11-12 · motor 2.0.0

Este informe cierra la Fase 2 con una regla por delante:

> **Una prueba verde demuestra que el código cumple la especificación que
> escribimos. No demuestra que el juego real se comporte así.**
>
> Cuando algo sólo se ha comprobado contra nuestras propias hipótesis, aquí se
> dice «hipótesis», no «confirmado».

---

## 1. Qué se ha hecho en esta fase

| Bloque | Qué se añadió | Estado |
|---|---|---|
| Corrección del buscador (§6) | Oráculo de fuerza bruta independiente y contraste automático con el solver | hecho |
| Estados de optimalidad | `optimalityProven` / `bestKnown` / `timedOut` / `unknown` / `infeasible` / `cancelled` / `invalid-level`, con `proofNote` y truncado declarado | hecho |
| Arnés de mecánicas | `cases.portals.js` (P01–P18) y `cases.geysers.js`, con estados `hypothesis` / `unknown` y **cero** `verified` | hecho |
| Infraestructura de visión (§5) | Etiquetas, abstención, matriz de confusión, pares vigilados, split train/eval, informe | hecho |
| Restricciones del generador | `exactSolutionCount`, `requireGeyserTimers`, `difficultyMin/MaxScore`, `forbidObjects`, rechazo con motivo | hecho |
| Análisis del workbench (§8) | Ondas, recorrido de portales, temporizadores de géiser, libro de daño, grafo de cadena, comparador A/B, banner de optimalidad | hecho |
| Rendimiento | 10 pruebas de límites: tablero grande, muchas soluciones, portales en bucle, cadenas largas, cancelación, progreso | hecho |
| **Rejilla de visión** | Corregido el defecto que leía 10×7 como 2×3 | hecho |
| **Corpus sintético** | Emblema por objeto: sin él, el corpus medía un caso que el juego no produce | hecho |
| Guarda del workbench | Las funciones de análisis rechazan la salida del solver (que no es una simulación): antes los paneles mostraban «0 ondas» en silencio | hecho |
| Capturas reales del juego | **No hay**. Sin ellas no se puede afirmar precisión real | **pendiente** |

---

## 2. Resultado real de la suite

```
$ cd boomsolver && node --test "tests/*.test.mjs"
# tests 205
# pass 205
# fail 0
# duration_ms 13731
```

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `engine.bombs.test.mjs` | 15 | alcance N1–N4, muro, HP 2 entre olas, bloqueo en el tick de destrucción, cadena, peligros, determinismo |
| `engine.portals.test.mjs` | 11 | transporte, dirección, alcance completo vs sobrante, emparejamiento, impar, bucle, destino bloqueado |
| `engine.geysers.test.mjs` | 9 | arranque sin mecha, temporizadores 1–5, cruz de 9 casillas, detonación de bombas cercanas, indestructibilidad |
| `engine.mechanics.test.mjs` | 22 | espejos en 8 casos, detonadores con/sin cable, 4 patrones de dinamita, magma, interruptores «a la vez», enemigas |
| `solver.test.mjs` | 22 | fusiones, métricas separadas, Pareto `{(1,8),(2,6)}`, timeout y cancelación sin afirmar optimalidad, contrato buscador↔simulador |
| `solver.correctness.test.mjs` | 22 | contraste sistemático contra fuerza bruta: el solver no pierde ni inventa óptimos |
| `goals.test.mjs` | 11 | objetivos compuestos, condiciones negativas, objetivos vacuos rechazados |
| `validation.mechanics.test.mjs` | 12 | el arnés de portales/géiseres se ejecuta y **falla** si una aserción se rompe |
| `generator.test.mjs` | 13 | reproducibilidad por semilla, solvencia demostrada, JSON versionado, dificultad explicable |
| `generator.constraints.test.mjs` | 14 | cada restricción rechaza lo que debe y acepta lo que debe, con motivo |
| `vision.test.mjs` | 14 | región, rejilla (incluido el barrido de robustez), clasificación, temporizador, bandeja, portales, hipótesis |
| `vision.evaluation.test.mjs` | 16 | métricas, abstención sin premiar ni penalizar, matriz, pares vigilados, split, casos no evaluables |
| `analysis.sessions.test.mjs` | 14 | ondas, portales, temporizadores, daño, cadena, comparador, banner |
| `performance.test.mjs` | 10 | límites de tiempo/tamaño y honestidad ante el truncado |

Comprobaciones fuera de la suite (`node scripts/cli.mjs …`):

```
validate → PORTALES: 18/18 casos asertados            (hypothesis 13 · unknown 5)
           GÉISERES: 14/14 asertados + 2 observacionales (unknown 10 · hypothesis 6)
           fallos: ninguno · casos marcados "verified": 0
oracle   → Fuerza bruta: completa · 26 jugadas · mínimo 1 · 2 soluciones mínimas
           Solver: optimalityProven · 2 soluciones
           Coinciden: el solver no pierde ni inventa soluciones óptimas.
```

---

## 3. El defecto que se corrigió: la rejilla de visión

### Síntoma

`buildGrid` acertaba hasta 8×6, pero **10×7 devolvía 2×3** (con aviso de
«casillas no cuadradas»). Un tablero real de 10 columnas se leía como un
tablero diminuto: cualquier métrica posterior era basura.

### Causa

El estimador puntuaba, para cada `k`, la suma de energía de borde en los
múltiplos de `total/k`. Con ese criterio **`k` pequeño siempre gana**: hay menos
cortes que acertar. Además los dos ejes se estimaban por separado, así que un
eje con menos contraste arrastraba al otro.

### Corrección

La rejilla se trata como un **periodo**, no como un máximo:

1. Energía de borde medida en **color** (no en luminancia): dos casillas pueden
   tener el mismo brillo y aun así ser un borde evidente.
2. Bordes candidatos = máximos locales, ponderados por **prominencia** frente al
   fondo local. Esto separa una junta de casilla del moteado periódico de la
   imagen (que, medido sólo en altura, parecería un borde por píxel).
3. Bordes **fuertes** = los que superan el 45 % del más intenso; un borde débil
   suele ser el contorno de un objeto *dentro* de su casilla.
4. Lado de casilla = el **mayor** que explica todos los bordes fuertes con
   residuo ≤ 2 px. Se recorre de mayor a menor: el lado real también explica sus
   múltiplos, pero un divisor (20 px cuando la casilla es 40) inventa casillas.

Se eliminó el código muerto (`dimensionFor`, `combPeriod`, `peakSpacing`) y
`buildGrid` publica ahora `cellSide` y `gridFit{ratio, reliable, coverage,
peaksExplained, peaksFound, peaksSeen}` para poder auditar la decisión.

### Medición

Barrido de 240 casos (tamaños 3×2 … 12×9 × casilla 24/32/40/56/72 px × ruido
0/20/45 × con y sin marco exterior):

```
casos 240 · rejillas exactas 240 · tasa 1.000 · fallos: ninguno
```

Ese barrido quedó fijado como prueba de regresión
(`vision.test.mjs → «la rejilla sobrevive a tamaño de casilla, ruido y marco»`).

**Límites conocidos y declarados:** un tablero de **1×1** se lee como 4×4 y uno
de **5×1** como 4×1. En ambos casos no hay suficientes juntas interiores para
fijar el periodo; el detector lo marca con `confidence 0.3` y el aviso de
«confirma filas y columnas». No se oculta: se informa.

---

## 4. El corpus de visión: por qué antes salía 0 aciertos

Con la rejilla ya correcta, el informe seguía dando **0 aciertos / 20
abstenciones**. No era el evaluador: era el corpus.

`synthCase` pintaba **un color plano por casilla**. El clasificador mide, entre
otras cosas, la variación interna de luminancia (`texture`), así que ninguna
casilla podía confirmarse y todo quedaba en `needs_review` (0.55). El corpus
estaba midiendo un caso que el juego no produce: en el juego **cada objeto tiene
una forma**.

Ahora `synthCase` dibuja un emblema geométrico por objeto (diamante, picos,
caja, anillo, diagonal…) y una veta suave en el suelo. `iconos:false` reproduce
el caso plano a propósito, y hay pruebas para los dos:

- con emblemas: la cadena imagen→rejilla→casilla→clase→métrica funciona de
  punta a punta;
- sin emblemas: el detector se abstiene en todo (es una limitación honesta, no
  un acierto que haya que «arreglar» forzando el tipo).

### Números actuales del corpus sintético

```
$ node scripts/cli.mjs vision
Imágenes: 4 (reales: 0, sintéticas: 4) · Casillas: 90
Aciertos: 56 · abstención: 34 · errores: 0
Cobertura (responde): 0.622 · acierto sobre respondidas: 1.000
```

Cero errores y cero confirmaciones falsas; el precio es que se abstiene en el
38 % de las casillas (casi todo suelo). **Estos números no son precisión del
detector frente al juego**: los colores del corpus salen de las mismas
constantes que usa el clasificador. Sirven como regresión y como escala, no como
validación.

---

## 4-bis. Un fallo silencioso que apareció al conectar la UI

Al probar la tubería real del workbench (solver → «cargar jugada» → motor →
paneles) salió un error de diseño, no de cálculo: las funciones de análisis
recibían a veces **la salida del solver**, que se parece a una simulación pero no
lo es. En una solución, `ticks` es un **número** (cuánto dura la jugada) y no hay
`ticks[]`; `waves` también es un número (cuántas explosiones), no una lista.

Resultado: los paneles pintaban «0 ondas» y «sin cadenas» **sin ningún error**,
que es la peor forma de fallar: datos falsos con aspecto de dato bueno.

Corrección: `asSimulation()` valida la entrada en `waveBreakdown`,
`portalTrail`, `geyserTimers`, `damageLedger` y `chainGraph`. Si recibe la salida
del solver, lanza un `TypeError` que dice exactamente qué hacer («simula antes de
analizar»). Se acepta un sobre `{ log }` para los casos en que sólo hacen falta
los eventos. Hay una prueba de la tubería completa que lo fija.

---

## 5. Lo que esta fase NO demuestra

| Afirmación | ¿Demostrada? | Por qué |
|---|---|---|
| El motor respeta la especificación escrita | sí | 205 pruebas + arnés de mecánicas |
| El solver devuelve el mínimo de bombas | sí, para los niveles probados | contraste con fuerza bruta independiente |
| Las reglas coinciden con el juego real | **no** | ningún caso del arnés está marcado `verified`; las mecánicas son `hypothesis`/`unknown` |
| El detector reconoce capturas reales | **no** | corpus real: 0 imágenes |
| La UI funciona en un navegador | **no** | no hay navegador en el entorno; se valida por HTTP y por lógica pura (no hay prueba de DOM) |

---

## 6. Lo que necesito para cerrar la validación real

1. **El PDF (o capturas sueltas) con los niveles del juego.** Con una captura
   por nivel basta; si además vienen las etiquetas (qué hay en cada casilla,
   temporizadores, colores de portal), se convierten en `loadRealCase` y el
   informe pasa a decir `reales: N`.
2. **Una partida grabada de 3–4 niveles con portales** para cerrar Q1–Q3
   (emparejamiento cuando hay 4 del mismo color, alcance al salir, destino
   ocupado).
3. **Un nivel con géiseres** donde se vea el número del temporizador y explote,
   para decidir Q5–Q7 (unidad del temporizador, orden con las bombas, si bloquea
   la onda).

Con cualquiera de los tres, el trabajo es directo: se añade el caso a
`src/validation/cases.*` o al corpus de visión, se ejecuta y —si no cuadra— se
cambia **el parámetro declarado**, no el motor.

---

## 7. Cómo reproducir todo esto

```bash
cd boomsolver

# Suite completa
node --test "tests/*.test.mjs"

# Rejilla de visión: tamaños, zoom, ruido y marco
node --test tests/vision.test.mjs

# Mecánicas: portales y géiseres con estados honestos
node scripts/cli.mjs validate

# Corrección del solver contra fuerza bruta
cat > /tmp/nivel.json <<'JSON'
{ "format": "boomsolver-level", "version": 2, "name": "demo", "theme": "mine",
  "cols": 5, "rows": 3,
  "cells": [["empty","empty","empty","empty","empty"],
            ["empty","chest_wood","empty","gem","empty"],
            ["empty","empty","empty","empty","empty"]],
  "tray": [1,2],
  "objectives": [{ "kind": "destroy", "cells": ["1,1"] }, { "kind": "destroy", "cells": ["3,1"] }] }
JSON
node scripts/cli.mjs oracle /tmp/nivel.json --max=2

# Informe de visión (texto y JSON)
node scripts/cli.mjs vision
node scripts/cli.mjs vision --json

# Workbench
node scripts/serve.mjs   # http://localhost:5173
```
