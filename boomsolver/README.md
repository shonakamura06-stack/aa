# BoomSolver 2.0

Motor determinista, buscador óptimo, generador por restricciones y banco de
pruebas para el juego de bombas descrito en los materiales del proyecto.

> **Antes de nada:** el repositorio `shonakamura06-stack/aa` no contenía
> BoomSolver. La auditoría de qué había realmente (y los defectos encontrados en
> la versión v21) está en [`AUDIT_FASE_0.md`](AUDIT_FASE_0.md). Las reglas
> todavía no confirmadas están en
> [`RULES_OPEN_QUESTIONS.md`](RULES_OPEN_QUESTIONS.md). La especificación del
> motor está en [`GAME_RULES_SPEC.md`](GAME_RULES_SPEC.md).

---

## Lo que hay ahora

| Pieza | Archivo | Qué garantiza |
|---|---|---|
**Catálogo único** | `src/core/catalog.js` | 22 objetos con rol, HP, bloqueo, efecto, parámetros y **estado de confirmación**. No hay listas paralelas. |
**Motor** | `src/core/engine.js` | Simulación por ticks, resolución simultánea, portales, géiseres, espejos, cables, cadenas. Es la única física del sistema. |
**Objetivos** | `src/core/goals.js` | Varios objetivos positivos + varias condiciones negativas; intérprete de directrices en español. |
**Buscador** | `src/solver/solver.js` | `fewest_bombs`, `least_powder`, `pareto`. Enumeración exhaustiva y estado de optimalidad honesto. |
**Generador** | `src/generator/generator.js` | Restricciones → candidato → **verificado por el mismo motor** → dificultad → semilla reproducible. |
**Dificultad** | `src/difficulty.js` | Puntuación explicable por factores con peso, separando dificultad algorítmica y de jugador. |
**Análisis** | `src/analysis.js` | Bombas necesarias/redundantes, contrafactuales, mapa de calor, diagnóstico de imposibilidad, pistas. |
**Visión** | `src/vision/detector.js` | Región → rejilla → clasificación multi-señal con confianza, alternativas y estado `confirmed/needs_review/unknown`. |
**UI** | `public/` | Editor, solver, simulación tick a tick y generador, sobre el mismo motor. |
**Análisis para la UI** | `src/analysis/sessions.js` | Ondas, recorrido de portales, temporizadores de géiser, libro de daño y grafo de cadena: el workbench explica *por qué* pasó cada cosa. |
**Validación de mecánicas** | `src/validation/` | Arnés con casos P01–P18 de portales y 16 de géiseres, cada uno con estado `hypothesis`/`unknown`; **ninguno** se presenta como verificado. |
**Evaluación de visión** | `src/vision/evaluation.js` | Métricas por clase, matriz de confusión con columna de abstención, pares vigilados, split train/eval e informe que declara cuántas capturas **reales** hay. |
**Lector de capturas** | `src/vision/png.js` | PNG sin dependencias (8 bits, RGB/RGBA, sin entrelazar). Rechaza con mensaje lo que no soporta en vez de aproximar píxeles. |
**Fuerza bruta** | `src/solver/bruteforce.js` | Oráculo independiente que contrasta al buscador: si discrepan, el test falla. |
**CLI** | `scripts/cli.mjs` | `catalog`, `solve`, `generate`, `verify`, `explain`, `simulate`, `validate`, `oracle`, `vision`. |
**Pruebas** | `tests/` | 213 pruebas con `node --test`. Sin dependencias. |

---

## Uso rápido

```bash
cd boomsolver
node --test "tests/*.test.mjs"        # 213 pruebas
node scripts/cli.mjs validate         # mecánicas: portales y géiseres
node scripts/cli.mjs vision           # informe de visión (declara si hay capturas reales)
node scripts/cli.mjs vision --real=./corpus/real   # capturas reales con etiqueta humana
node scripts/serve.mjs                # http://localhost:5173
```

CLI:

```bash
node scripts/cli.mjs catalog
node scripts/cli.mjs generate --width=6 --height=4 --gems=2 --seed=5 --n1=3
node scripts/cli.mjs solve nivel.json --mode=fewest_bombs --max=20
node scripts/cli.mjs explain nivel.json
node scripts/cli.mjs simulate nivel.json --bombs=0,1:2,3,2:1 --mecha=0,1
node scripts/cli.mjs validate                    # portales y géiseres, con su estado de confianza
node scripts/cli.mjs oracle nivel.json --max=2   # fuerza bruta vs buscador
node scripts/cli.mjs vision [--json]             # métricas de visión + aviso de corpus
```

Sin claves de API, sin red, sin `node_modules`.

---

## Las dos métricas, siempre separadas

```
1 bomba N4  = 1 bomba física  + 8 de pólvora
4 bombas N1 = 4 bombas físicas + 4 de pólvora
```

El resultado del buscador **nunca** mezcla las dos. El modo `fewest_bombs`
minimiza primero el número físico; `least_powder`, la pólvora; `pareto` devuelve
la frontera no dominada. Ejemplo real y probado: cofres en ambos extremos de un
tablero de 9×2 con bandeja `[N4, N2, N2, N2]` ⇒ Pareto `{(1, 8), (2, 6)}`.

---

## Optimalidad honesta

| `status` | Significado |
|---|---|
`optimalityProven` | La enumeración terminó: el mínimo está demostrado y se listan **todas** las soluciones que lo alcanzan. |
`bestKnown` | Se encontró algo, pero la búsqueda se cortó: **no** es el óptimo demostrado. |
`timedOut` | Se agotó el tiempo sin solución; **no** equivale a «imposible». |
`cancelled` | La canceló el usuario. |
`infeasible` | Imposible con causa explicada (objetivo inalcanzable, bandeja vacía, recursos insuficientes). |

`proofNote` redacta la frase correspondiente y el límite de presentación se
declara en `truncatedPresentation` / `presentationLimit` / `totalKnown`.

---

## Objetos y estado de confirmación

`confirmed` = comportamiento descrito por el usuario o comprobado.
`assumed` = viene del documento técnico o del código v21, **no** verificado en
el juego. `unknown` = se ve en las capturas pero no se conoce su física; no se
le inventa comportamiento.

```bash
node scripts/cli.mjs catalog     # tabla completa con estado y evidencia
```

Novedades frente al v21:

- **Portales** (azul/morado): transportan el rayo conservando dirección y
  alcance completo, con emparejamiento configurable y corte anti-bucle
  determinista. Registro `portal-jump` con entrada, salida, dirección y alcance.
- **Géiseres** con temporizador 1–5: arrancan solos al Detonar, explotan en cruz
  de alcance 2 y detonan bombas cercanas. Unidad declarada como *tick* hasta
  confirmarla; se puede desplazar con `geyserArmMode` sin tocar el motor.
- **Objetivos compuestos** y condiciones negativas en el mismo nivel.

---

## Cómo demostrar que un resultado es correcto

1. `node --test "tests/*.test.mjs"` — incluye el contrato
   buscador↔simulador (**toda** solución devuelta se reproduce) y el contraste
   contra un oráculo de fuerza bruta independiente (`oracle`).
2. `node scripts/cli.mjs verify nivel.json solucion.json` — revalida con el
   simulador oficial y sale con código ≠ 0 si no se reproduce.
3. En la UI: «Cargar en simulador» y «Detonar» usan el mismo motor, así que la
   animación no puede contradecir al buscador.

---

## Lo que todavía no está hecho

- **Web Worker** en la UI: la búsqueda corre en el hilo principal con
  presupuesto de tiempo de 15 s y botón de cancelación. El motor ya es
  reentrante y sin estado global, así que moverlo a un Worker es mecánico.
- **OCR real** cableado a los temporizadores: la firma `ocrDigits` está
  inyectada y probada con un doble; falta conectar Tesseract.
- **Fixtures del PDF de capturas**: el PDF no está en el repositorio. El canal
  para meterlas ya está hecho (`corpus/real/` + `vision --real=…`, lector PNG
  sin dependencias); falta la imagen. Sin capturas etiquetadas no se puede
  afirmar precisión real por objeto.
- **Calibración por tema visual** (pradera, mina, lava, sala azul): depende de
  los fixtures.
- Los objetos con **candado** y la **figura naranja** del editor: su `typeId`
  no aparece en el código del v21. Están registrados como desconocidos.
- **Validación contra el juego real**: ninguna mecánica está marcada como
  verificada. Las 213 pruebas demuestran que el código cumple *nuestra*
  especificación; el contraste con el juego depende de las capturas. Ver
  `FASE_2_INFORME.md` §5 y §6.

---

## Estructura

```
boomsolver/
├── AUDIT_FASE_0.md          auditoría verificable del punto de partida
├── FASE_1_INFORME.md        informe de la Fase 1 (motor, solver, generador)
├── FASE_2_INFORME.md        informe de la Fase 2 (validación y rejilla de visión)
├── GAME_RULES_SPEC.md       especificación del motor implementado
├── RULES_OPEN_QUESTIONS.md  Q1–Q12 con impacto y prueba necesaria
├── src/
│   ├── core/{catalog,engine,goals}.js
│   ├── solver/{solver,bruteforce}.js
│   ├── generator/generator.js
│   ├── vision/{detector,evaluation,png}.js
│   ├── validation/{harness,cases.portals,cases.geysers}.js
│   ├── analysis/sessions.js
│   ├── analysis.js  difficulty.js  rng.js
├── corpus/real/             capturas del juego + etiqueta humana (plantilla en README)
├── public/                  UI (index.html, app.js, styles.css)
├── scripts/                 serve.mjs, cli.mjs
└── tests/                   213 pruebas
```
