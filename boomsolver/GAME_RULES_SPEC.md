# BoomSolver — Especificación del motor de reglas

Versión del motor: **2.0.0** · Estado: implementado y con pruebas.

Este documento describe **lo que el código hace**, no lo que debería hacer.
Cuando algo no está confirmado se marca así y se remite a
`RULES_OPEN_QUESTIONS.md`.

---

## 1. Modelo de estado

Un nivel es un tablero `cols × rows`. Cada casilla contiene **un** objeto,
representado de dos formas:

```js
'empty'                                   // forma simple: sólo el tipo
{ type: 'geyser', timer: 3 }              // forma con parámetros
{ type: 'portal', color: 'purple', pair: 'a' }
```

`prepareBoard(level)` lo convierte en un estado inmutable y reutilizable:

| Campo | Tipo | Significado |
|---|---|---|
| `cols`, `rows`, `n` | int | dimensiones y número de casillas |
| `types[i]` | string | `typeId` del catálogo |
| `params[i]` | object \| null | parámetros propios (temporizador, color, pareja) |
| `hp0[i]` | int | HP inicial; `-1` si no es dañable |
| `placeable[i]` | 0/1 | si admite una bomba del jugador |
| `links` | Map<int, int[]> | cables: detonador → cargas |
| `registry` | Map<int,int> | pareja de cada portal |
| `portalInfo` | Map<int,{color,pair}> | identidad visual del portal |
| `warnings[]` | array | portales impares, grupos ambiguos, tipos desconocidos |
| `rules` | object | reglas de física de este nivel |

El estado **mutable** de una simulación se clona desde `hp0`:

```js
{ hp: Int32Array, alive: Uint8Array, activated: Uint8Array, activatedTick: Int32Array }
```

`activated`/`activatedTick` son necesarios para el objetivo «a la vez».

---

## 2. Catálogo de objetos

Fuente única: `src/core/catalog.js`. Cada entrada declara, como mínimo:

| Campo | Significado |
|---|---|
| `name` | nombre visible |
| `role` | `passable \| obstacle \| hazard \| trigger \| target \| redirect \| transport` |
| `hp` | golpes necesarios; `null` = indestructible |
| `blocks` | `none` (el rayo sigue), `wave` (detiene pero recibe daño), `always` (detiene, indestructible) |
| `disappears` | si desaparece al llegar a 0 HP |
| `placeable` | si admite bombas del jugador |
| `onHit` | `{schedule, pattern, delayTicks}` para disparadores |
| `redirect` | `'slash' \| 'backslash'` para espejos |
| `params` | parámetros propios con su valor por defecto |
| `status` | `confirmed \| assumed \| unknown` |
| `evidence` | por qué se cree eso |

Objetos: 22 tipos (21 del v21 + `portal` + `geyser`, reemplazando el duplicado
`void`). Lista completa en `AUDIT_FASE_0.md` §3 y con `node scripts/cli.mjs catalog`.

**Ampliabilidad:** añadir un objeto es añadir una entrada al catálogo, su
patrón (si explota) y, si hace falta, un campo nuevo en `onHit`. No hay cadenas
de `if` por identificador: `getTileBehavior` (v21) se sustituyó por el
catálogo, y sólo permanecen los casos genuinamente especiales (portal, espejo,
detonador, géiser) que cambian el flujo del rayo o del tiempo.

---

## 3. Bombas e inventario

| Nivel | Alcance (cruz) | Pólvora equivalente |
|---|---|---|
| N1 | 1 | 1 |
| N2 | 2 | 2 |
| N3 | 3 | 4 |
| N4 | 4 | 8 |

**Fusiones** (`canFuse`):

- `equal`: sólo `Nk + Nk → N(k+1)` con `k < 4`.
- `sum`: además `N1 + N2 → N3`, `N1 + N3 → N4`. Tope N4. No existe `N1 + N1` en
  `sum` con resultado distinto de N2 (sigue siendo 2).

**Dos métricas que nunca se mezclan:**

- `physicalBombsPlaced` — bombas físicas sobre el tablero tras fusionar.
- `powderEquivalent` — suma de 1/2/4/8.

Ejemplo real del proyecto (`tests/solver.test.mjs`): en un tablero de 9×2 con
un cofre en cada extremo y bandeja `[N4, N2, N2, N2]`, el mínimo físico es
**1 bomba / 8 de pólvora** y el mínimo de pólvora es **2 bombas / 6 de pólvora**.
El buscador informa de los dos y la frontera de Pareto contiene ambos puntos.

---

## 4. Directrices y objetivos

Un nivel puede tener **varios objetivos positivos y varias condiciones
negativas**. Es un array, no un desplegable.

```js
[
  { kind: 'destroy',  types: ['chest_wood', 'chest_iron'], count: 2 },
  { kind: 'destroy',  types: ['gem'], count: 2 },
  { kind: 'activate', types: ['switch'], count: 4, simultaneous: true },
  { kind: 'noDestroy', types: ['crystal'], negative: true },
  { kind: 'enemyBombs' }
]
```

- `destroy` — se cumple cuando todos los objetos de esos tipos han llegado a 0 HP.
- `activate` — se cumple por activación (`switch`), con `simultaneous` exige el
  mismo `activatedTick`.
- `noDestroy` — falla si **alguna onda alcanzó** un objeto de esos tipos
  (no sólo si se destruyó: los peligros son indestructibles).
- `noActivate`, `avoidHazard` — condiciones negativas análogas.
- `enemyBombs` — exige que todas las `enemy_*` hayan detonado.

`parseDirective(texto)` interpreta directrices en español:

```
"Abre los cofres 0/2 · Recoge las gemas 0/2 · sin romper cristales"
  → destroy chest_wood/chest_iron ×2
  → destroy gem ×2
  → noDestroy crystal
"Activa los interruptores a la vez 0/4 · sin romper cristales"
  → activate switch ×4 simultaneous
  → noDestroy crystal
```

Lo que no reconoce **no se inventa**: se devuelve en `unparsed` y se pide
confirmación.

---

## 5. Modelo temporal

El turno se resuelve en **ticks**. Un tick equivale a una «ola» del v21.

| Tick | Contenido |
|---|---|
| 0 | Arranque de géiseres (`geyser-armed`) |
| 1 | Detonación de la mecha |
| *n* | Eventos cuyo `due === n` |

**Resolución simultánea dentro del tick.** Los rayos se calculan contra el
estado al **inicio** del tick; el daño se acumula en un `Map<casilla, impactos>`;
la destrucción se aplica **al final**. Consecuencia: un objeto destruido en el
tick *n* sigue bloqueando durante ese tick (regla de ola de la referencia), y el
resultado **no depende del orden de iteración**.

Orden interno sólo para el registro: `bomba → enemiga → géiser → dinamita →
magma`, luego por casilla.

`rules.maxTicks` (por defecto 64) evita bucles. Si quedan eventos pendientes al
llegar al tope, el turno se declara `invalid / unresolved`.

---

## 6. Trazado de rayos

`traceRay(world, {start, dir, range, fullRange, excludeStart})` devuelve:

```js
{ cells: [idx...], jumps: [{from,to,dir,range,jumpIndex,color}], loopCut, blockedByPortal, dir }
```

Recorrido:

1. Avanza una casilla por paso de alcance.
2. **Portal**: se transporta al compañero conservando dirección y, con
   `portalRangeMode = 'full'`, el alcance completo del tramo. El tramo termina
   y se abre uno nuevo desde el compañero. Registro: `portal-jump`.
3. **Espejo**: `slash` gira `right→up / up→right / left→down / down→left`;
   `backslash` gira `right→down / down→right / left→up / up→left`. Consume el
   paso. Los rayos diagonales no se redirigen (se detienen).
4. **Bloqueo** `always` ⇒ fin del rayo. `wave` ⇒ se registra la casilla, se
   aplica el daño y el rayo termina.
5. Fuera del tablero ⇒ fin.

La casilla del espejo y la del portal cuentan como alcanzadas; la casilla del
muro bloqueante también (es la que detuvo el rayo), pero las de detrás no.

**Anti-bucle de portales:** se prohíbe repetir el par `(portal, dirección)` en
el mismo rayo (`portalMaxJumps = 8` como tope global). Al cortar se registra
`portal-loop-cut`. Probado: dos portales enfrentados producen un salto, un
corte determinista y un log idéntico entre dos ejecuciones.

---

## 7. Efectos y cadenas

| Objeto alcanzado | Efecto |
|---|---|
`dynamite` | programa explosión de patrón `rules.dynamitePattern` en el tick +1 |
`magma_rock` | programa cruz de alcance `rules.magmaRange` |
`enemy_N` | programa su patrón (N3 = 3×3) |
`detonator` | dispara sus cables: cada carga programada en +1, y el detonador se consume |
`geyser` | si `geyserHitBehavior = 'detonate'`, programa su explosión |
bomba colocada | programa la explosión de esa bomba en +1 (`bomb-ignited`) |
`switch` | se marca activado en este tick |
`crystal`, `cat` | peligro: derrota (si `hazardDefeat`) |
cualquier cosa con `hp > 0` | +1 impacto |

Un disparador que explota **se consume con su propia explosión** (se aplica el
daño a sí mismo), de modo que no puede volver a detonar.

**Bombas desconectadas:** al final, si alguna bomba colocada no ha explotado, el
resultado es `invalid / disconnected`. Nunca cuenta como victoria.

---

## 8. Resultado de una simulación

```js
{
  engineVersion, status, reason,
  log: [evento...],                  // plano, reproducible
  ticks: [{tick, events, explosions, destroyed}],
  final: {alive, hp, activated, activatedTick},
  placements: [{idx, level, cell}],
  metrics: {
    placedCount, powder, tickCount, chainDepth, hazardsHit, hazard,
    pendingBombs, portalJumps, destroyed, activated, uniquePlacements
  },
  waves: [...]                        // compatibilidad con el visor v21
}
```

`status`: `resolved` (turno lícito), `lose` (peligro), `invalid`
(`no_mecha`, `disconnected`, `unresolved`).

Tipos de evento del log: `geyser-armed`, `explosion`, `damage`,
`damage(destroyed)`, `activated`, `bomb-ignited`, `scheduled-explosion`,
`detonator-fired`, `hazard-hit`, `portal-jump`, `portal-loop-cut`,
`portal-blocked`, `bomb-not-detonated`.

Cada `portal-jump` incluye **punto de entrada, punto de salida, dirección y
alcance transportado**, como pedía el requisito.

---

## 9. Contrato buscador ↔ simulador

El buscador **no** tiene física propia:

```js
const res = simulate(board, placements, mecha, rules);      // motor único
const verdict = evaluateOutcome(board, res, objectives);     // reglas de victoria
if (verdict.win) → solución
```

Además, `verifySolution(level, objectives, solution)` rehace la simulación
desde cero. El generador la llama antes de aceptar un nivel, y hay una prueba
(`tests/solver.test.mjs`) que verifica **todas** las soluciones devueltas.

---

## 10. Reglas configurables

| Regla | Valores | Por defecto | Estado |
|---|---|---|---|
`fusionMode` | `equal` \| `sum` | `equal` | spec §3.1 |
`dynamitePattern` | `cross1` `x3x3` `cross2` `row` `col` | `cross1` | supuesto |
`magmaRange` | 1..4 | 1 | supuesto |
`magmaBlocks` | bool | `true` | supuesto |
`objectsBlock` | bool | `true` | confirmado (muro sí) |
`bombBlocks` | bool | `false` | supuesto |
`requireEnemyBombs` | bool | `false` | supuesto |
`hazardDefeat` | bool | `true` | supuesto (Q12) |
`geyserHitBehavior` | `ignore` \| `detonate` | `ignore` | Q7 |
`geyserBlocks` | bool | `true` | Q7 |
`portalPairing` | `color-order` \| `explicit` | `color-order` | Q1 |
`portalRangeMode` | `full` \| `remaining` | `full` | confirmado por el usuario |
`portalMaxJumps` | int | 8 | diseño |
`hitPerSourcePerTick` | bool | `true` | supuesto |
`tickUnit` | `tick` | `tick` | Q5 |
`maxTicks` | int | 64 | diseño |
`geyserArmMode` | `tick0` \| `tick1` | `tick0` | Q5 |

---

## 11. Versionado de datos

Formato actual `version: 2`:

```json
{
  "format": "boomsolver-level",
  "version": 2,
  "name": "…", "theme": "mine",
  "cols": 7, "rows": 5,
  "cells": [["empty", "chest_wood", {"type":"geyser","timer":2}], …],
  "links": {"0,0": ["6,4"]},
  "tray": [1, 1, 2],
  "rules": {},
  "objectives": [{ "kind": "destroy", "types": ["chest_wood"], "count": 1 }],
  "seed": 42
}
```

Compatibilidad: se acepta `version: 1` del v21, donde el tablero se llamaba
`grid` y sólo había cadenas de `typeId`. `validateLevel`/`restoreLevel` del v21
siguen siendo la referencia de las comprobaciones (dimensiones ≤ 20, tipos
conocidos, cables con coordenadas válidas).
