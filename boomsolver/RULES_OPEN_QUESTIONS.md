# BoomSolver — Reglas abiertas

Cada incertidumbre vive aquí con: **impacto**, **hipótesis actual** (cómo está
implementada hoy), **prueba necesaria** y **cómo cambiarla sin reescribir el
motor**. Ninguna de estas reglas se presenta como confirmada.

Leyenda de estado del catálogo: `confirmed` (usuario o prueba reproducible),
`assumed` (documento técnico o código v21), `unknown` (visto en capturas sin
física conocida).

---

## Q1. Emparejamiento de portales

- **Impacto:** decide a qué casilla llega el rayo. Cambia por completo qué
  objetivos se alcanzan y cuántas bombas hacen falta.
- **Hipótesis implementada:** `rules.portalPairing = 'color-order'`. Los
  portales azules sólo se emparejan con azules y los morados con morados. Si
  hay más de dos del mismo color, se emparejan **por orden de lectura**
  (fila por fila, izquierda a derecha): 1.º con 2.º, 3.º con 4.º. Si el número
  es impar, el último queda inerte y se emite un aviso
  (`unpaired-portal`).
- **Alternativa soportada:** pareja explícita por objeto
  (`{type:'portal', color:'blue', pair:'a'}`), que tiene prioridad sobre el
  color y permite 4 portales azules con emparejamiento no contiguo.
- **Prueba necesaria:** un nivel con **dos pares del mismo color** y una bomba
  que alcance primero el 2.º y el 3.º; observar por dónde sale. Y un nivel con
  tres portales azules.
- **Cómo cambiarla:** es un parámetro del nivel y de las reglas; no hay
  código condicional disperso. `prepareBoard` construye el registro de parejas
  en un único punto.
- **Archivos:** `src/core/catalog.js` (`portal`), `src/core/engine.js`
  (`prepareBoard`, `traceRay`), pruebas en `tests/engine.portals.test.mjs`.

## Q2. Dirección y alcance al salir del portal; muro justo delante

- **Impacto:** si el rayo conserva alcance completo o sólo el sobrante, cambia
  cuántas casillas se alcanzan por la salida.
- **Confirmado por el usuario:** se transporta **toda la explosión**, no sólo
  el alcance restante. Implementado como `rules.portalRangeMode = 'full'`.
- **Hipótesis implementada sobre la dirección:** se conserva la dirección de
  desplazamiento. Entrar avanzando hacia la derecha ⇒ salir avanzando hacia la
  derecha. Es simétrico para las cuatro direcciones (probado).
- **Empate sin confirmar:** si al salir hay un muro (o un objeto sólido) en la
  casilla siguiente, hoy el rayo **muere** en ese punto, igual que en cualquier
  otro tramo bloqueado. Si además el portal de destino está dentro de un muro,
  no se transporta nada y se registra `portal-blocked / target-blocked`.
- **Alternativa soportada:** `portalRangeMode = 'remaining'`, probada y con
  resultado distinto (documentado en `tests/engine.portals.test.mjs`).
- **Prueba necesaria:** captura de un portal con muro pegado a la salida y
  observación de si algún objeto más allá del muro se destruye. Si sí, hay
  "perforación" y hay que añadir `portalPierces = true`.

## Q3. Pareja incompleta, destino ocupado o varios rayos al mismo portal

- **Impacto:** decide si la explosión se pierde, rebota o se duplica.
- **Hipótesis implementada (determinista):**
  - portal **sin pareja** ⇒ el rayo se detiene; se registra
    `portal-blocked` con `reason: 'unpaired'`.
  - destino con bloqueo total (`wall`, `void`) ⇒ se registra
    `target-blocked` y el rayo termina.
  - **varios rayos al mismo portal en el mismo tick** ⇒ cada rayo se resuelve
    por separado y **todos** se transportan; el portal se marca visitado por
    `(casilla, dirección)` para cortar bucles, no para limitar el número de
    rayos.
  - más de dos portales del mismo color ⇒ aviso `ambiguous-portal-group` y
    emparejamiento por orden de lectura (ver Q1).
- **Prueba necesaria:** dos bombas que hacen entrar rayos opuestos en el mismo
  portal en el mismo tick; ver si el juego transporta los dos o sólo uno.
- **Archivos:** `traceRay` (bloque `t === 'portal'`).

## Q4. ¿Todos los géiseres arrancan al pulsar Detonar?

- **Impacto:** si un géiser sólo arranca cuando lo alcanza una onda, un nivel
  con géiseres "aislados" sería imposible; si arrancan todos, el nivel se
  resuelve con temporizadores y el orden de los ticks decide la victoria.
- **Hipótesis implementada (confirmada por el usuario):** **sí, todos**.
  En el tick 0 se encola un evento `geyser` por cada géiser del tablero, con
  `due = timer`, y se registra `geyser-armed` con `cause: 'detonar'`. No hace
  falta colocar una bomba encima ni encenderlo con la mecha.
- **Condición:** sólo se arma si la mecha es válida (si el jugador no ha
  colocado la mecha, el turno es inválido y no se simula nada).
- **Prueba necesaria:** un nivel con un géiser en una esquina que ninguna onda
  pueda alcanzar; ver si explota igual al pulsar Detonar.

## Q5. Unidad del temporizador 1–5

- **Impacto:** cambia **en qué instante** explota cada géiser y, con ello, qué
  cadenas ocurren antes o después. Un mismo nivel puede ser resoluble en
  "tick" e imposible en "segundo".
- **Hipótesis implementada:** la unidad es un **tick de simulación** y se
  declara explícitamente como no confirmada (`rules.tickUnit = 'tick'`). El
  tick 1 es la detonación de la mecha; el tick *n* contiene los eventos cuyo
  vencimiento es *n*.
- **Mecanismo de ajuste sin reescribir el motor:**
  `rules.geyserArmMode = 'tick0' | 'tick1'` desplaza el arranque un tick
  (probado: con arranque en el tick 1 un temporizador 2 vence en el tick 3).
  Para segundos reales bastaría con mapear `due = ceil(timer / tickDuration)`.
- **Prueba necesaria:** captura de "Doble espera" con dos géiseres de
  temporizadores distintos y contar eventos del juego. Si el juego muestra una
  cuenta atrás por etapas, la unidad es una etapa, no un segundo.
- **Archivos:** `src/core/engine.js` (bloque «tick 0: arranque de géiseres»),
  `src/core/catalog.js` (`tickUnit`, `geyser`), `tests/engine.geysers.test.mjs`.

## Q6. Orden cuando géiser y bomba coinciden en el mismo instante

- **Impacto:** decide qué objetos reciben dos impactos y cuáles uno.
- **Hipótesis implementada:** **resolución simultánea dentro del tick**. Todos
  los eventos con el mismo `due` se resuelven contra el estado del inicio del
  tick; el daño se acumula; la destrucción se aplica al final. El orden interno
  (`kindRank`: bomba → enemiga → géiser → dinamita → magma, luego casilla) sólo
  afecta al orden del registro, **no** al resultado.
- **Prueba necesaria:** un cristal de HP 1 (o un objeto de HP 2) alcanzado a la
  vez por un géiser y una bomba en el mismo tick. Si el juego lo destruye con
  un solo impacto "ganador", habrá que introducir prioridad explícita.
- **Cómo cambiarla:** `kindRank` en `engine.js` y la fase de commit. Añadir
  prioridad por tipo no requiere tocar el trazado de rayos.

## Q7. ¿El géiser bloquea una onda, recibe daño o sólo cuenta atrás?

- **Impacto:** decide si el géiser es un obstáculo más o un objeto atravesable.
- **Hipótesis implementada:** `geyser` tiene `blocks: 'wave'` y
  `rules.geyserBlocks = true` (detiene el rayo que lo alcanza). Es
  **indestructible**: no recibe daño y no se consume.
- **Alternativa soportada:** `rules.geyserHitBehavior = 'detonate'` hace que un
  géiser alcanzado por una onda explote en el tick siguiente (en vez de
  ignorarla).
- **Prueba necesaria:** poner un objeto detrás de un géiser y comprobar si la
  explosión lo alcanza.
- **Archivos:** `src/core/catalog.js` (`geyser`), `traceRay`, UI: casilla
  «Un géiser alcanzado explota (Q7)».

## Q8. ¿Un géiser puede activar otro géiser?

- **Impacto:** con temporizadores encadenados, un nivel puede resolverse con
  una sola bomba o necesitar dos.
- **Hipótesis implementada:** **no**, por defecto. La explosión de un géiser
  detona bombas y activa objetos con `onHit.schedule === 'explode'` (dinamita,
  magma, enemigas, detonadores), pero no a otro géiser salvo que se active
  `geyserHitBehavior = 'detonate'`.
- **Prueba necesaria:** dos géiseres a menos de dos casillas con temporizadores
  distintos; ver si el segundo explota antes de su cuenta.
- **Archivos:** bloque de disparadores en `engine.js`.

## Q9. Objetos con candado y figura naranja del editor

- **Impacto:** son objetos del juego que hoy **no existen** en el catálogo. Si
  un nivel los usa, el motor los trata como muro (bloqueo total) y avisa
  (`unknown-cell`). Cualquier solución que los ignore puede ser falsa.
- **Hipótesis actual:** **ninguna**. No hay `typeId` en el código del v21, no
  aparecen en `BUILTIN_TILES` y el documento técnico no los describe. Están
  registrados como `UNRESOLVED_VISUALS` en `src/core/catalog.js` para que nadie
  les asigne comportamiento por intuición.
- **Prueba necesaria:** una captura ampliada del editor con el icono
  seleccionado (el v21 muestra el nombre del pincel en `currentBrushLabel`), o
  una partida donde el objeto interactúe con una explosión.
- **Bloqueo:** sin esa prueba no se implementan, y el detector los marca como
  `unknown` en lugar de clasificarlos como un objeto parecido.

## Q10. Bombas enemigas: qué representa cada nivel y qué patrón usa

- **Impacto:** determina el daño total disponible y si el objetivo «detonar
  todas las enemigas» es alcanzable.
- **Hipótesis implementada:** espejo de las N1..N4 del jugador:
  `enemy_1` = cruz +1, `enemy_2` = +2, `enemy_3` = **3×3**, `enemy_4` = +4.
  La enemiga 3 como 3×3 es una lectura del v21 (`lvl === 3 ? 'explode_3x3'`),
  no una observación del juego.
- **Prueba necesaria:** captura de una enemiga detonando, contando casillas
  alcanzadas.
- **Cómo cambiarla:** `onHit.pattern` de cada `enemy_*` en el catálogo.

## Q11. ¿Qué significa "a la vez" en los interruptores?

- **Impacto:** si «a la vez» significa el mismo tick, es alcanzable con una
  sola onda; si significa la misma detonación (misma jugada) o la misma ola con
  varias bombas, cambia el mínimo de bombas.
- **Hipótesis implementada:** **mismo tick**. `evaluateOutcome` comprueba que
  todos los interruptores requeridos se activaron en el mismo `activatedTick`.
- **Alternativa futura:** `simultaneous: 'same-turn'` (todos en la jugada) es
  un cambio de una línea en `goals.js`.
- **Prueba necesaria:** nivel "Activa los interruptores a la vez 0/4" con dos
  interruptores que sólo puedan activarse con dos bombas distintas; ver si el
  juego lo acepta.

## Q12. ¿El cristal siempre causa derrota?

- **Impacto:** define si el peligro es «derrota inmediata» o «condición
  negativa del nivel». En el segundo caso, un cristal roto puede no invalidar
  una jugada si el nivel no lo menciona.
- **Hipótesis implementada:** el cristal es `hazard` **y** derrota
  (`rules.hazardDefeat = true`), además de poder declararse como condición
  negativa explícita del nivel. Con `hazardDefeat = false`, el cristal sólo
  cuenta como condición negativa si la directriz lo menciona.
- **Prueba necesaria:** un nivel con cristal y **sin** «sin romper cristales»
  en la directriz; comprobar si romperlo hace perder.
- **Archivos:** `src/core/catalog.js` (`crystal`), `engine.js`
  (`hazardDefeat`), `goals.js` (`noDestroy`).

---

## Otras suposiciones menores (registradas, no confirmadas)

| Suposición | Dónde | Cómo probarla |
|---|---|---|
| El cofre de madera detiene el rayo que lo abre | `chest_wood.blocks = 'wave'` | Objeto detrás de un cofre; ver si cae |
| El interruptor no detiene el rayo | `switch.blocks = 'none'` | Objeto detrás de un interruptor |
| La gema no detiene el rayo | `gem.blocks = 'none'` | Gema con otro objetivo detrás |
| La dinamita explota en el tick siguiente (+1) | `onHit.delayTicks = 1` | Contar animación del juego |
| El detonador se consume al detonar sus cargas | `disappears` | El v21 lo dejaba vivo; hoy se consume |
| Las bombas colocadas no bloquean el rayo | `rules.bombBlocks = false` | Nivel con dos bombas alineadas |
| Un mismo origen no daña dos veces la misma casilla en el tick | `hitPerSourcePerTick` | Objeto de HP 2 con una sola bomba |
| Los espejos son indestructibles | `mirror_*.hp = null` | Disparar a un espejo |
| Los espejos no redirigen rayos diagonales | `mirrorTurn` devuelve `null` | Sólo aplica a patrones 3×3 |
| La roca de magma detiene la onda que la activa | `rules.magmaBlocks = true` | Objeto detrás del magma |

---

## Protocolo de discrepancia

Cuando el motor prediga algo distinto del juego real:

1. Guardar la captura.
2. Guardar el tablero corregido en JSON (`version: 2`).
3. Anotar resultado esperado y resultado observado.
4. Añadir un caso de prueba que hoy falle (`node --test`) y enlazarlo a la
   pregunta abierta correspondiente.
5. Cambiar el parámetro de regla indicado en la pregunta, no el motor.
