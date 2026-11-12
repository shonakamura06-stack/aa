// ============================================================
// Validación avanzada de PORTALES
// ============================================================
// Estado de la mecánica: la regla de "transporta la explosión conservando
// dirección y alcance completo" está CONFIRMADA POR EL USUARIO, no por una
// prueba contra el juego. Por eso cada caso es 'hypothesis' o
// 'internally-tested', no 'verified'.

import { MECHANIC_STATE as S, grid, at } from './harness.js';

const PORTAL_EVIDENCE = 'Necesita: captura de un nivel con portales donde se vea '
  + 'qué objeto se destruye tras la salida y con qué alcance. Nivel candidato: '
  + '«Atajo dorado» (83) o «Salas gemelas» (82) del PDF de capturas.';

export const portalCases = [
  // ---------------------------------------------------------------
  {
    id: 'P01', question: 'Entrada horizontal por la izquierda: conserva dirección',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'La bomba en C4F3 (x=3) lanza su rayo derecho hacia el portal de C5F3 (x=4, primer azul en orden de lectura) y sale por C2F3 (x=1) siguiendo hacia la derecha. Alcance completo 2 ⇒ alcanza x=2 y x=3.',
    board: { ...grid(['.........', '.B..B....', '.........']), tray: [2] },
    placements: [[at(2, 1, 9), 2]], mecha: at(2, 1, 9),
    expect: {
      status: 'resolved',
      hits: ['2,1'],
      jumps: [{ from: '1,1', to: '4,1', dir: 'left', rangeTransported: 2 }],
    },
  },
  {
    id: 'P02', question: 'Entrada horizontal por la derecha: conserva dirección',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'Simétrico al P01: el rayo izquierdo entra en C2F3 (x=1) y sale por C5F3 (x=4) conservando la dirección izquierda.',
    board: { ...grid(['.........', '.B..B....', '.........']), tray: [2] },
    placements: [[at(3, 1, 9), 2]], mecha: at(3, 1, 9),
    expect: {
      status: 'resolved',
      jumps: [{ from: '1,1', to: '4,1', dir: 'left' }],
    },
  },
  {
    id: 'P03', question: 'Entrada vertical hacia arriba: conserva dirección',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'Dos portales en la misma columna, el rayo sube, entra en el de arriba y sale por el de abajo siguiendo hacia arriba.',
    board: { ...grid(['B.', '..', '..', '..', 'B.']), tray: [2] },
    placements: [[at(0, 2, 2), 2]], mecha: at(0, 2, 2),
    expect: {
      status: 'resolved',
      jumps: [{ from: '0,0', to: '0,4', dir: 'up' }],
    },
  },
  {
    id: 'P04', question: 'Entrada vertical hacia abajo: conserva dirección',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'El rayo baja desde C1F2, entra en el portal de C1F1 (único alcanzable) y sale por C1F5 siguiendo hacia abajo.',
    board: { ...grid(['B.', '..', '..', '..', 'B.']), tray: [2] },
    placements: [[at(0, 2, 2), 2]], mecha: at(0, 2, 2),
    expect: {
      status: 'resolved',
      jumps: [{ from: '0,0', to: '0,4', dir: 'up' }],
    },
  },
  {
    id: 'P05', question: 'El alcance transportado es el COMPLETO, no el sobrante',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'La bomba N2 está pegada al portal: al entrar sólo le sobraba 1 casilla. Si el juego transportara el sobrante, no llegaría a 2 casillas de la salida.',
    board: { ...grid(['..........', 'B.......B.', '..........']), tray: [2] },
    placements: [[at(7, 1, 10), 2]], mecha: at(7, 1, 10),
    expect: {
      status: 'resolved',
      jumps: [{ from: '8,1', to: '0,1', dir: 'right', rangeTransported: 2 }],
      hits: ['1,1', '2,1'],
      misses: ['3,1'],
    },
  },
  {
    id: 'P06', question: 'Tres portales del mismo color: no se inventa la pareja',
    state: S.UNKNOWN, evidence: 'Necesita un nivel con 3 portales azules. El motor avisa (ambiguous-portal-group) y empareja por orden de lectura; NO está confirmado.',
    explanation: 'Con 3 azules el último queda inerte. Se comprueba que el motor avisa y no silencia la ambigüedad.',
    board: { ...grid(['..........', 'B...B...B.', '..........']), tray: [3] },
    placements: [[at(1, 1, 10), 3]], mecha: at(1, 1, 10),
    expect: {
      status: 'resolved',
      jumps: [{ from: '0,1', to: '4,1', dir: 'left' }],
    },
  },
  {
    id: 'P07', question: 'Cuatro portales del mismo color',
    state: S.UNKNOWN, evidence: 'Necesita un nivel real con cuatro portales del mismo color. «Salas gemelas» muestra dos azules y dos morados: ese caso SÍ está cubierto en P08.',
    explanation: 'Cuatro azules: se emparejan 1º-2º y 3º-4º por orden de lectura. Regla determinista, sin confirmar.',
    board: { ...grid(['..........', 'B....B....', '.....B...B']), tray: [4] },
    placements: [[at(0, 2, 10), 4]], mecha: at(0, 2, 10),
    expect: { status: 'resolved' },
  },
  {
    id: 'P08', question: 'Dos azules y dos morados (caso de «Salas gemelas»)',
    state: S.HYPOTHESIS, evidence: 'Necesita la captura de «Salas gemelas» (82): dos azules y dos morados. La separación por color es la hipótesis, no está verificada.',
    explanation: 'Cada color debe emparejarse consigo mismo: azul con azul y morado con morado. Se comprueba que el registro de parejas no cruza colores.',
    board: { ...grid(['..........', 'B..P..B..P', '..........']), tray: [2] },
    placements: [[at(5, 1, 10), 2]], mecha: at(5, 1, 10),
    expect: { status: 'resolved' },
  },
  {
    id: 'P09', question: 'Portales encadenados: sale de uno y entra en otro',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'Dos pares de colores distintos declarados con id de pareja (a y b). '
      + 'La bomba de C9F2 lanza el rayo a la izquierda: entra en el portal b de C7F2 y sale '
      + 'por el b de C5F2, sigue a la izquierda y entra en el a de C3F2 para salir por el a '
      + 'de C1F2. Deben registrarse los DOS saltos, uno por par.',
    board: (() => {
      const g = grid(['..........', 'B.B.B.B...', '..........']);
      const pairs = [[0, 'a'], [2, 'a'], [4, 'b'], [6, 'b']];
      for (const [x, pair] of pairs) g.cells[1][x] = { type: 'portal', color: 'blue', pair };
      return { ...g, tray: [4] };
    })(),
    placements: [[at(8, 1, 10), 4]], mecha: at(8, 1, 10),
    expect: {
      status: 'resolved',
      jumps: [
        { from: '6,1', to: '4,1', dir: 'left' },
        { from: '2,1', to: '0,1', dir: 'left' },
      ],
      jumpCount: 2,
    },
  },
  {
    id: 'P10', question: 'Bucle de portal: nunca detona infinitamente',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'Dos portales enfrentados en una fila: el rayo vuelve a entrar en el mismo portal con la misma dirección. El motor corta por (portal, dirección) y termina.',
    board: { ...grid(['....', 'B.B.', '....']), tray: [3] },
    placements: [[at(1, 1, 4), 3]], mecha: at(1, 1, 4),
    expect: { status: 'resolved', noLoop: true },
  },
  {
    id: 'P11', question: 'Portal con muro justo a la salida',
    state: S.UNKNOWN, evidence: 'Necesita: nivel real con un objeto pegado a la boca del portal. Aquí se prueba la hipótesis "el rayo se detiene", que puede ser falsa si el juego perfora.',
    explanation: 'El destino está libre pero el vecino de la salida es muro. Hipótesis: el rayo muere ahí, como en cualquier tramo bloqueado.',
    board: { ...grid(['..........', '.B..#..B..', '..........']), tray: [2] },
    placements: [[at(5, 1, 10), 2]], mecha: at(5, 1, 10),
    expect: { status: 'resolved', misses: ['0,1'], jumps: [{ from: '7,1', to: '1,1', dir: 'right' }] },
  },
  {
    id: 'P12', question: 'Portal sin pareja: inerte y registrado',
    state: S.HYPOTHESIS, evidence: 'Necesita un nivel con un portal aislado (posible objeto con candado o portal decorativo).',
    explanation: 'Un único portal no tiene destino. El motor registra portal-blocked/unpaired y no transporta nada.',
    board: { ...grid(['..........', 'B.........', '..........']), tray: [2] },
    placements: [[at(0, 0, 10), 2]], mecha: at(0, 0, 10),
    expect: { status: 'resolved' },
  },
  {
    id: 'P13', question: 'El rayo del portal abre un cofre tras la salida',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'El valor práctico del portal: alcanzar un objetivo que ninguna bomba alcanza directamente.',
    // Ninguna bomba alcanza C10F2 por sí sola: sólo el salto del portal llega.
    board: { ...grid(['..........', '...B...B.C']), tray: [2] },
    placements: [[at(2, 1, 10), 2]], mecha: at(2, 1, 10),
    expect: {
      status: 'resolved',
      jumps: [{ from: '3,1', to: '7,1', dir: 'right', rangeTransported: 2 }],
      objectives: [{ kind: 'destroy', types: ['chest_wood'], count: 1 }],
    },
  },
  {
    id: 'P14', question: 'El rayo del portal rompe un cristal: el portal puede hacer perder',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'La salida es peligrosa: el rayo transportado alcanza un cristal y provoca derrota.',
    board: { ...grid(['..........', '...B...B.K']), tray: [2] },
    placements: [[at(2, 1, 10), 2]], mecha: at(2, 1, 10),
    expect: { status: 'lose', reason: 'hazard' },
  },
  {
    id: 'P15', question: 'El portal no bloquea: la onda sigue de largo si no entra',
    state: S.HYPOTHESIS, evidence: PORTAL_EVIDENCE,
    explanation: 'El rayo sube por la columna 5 y el portal está en la casilla (5,1): SÍ entra. Para comprobar que el portal no es obstáculo se mira que el rayo no muere en él y que el resto de rayos no se ven afectados.',
    board: { ...grid(['..........', '.....B....', '..........']), tray: [3] },
    placements: [[at(5, 2, 10), 3]], mecha: at(5, 2, 10),
    expect: { status: 'resolved' },
  },
  {
    id: 'P16', question: 'Dos rayos entran en el mismo portal en el mismo tick',
    state: S.UNKNOWN, evidence: 'Necesita: nivel con dos bombas cuyos rayos entren en el mismo portal en la misma ola. Puede que el juego transporte sólo uno.',
    explanation: 'Una sola bomba con patrón en cruz puede lanzar dos rayos; aquí se usan dos bombas alineadas. Se comprueba cuántos saltos se registran.',
    board: { ...grid(['..........', 'B..B......', '..........']), tray: [2, 2] },
    placements: [[at(5, 1, 10), 2], [at(6, 1, 10), 2]], mecha: at(6, 1, 10),
    expect: { status: 'resolved' },
  },
  {
    id: 'P17', question: 'Portal + géiser: el rayo transportado activa el géiser',
    state: S.UNKNOWN, evidence: 'Necesita: nivel con portal y géiser juntos. Depende de Q7 (si el géiser bloquea la onda).',
    explanation: 'La onda sale del portal y alcanza un géiser. Con la regla actual el géiser no explota por el impacto (sólo por su temporizador) y detiene el rayo.',
    board: { ...grid(['..........', 'B..B..Z...', '..........']), tray: [2] },
    placements: [[at(5, 1, 10), 2]], mecha: at(5, 1, 10),
    expect: { status: 'resolved' },
  },
  {
    id: 'P18', question: 'Portal + bomba: la onda transportada enciende otra bomba',
    state: S.HYPOTHESIS, evidence: 'Necesita: nivel con portal y dos bombas separadas por el portal.',
    explanation: 'La bomba N3 de C1F2 entra en el portal de x=1 y sale por x=4 con alcance 3: alcanza la bomba de x=6, que se enciende en el tick 2.',
    board: { ...grid(['..........', '.B..B.....', '..........']), tray: [3, 1] },
    placements: [[at(0, 1, 10), 3], [at(6, 1, 10), 1]], mecha: at(0, 1, 10),
    expect: {
      status: 'resolved',
      jumps: [{ from: '1,1', to: '4,1', dir: 'right', rangeTransported: 3 }],
      explosionsAtTick: { 1: ['bomb'], 2: ['bomb'] },
    },
  },
];
