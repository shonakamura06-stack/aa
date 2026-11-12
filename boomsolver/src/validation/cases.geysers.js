// ============================================================
// Validación de GÉISERES — las 10 preguntas abiertas (Q5/Q6/Q7)
// ============================================================
// Recordatorio importante: aquí el reloj es el TICK DEL SIMULADOR.
// NO se afirma que el tick equivalga a segundos ni a fotogramas del juego.
// Todo caso que dependa de la unidad real del temporizador queda como
// 'unknown' u observacional, nunca como verificado.

import { MECHANIC_STATE as S, grid, at } from './harness.js';

const UNIT_EVIDENCE = 'Necesita: captura de vídeo de un nivel con géiseres donde se '
  + 'cuente el tiempo real (segundos o fotogramas) entre «Detonar» y la primera onda '
  + 'del géiser, y entre esa onda y la siguiente si la hay.';

// Tablero base: 9x3 con el géiser en el centro (C5F2) y un cofre a su alcance (2).
const g = (extra = {}) => ({ ...grid(['.........', '....Z....', '.........']), ...extra });

export const geyserCases = [
  // ---------------------------------------------------------------- G01
  {
    id: 'G01', question: '¿Cuál es la unidad real del temporizador del géiser?',
    state: S.UNKNOWN, evidence: UNIT_EVIDENCE,
    explanation: 'No hay caso ejecutable: el motor cuenta ticks y el juego puede contar '
      + 'segundos o fotogramas. Se registra la pregunta, no una respuesta.',
    observe: true,
    board: { ...grid(['.........', '....Y....', '.........']), rules: { tickUnit: 'tick' } },
    placements: [[at(4, 0, 9), 1]], mecha: at(4, 0, 9),
  },

  // ---------------------------------------------------------------- G02
  {
    id: 'G02', question: 'Un géiser de temporizador 3 estalla en el tick 3',
    state: S.HYPOTHESIS, evidence: UNIT_EVIDENCE,
    explanation: 'El géiser arranca en el tick 0 y su onda ocurre cuando vence el '
      + 'temporizador: tick 3 con timer 3 en modo tick0.',
    board: g(),
    placements: [[at(0, 0, 9), 1]], mecha: at(0, 0, 9),
    expect: { status: 'resolved', geyserArm: [{ cell: '4,1', timer: 3, dueTick: 3 }] },
  },
  {
    id: 'G03', question: '¿Avanzan los temporizadores aunque no estalle nada más?',
    state: S.HYPOTHESIS, evidence: UNIT_EVIDENCE,
    explanation: 'Con la única bomba lejos del géiser, entre el tick 1 y el 3 no hay '
      + 'ninguna explosión; el motor debe seguir contando y el géiser vencer en el 3. '
      + 'Si se detuviera al no haber eventos, el géiser nunca estallaría.',
    board: g(),
    placements: [[at(8, 2, 9), 1]], mecha: at(8, 2, 9),
    expect: { status: 'resolved', idleTicks: [2], geyserArm: [{ cell: '4,1', dueTick: 3 }] },
  },

  // ---------------------------------------------------------------- G04
  {
    id: 'G04', question: 'Dos temporizadores independientes: mecha y géiser',
    state: S.HYPOTHESIS, evidence: UNIT_EVIDENCE,
    explanation: 'La mecha vence siempre en el tick 1 y el géiser en el suyo: son dos '
      + 'cuentas separadas. Con dos géiseres de temporizador 1 y 3 se ve que cada uno '
      + 'lleva su propia cuenta y que el de timer 1 estalla en el tick 1 junto a la bomba.',
    board: { ...grid(['.........', '..Z...Y..', '.........']) },
    placements: [[at(0, 0, 9), 1]], mecha: at(0, 0, 9),
    expect: {
      status: 'resolved',
      explosionsAtTick: { 1: ['bomb', 'geyser'], 3: ['geyser'] },
      geyserArm: [{ cell: '2,1', timer: 3, dueTick: 3 }, { cell: '6,1', timer: 1, dueTick: 1 }],
    },
  },

  // ---------------------------------------------------------------- G05
  {
    id: 'G05', question: 'Bomba que alcanza un géiser que YA está contando',
    state: S.HYPOTHESIS, evidence: UNIT_EVIDENCE,
    explanation: 'Con la regla por defecto (geyserHitBehavior:"ignore") el géiser no se '
      + 'adelanta: sigue contando y estalla en su tick 3, no en el 2. Se comprueba '
      + 'exactamente eso, y no se escribe como si fuese lo confirmado por el juego.',
    board: { ...grid(['.........', '....Z....', '.........']), tray: [1] },
    placements: [[at(4, 0, 9), 1]], mecha: at(4, 0, 9),
    expect: {
      status: 'resolved',
      explosionsAtTick: { 3: ['geyser'] },
      logLacks: [{ type: 'scheduled-explosion', cell: '4,1' }],
    },
  },
  {
    id: 'G05b', question: 'Variante soportada: la onda adelanta el géiser',
    state: S.UNKNOWN, evidence: UNIT_EVIDENCE + ' Además: si el adelanto es de 1 tick o '
      + 'inmediato, y si el temporizador se reinicia o se conserva.',
    explanation: 'El motor permite geyserHitBehavior:"detonate"; se registra el '
      + 'comportamiento para poder compararlo con el juego, sin declararlo correcto.',
    board: { ...grid(['.........', '....Z....', '.........']), tray: [1], rules: { geyserHitBehavior: 'detonate' } },
    placements: [[at(4, 0, 9), 1]], mecha: at(4, 0, 9),
    expect: { status: 'resolved', explosionsAtTick: { 2: ['geyser'] } },
  },

  // ---------------------------------------------------------------- G06
  {
    id: 'G06', question: '¿Un géiser puede activar otro géiser?',
    state: S.UNKNOWN, evidence: 'Necesita: nivel con dos géiseres cercanos; se ve si al '
      + 'estallar el primero el segundo se adelanta, se reinicia o no le pasa nada.',
    explanation: 'Por defecto el géiser no reacciona a las ondas (geyserHitBehavior:'
      + '"ignore"), así que el segundo géiser debe vencer en SU tick, no encadenarse. '
      + 'Ésa es la hipótesis del motor, no un hecho del juego.',
    board: { ...grid(['.........', '..Z...Z..', '.........']) },
    placements: [[at(0, 0, 9), 1]], mecha: at(0, 0, 9),
    expect: {
      status: 'resolved',
      geyserArm: [{ cell: '2,1', dueTick: 3 }, { cell: '6,1', dueTick: 3 }],
      explosionsAtTick: { 3: ['geyser', 'geyser'] },
    },
  },

  // ---------------------------------------------------------------- G07
  {
    id: 'G07', question: '¿La onda del géiser atraviesa obstáculos o la detienen?',
    state: S.UNKNOWN, evidence: 'Necesita: captura de un géiser con un muro a un lado y '
      + 'un objeto destruible detrás del muro; se ve si ese objeto se destruye.',
    explanation: 'La onda del géiser alcanza su propia casilla, el muro de C7F2 y el brazo '
      + 'libre de C5F2, pero NO debe llegar al cofre de C8F2 que está detrás del muro.',
    board: { ...grid(['.........', '.....Z#C.', '.........']) },
    placements: [[at(0, 0, 9), 1]], mecha: at(0, 0, 9),
    expect: {
      status: 'resolved',
      tickHits: { 3: ['5,1', '6,1', '4,1'] },
      tickMisses: { 3: ['7,1'] },
    },
  },

  // ---------------------------------------------------------------- G08
  {
    id: 'G08', question: 'Interacción géiser ↔ portal',
    state: S.UNKNOWN, evidence: 'Necesita: nivel con un géiser cuyo rayo apunte a un '
      + 'portal; se ve si la onda sale por el otro portal.',
    explanation: 'El motor aplica la misma regla de portales a cualquier onda, incluida '
      + 'la del géiser: el rayo entra en el portal y sale por el compañero conservando '
      + 'dirección y alcance. Registrado como hipótesis compuesta (dos mecánicas sin '
      + 'confirmar juntas).',
    board: { ...grid(['..........', '...B...Z..', '..........']) },
    placements: [[at(0, 0, 10), 1]], mecha: at(0, 0, 10),
    expect: { status: 'resolved' },
  },

  // ---------------------------------------------------------------- G09
  {
    id: 'G09', question: 'Varias bombas alcanzadas por la misma onda del géiser',
    state: S.HYPOTHESIS, evidence: UNIT_EVIDENCE,
    explanation: 'Tres bombas: la mecha en C1F1 y dos más en la cruz del géiser (arriba '
      + 'y abajo). La onda del géiser alcanza las dos a la vez; ambas deben encenderse en '
      + 'el MISMO tick 3 y estallar juntas en el 4 (resolución simultánea).',
    board: { ...grid(['.........', '....Z....', '.........']), tray: [1, 1, 1] },
    placements: [[at(0, 0, 9), 1], [at(4, 0, 9), 1], [at(4, 2, 9), 1]], mecha: at(0, 0, 9),
    expect: {
      status: 'resolved',
      explosionsAtTick: { 3: ['geyser'], 4: ['bomb', 'bomb'] },
    },
  },

  // ---------------------------------------------------------------- G10
  {
    id: 'G10', question: 'Bomba en el alcance del géiser pero separada por un obstáculo',
    state: S.UNKNOWN, evidence: 'Necesita: captura con un muro entre el géiser y una '
      + 'bomba a dos casillas; se ve si la bomba se enciende.',
    explanation: 'El muro corta la onda del géiser antes de llegar a la bomba. Como esa '
      + 'bomba nunca estalla, la simulación termina en "invalid/disconnected" (bomba '
      + 'colocada que no detonó): eso ES la prueba de que la onda no la alcanzó.',
    board: { ...grid(['.........', '....Z#...', '.........']), tray: [1, 1] },
    placements: [[at(0, 0, 9), 1], [at(6, 1, 9), 1]], mecha: at(0, 0, 9),
    expect: {
      status: 'invalid', reason: 'disconnected',
      logLacks: [{ type: 'bomb-ignited', cell: '6,1' }],
    },
  },
  {
    id: 'G10b', question: '¿El géiser detiene el rayo de la bomba que lo alcanza?',
    state: S.UNKNOWN, evidence: 'Necesita: captura de un rayo largo de bomba que llega '
      + 'hasta un géiser, con otro objeto justo detrás; se ve si el rayo continúa.',
    explanation: 'La bomba N4 de C10F3 lanza un rayo hacia arriba; con geyserBlocks:true el '
      + 'rayo se detiene en el géiser de C10F2 y no llega a C10F1. Se miran sólo las '
      + 'casillas del tick 1, que es cuando estalla la bomba.',
    board: { ...grid(['..........', '.........Z', '..........']), tray: [4] },
    placements: [[at(9, 2, 10), 4]], mecha: at(9, 2, 10),
    expect: { status: 'resolved', tickHits: { 1: ['9,1'] }, tickMisses: { 1: ['9,0'] } },
  },
  {
    id: 'G10c', question: 'Variante soportada: el géiser NO detiene el rayo',
    state: S.UNKNOWN, evidence: 'Misma observación que G10b.',
    explanation: 'Con geyserBlocks:false el rayo de la bomba sigue de largo y llega dos '
      + 'casillas más allá del géiser. Se registra la alternativa, no se declara correcta.',
    board: { ...grid(['..........', '.........Z', '..........']), tray: [4], rules: { geyserBlocks: false } },
    placements: [[at(9, 2, 10), 4]], mecha: at(9, 2, 10),
    expect: { status: 'resolved', tickHits: { 1: ['9,1', '9,0'] } },
  },

  // ---------------------------------------------------------------- G11
  {
    id: 'G11', question: '¿Puede un géiser activarse varias veces?',
    state: S.UNKNOWN, evidence: 'Necesita: nivel donde la partida dure más que el '
      + 'temporizador del géiser; se ve si vuelve a estallar a los mismos segundos.',
    explanation: 'El motor lo trata como evento único (una sola programación en el tick 0). '
      + 'Si el juego lo repite, el motor está mal y este caso debe fallar.',
    board: { ...grid(['.........', '....Z....', '.........']) },
    placements: [[at(0, 0, 9), 1]], mecha: at(0, 0, 9),
    expect: { status: 'resolved', eventCount: { 'geyser-armed': 1 }, explosionsAtTick: { 3: ['geyser'] } },
  },

  // ---------------------------------------------------------------- G12
  {
    id: 'G12', question: 'Alcance real de la onda del géiser',
    state: S.UNKNOWN, evidence: 'Necesita: captura con objetos a 1, 2 y 3 casillas del '
      + 'géiser; se ve cuáles se destruyen.',
    explanation: 'El motor usa una cruz de alcance 2 (5 casillas). Se comparan las '
      + 'casillas alcanzadas con las que se vean en la captura; aquí sólo se registra.',
    observe: true,
    board: { ...grid(['.....', '..Z..', '.....']), rules: {} },
    placements: [[at(0, 0, 5), 1]], mecha: at(0, 0, 5),
  },

  // ---------------------------------------------------------------- G13
  {
    id: 'G13', question: 'Géiser junto a la mecha: no impide detonar',
    state: S.HYPOTHESIS, evidence: UNIT_EVIDENCE,
    explanation: 'El géiser arranca en el tick 0 esté donde esté, sin ocupar la casilla de '
      + 'la mecha ni bloquear la colocación. Se comprueba que la simulación es resoluble '
      + 'con un géiser al lado de la bomba.',
    board: { ...grid(['.....', '.Y...', '.....']) },
    placements: [[at(0, 1, 5), 1]], mecha: at(0, 1, 5),
    expect: { status: 'resolved' },
  },
];
