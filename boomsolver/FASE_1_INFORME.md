# BoomSolver — Informe de fase

Rama `arena/9fd9886d-aa` · fecha 2026-11-12 · motor 2.0.0

---

## 1. Archivos creados y por qué

No se modificó nada del repositorio original (no había código de BoomSolver en
él, ver hallazgo 0 de `AUDIT_FASE_0.md`). Todo el trabajo está en `boomsolver/`.

| Archivo | Por qué existe |
|---|---|
| `AUDIT_FASE_0.md` | Auditoría verificable del punto de partida: estructura real del HTML v21, comparación con la referencia, inventario real de objetos, 7 defectos concretos y plan priorizado. |
| `GAME_RULES_SPEC.md` | Especificación del motor tal como está implementado (modelo de estado, ticks, rayos, efectos, contrato buscador↔simulador, reglas configurables, versionado JSON). |
| `RULES_OPEN_QUESTIONS.md` | Q1–Q12 con impacto físico, hipótesis implementada, alternativa soportada, prueba necesaria y archivo donde se cambia. |
| `src/core/catalog.js` | Catálogo único: 22 objetos con rol/HP/bloqueo/efecto/parámetros y **estado de confirmación** con su evidencia. Elimina las listas paralelas del v21. |
| `src/core/engine.js` | Motor determinista por ticks con cola de eventos. Única implementación de explosión del sistema. |
| `src/core/goals.js` | Objetivos compuestos, condiciones negativas, evaluación explicable e intérprete de directrices. |
| `src/solver/solver.js` | Búsqueda exhaustiva con tres modos, dos métricas y estado de optimalidad honesto. |
| `src/generator/generator.js` | Generación por restricciones validada por el propio motor. |
| `src/difficulty.js` | Puntuación de dificultad por factores con peso, separando algoritmo y jugador. |
| `src/analysis.js` | Necesidad/redundancia de bombas, contrafactuales, mapa de calor, imposibilidad y pistas. |
| `src/vision/detector.js` | Canalización de reconocimiento con confianza, alternativas y revisión. |
| `src/rng.js` | PRNG determinista compartido (misma semilla ⇒ mismo nivel). |
| `public/*` | UI: editor, solver, simulación tick a tick y generador, importando el mismo motor. |
| `scripts/serve.mjs`, `scripts/cli.mjs` | Servidor sin dependencias y CLI completo. |
| `tests/*.test.mjs` (7 archivos) | 103 pruebas de regresión. |

---

## 2. Funciones implementadas

**Motor**
- Simulación por ticks con resolución simultánea: los rayos se calculan contra
  el estado al inicio del tick y la destrucción se aplica al final, así que el
  resultado no depende del orden de iteración y un objeto destruido sigue
  bloqueando durante ese tick.
- Trazado de rayo con espejos, portales, bloqueos y casillas de impacto.
- **Portales**: transporte conservando dirección y alcance completo
  (`portalRangeMode`), emparejamiento por color en orden de lectura o pareja
  explícita, corte anti-bucle por `(portal, dirección)`, y eventos
  `portal-jump` / `portal-loop-cut` / `portal-blocked` con entrada, salida,
  dirección y alcance.
- **Géiseres**: se arman solos en el tick 0 al pulsar Detonar (sin mecha),
  temporizador 1–5, explosión en cruz de alcance 2 al vencer, y detonación de
  bombas y disparadores alcanzados.
- Cadenas: dinamita (5 patrones), magma (alcance 1–4), enemigas, cables de
  detonador, bombas colocadas que se encienden entre sí.
- Condición de derrota por peligro y detección de bombas desconectadas.

**Reglas y objetivos**
- Varios objetivos positivos (`destroy`, `activate`, `enemyBombs`) y varias
  condiciones negativas (`noDestroy`, `noActivate`, `avoidHazard`) en el mismo
  nivel.
- «A la vez» implementado como mismo `activatedTick`.
- `parseDirective` interpreta las directrices compuestas de las capturas y
  devuelve como `unparsed` lo que no entiende, sin inventar.

**Buscador**
- `fewest_bombs`, `least_powder` y `pareto`, informando **siempre** de ambas
  métricas.
- Enumeración completa: estados de fusión → submultisets de tamaño k →
  combinaciones de casillas → asignación de niveles → cada bomba como mecha.
- Toda hoja se valida con el motor y con `evaluateOutcome`.
- `optimalityProven` sólo si la enumeración terminó; en otro caso `bestKnown` /
  `timedOut` / `cancelled` con `provenUpToBombs` y `proofNote` redactado.
- Pre-chequeos de imposibilidad con causa: objetivos ausentes, inalcanzables,
  sin casillas colocables, bandeja vacía, enemigas inalcanzables.
- Deduplicación por firma de jugada y agrupación por firma de resultado.

**Generador**
- Restricciones completas (tamaño, objetivos, peligros, obstáculos, portales,
  géiseres con rango de temporizadores, espejos, magma, dinamita, detonadores,
  bandeja, dificultad, número de soluciones, mecánicas obligatorias/prohibidas,
  semilla).
- Flujo obligatorio: candidato → estructura legal → simulador → buscador
  completo → filtros → dificultad → deduplicación → verificación → export.
- **Nunca** marca un nivel resoluble sin demostrarlo: si el buscador no llega a
  `optimalityProven`, el candidato se rechaza.
- Si no encuentra nada, devuelve los motivos agrupados y sugerencias.

**Reconocimiento**
- Etapas separadas: región → rejilla por divisores exactos → normalización →
  clasificación multi-señal (tono, saturación, brillo, textura, firma diagonal,
  presencia de oro/cian/rosa/azul) → temporizador con OCR acotado → bandeja
  aparte → emparejamiento de portales.
- Cada casilla devuelve clase, confianza, alternativas, evidencia y estado
  `confirmed` / `needs_review` / `unknown`.
- Un color que no encaja en ningún perfil queda en revisión; nunca se fuerza.
- `hypotheses()` para el modo avanzado de varias lecturas.

**Análisis**
- `necessaryBombs`, `redundantBombs`, `counterfactual`, `heatmapFor`,
  `explainImpossible`, `hint`.

---

## 3. Pruebas ejecutadas y resultados reales

> **Nota de Fase 2:** esta cifra es la del cierre de la Fase 1. Al final de la
> Fase 2 la suite tiene 204 pruebas y el detalle está en `FASE_2_INFORME.md`.
> `FASE_2_INFORME.md` §2 reproduce el reparto completo por archivo.

```
$ node --test "tests/*.test.mjs"      # cierre de Fase 1
# tests 103
# pass 103
# fail 0
# duration_ms 3759
```

| Archivo | Qué cubre |
|---|---|
| `engine.bombs.test.mjs` (15) | Alcance de N1–N4, muro, HP 2 entre olas, bloqueo durante el tick de destrucción, bombas desconectadas, cadena, mecha inválida, peligros, condición negativa, determinismo. |
| `engine.portals.test.mjs` (11) | Transporte en horizontal y vertical, conservación de dirección, alcance completo frente a sobrante, emparejamiento por color, pareja explícita, portal impar, corte de bucle determinista, destino bloqueado, dos rayos en un mismo portal. |
| `engine.geysers.test.mjs` (9) | Arranque automático sin mecha, temporizadores 1–5 en el tick correcto, límite 1..5, cruz de 9 casillas, detonación de bombas cercanas, dos géiseres independientes, coincidencia de géiser y bomba en el mismo tick, indestructibilidad, arranque desplazable. |
| `engine.mechanics.test.mjs` (20) | Convención de espejos en 8 casos, espejos en ambos sentidos, detonadores con y sin cable, cadena detonador→dinamita→objeto, HP 2 en dos olas, 4 patrones de dinamita, magma con alcance 1–3, interruptores simultáneos y no simultáneos, objetivos compuestos, enemigas, tipos desconocidos como aviso. |
| `solver.test.mjs` (20) | Fusiones (`equal`/`sum`), cargamentos, mínimo trivial, **contraste con fuerza bruta independiente**, varias soluciones mínimas, corte de presentación informado, timeout y cancelación sin afirmar optimalidad, caja sellada, bombas desconectadas, bandeja vacía, tipo ausente, contrato buscador↔simulador, peligro evitable, portales, géiseres, y el caso estrella `1 bomba/8 pólvora` frente a `2 bombas/6 pólvora` con Pareto `{(1,8),(2,6)}`. |
| `vision.test.mjs` (11) | Región con marco, rejilla exacta en 4 tamaños, clasificación sintética, no forzar ante color neutro, evidencia/alternativas, temporizador 1..5 y fuera de rango, bandeja separada, portales impares, detección completa, hipótesis, imagen sin tablero. |
| `generator.test.mjs` (13) | Misma semilla ⇒ mismo nivel, semillas distintas ⇒ niveles distintos, solvencia demostrada, JSON versionado sin secretos, límites de bombas, restricciones imposibles informadas, tablero sin objetivos rechazado, normalización de parámetros, dificultad explicable, análisis, imposibilidad, pistas, objetivos derivados. |

Además se comprobó manualmente (extremo a extremo, `node /tmp/smoke.mjs`):

```
directriz → 2 positivos/1 negativo, sin cláusulas sin interpretar
solve     → optimalityProven, 1 solución, C5F2=N3, 4 de pólvora
sim coincide → true true true      (bombas, pólvora y ticks idénticos)
veredicto → true
generate  → ok, 1 bomba, 1 pólvora, 18 soluciones mínimas
```

---

## 4. Qué sigue pendiente

1. **Web Worker en la UI** (hoy: 15 s de presupuesto + cancelación en el hilo).
2. **OCR real** conectado a `readTimer` (la firma ya está inyectada).
3. **Fixtures del PDF de capturas** — el PDF no está en el repositorio; las
   pruebas de visión usan tableros sintéticos.
4. **Calibración por tema visual** — depende de 3.
5. ~~**UI de comparación de soluciones, hints y contrafactuales**~~ — **hecho en
   Fase 2**: pestañas de análisis (ondas, portales, géiseres, cadena, daño),
   banner de optimalidad y comparador A/B. Ver `FASE_2_INFORME.md` §1.
6. **Objetos con candado y figura naranja** — bloqueados por Q9.

---

## 5. Supuestos todavía no confirmados

Todos en `RULES_OPEN_QUESTIONS.md`. Los que más pueden mover un resultado:

- Q1 emparejamiento cuando hay cuatro portales del mismo color;
- Q5 unidad del temporizador del géiser (hoy *tick*);
- Q6 orden cuando géiser y bomba coinciden (hoy simultáneo);
- Q7 si el géiser bloquea la onda (hoy sí);
- Q11 significado de «a la vez» (hoy mismo tick);
- Q12 si el cristal siempre derrota (hoy sí).

Ninguno está cableado de forma irreversible: cada uno es un parámetro de
`rules` o del catálogo.

---

## 6. Impacto en niveles antiguos

- El **formato v1** se sigue aceptando (`grid` → `cells`, `typeId` sin cambios).
- Los `typeId` del v21 se conservan literales, así que los JSON exportados y los
  11 presets siguen siendo legibles.
- Cambios que **pueden** alterar el resultado de un nivel antiguo, y por qué:
  1. el detonador ahora se consume al detonar (antes quedaba vivo);
  2. un objeto destruido ya no deja de bloquear dentro del mismo tick;
  3. los peligros ya no devuelven un estado a medias;
  4. el buscador puede devolver más soluciones (antes cortaba en 4);
  5. la métrica de «mínimo» ahora es física, no de pólvora: un nivel donde
     antes se mostraba «4 bombas» puede mostrar «1 bomba / 8 de pólvora».
- Nada de esto elimina funciones: el simulador manual, los presets, la paleta,
  el historial local y la importación/exportación siguen existiendo.

---

## 7. Cómo reproducir las pruebas clave

```bash
cd boomsolver

# 1. Todo
node --test "tests/*.test.mjs"

# 2. Portales: transporte, dirección y corte de bucle
node --test tests/engine.portals.test.mjs

# 3. Géiseres: arranque automático y temporizadores 1..5
node --test tests/engine.geysers.test.mjs

# 4. Las dos métricas y la frontera de Pareto
node --test tests/solver.test.mjs

# 5. Un caso concreto, a mano: cofres en los extremos
cat > /tmp/pareto.json <<'JSON'
{ "cols": 9, "rows": 2, "tray": [4,2,2,2],
  "cells": [["empty","empty","empty","empty","empty","empty","empty","empty","empty"],
            ["chest_wood","empty","empty","empty","empty","empty","empty","empty","chest_wood"]],
  "objectives": [{ "kind": "destroy", "types": ["chest_wood"], "count": 2 }] }
JSON
node scripts/cli.mjs solve /tmp/pareto.json --mode=pareto
#   → Pareto: (1 bomba, 8 de pólvora) y (2 bombas, 6 de pólvora)
node scripts/cli.mjs solve /tmp/pareto.json --mode=fewest_bombs
#   → mínimo físico: 1 bomba
node scripts/cli.mjs solve /tmp/pareto.json --mode=least_powder
#   → mínimo de pólvora: 6

# 6. Generar un nivel y comprobar que está verificado
node scripts/cli.mjs generate --width=6 --height=4 --gems=2 --seed=5 --out=/tmp/nivel.json

# 7. Simular una jugada evento por evento
node scripts/cli.mjs simulate /tmp/nivel.json --bombs=2,2:1 --mecha=2,2

# 8. La interfaz (mismo motor que las pruebas)
node scripts/serve.mjs   # http://localhost:5173
```
