// ============================================================
// BoomSolver — catálogo único de objetos
// ============================================================
// Fuente de verdad de la física de cada objeto. El simulador, el buscador,
// el generador y el editor leen SIEMPRE de aquí: no hay listas paralelas.
//
// status:
//   'confirmed' → comportamiento descrito por el usuario o comprobado en el juego.
//   'assumed'   → está en MECANICAS_BoomSolver.md / en el código v20-v21 pero
//                 NO se ha podido comprobar en el juego real.
//   'unknown'   → se ve en las capturas del editor pero no se conoce su física.
//                 Nunca se le asigna comportamiento inventado.
//
// blocks:
//   'none'   → el rayo sigue.
//   'wave'   → detiene el rayo, pero sólo tras aplicarle daño si es destruible.
//   'always' → detiene el rayo y es indestructible.
//
// Ninguna propiedad de física de este archivo es "verdad" si su status no es
// 'confirmed'. RULES_OPEN_QUESTIONS.md lista cómo probar cada suposición.

/** @typedef {'target'|'obstacle'|'hazard'|'trigger'|'passable'|'redirect'|'transport'|'unknown'} Role */

export const STATUS = { CONFIRMED: 'confirmed', ASSUMED: 'assumed', UNKNOWN: 'unknown' };

const T = (o) => ({ blocks: 'none', placeable: false, damageable: true, disappears: true, status: STATUS.ASSUMED, ...o });

export const OBJECTS = {
  empty: T({
    name: 'Vacío', role: 'passable', hp: 0, damageable: false, disappears: false, placeable: true,
    status: STATUS.CONFIRMED, evidence: 'Casilla libre del tablero.',
  }),
  void: T({
    name: 'Fuera del mapa', role: 'obstacle', hp: null, blocks: 'always', damageable: false,
    disappears: false, status: STATUS.CONFIRMED, evidence: 'Símbolo de rayado diagonal en las capturas.',
  }),
  wall: T({
    name: 'Muro', role: 'obstacle', hp: null, blocks: 'always', damageable: false, disappears: false,
    status: STATUS.CONFIRMED, evidence: 'Muro de piedra/ladrillo; ninguna explosión lo rompe.',
  }),
  rock_soft: T({
    name: 'Roca (1)', role: 'obstacle', hp: 1, blocks: 'wave',
    status: STATUS.ASSUMED, evidence: 'Documento técnico: roca blanda, 1 impacto.',
  }),
  rock_hard: T({
    name: 'Roca dura (2)', role: 'obstacle', hp: 2, blocks: 'wave',
    status: STATUS.ASSUMED, evidence: 'Documento técnico: roca dura, 2 impactos.',
  }),
  gem: T({
    name: 'Diamante/gema', role: 'target', hp: 1, blocks: 'none', disappears: true,
    status: STATUS.CONFIRMED, evidence: 'Directriz "Recoge las gemas 0/N".',
  }),
  chest_wood: T({
    name: 'Cofre de madera', role: 'target', hp: 1, blocks: 'wave',
    status: STATUS.ASSUMED, evidence: 'Directriz "Abre los cofres". Rompe la onda que lo abre.',
  }),
  chest_iron: T({
    name: 'Cofre de hierro', role: 'target', hp: 2, blocks: 'wave',
    status: STATUS.ASSUMED, evidence: 'Documento técnico: requiere dos impactos.',
  }),
  switch: T({
    name: 'Interruptor/botón', role: 'target', hp: 1, blocks: 'none', disappears: false,
    status: STATUS.ASSUMED, evidence: 'Directriz "Activa los interruptores a la vez 0/M".',
  }),
  crystal: T({
    name: 'Cristal', role: 'hazard', hp: 1, blocks: 'wave', disappears: false,
    status: STATUS.ASSUMED,
    evidence: 'Condición negativa "sin romper cristales". Está por confirmar si siempre es derrota (Q12).',
  }),
  cat: T({
    name: 'Gato (Don Naranjón)', role: 'hazard', hp: 1, blocks: 'wave', disappears: false,
    status: STATUS.ASSUMED, evidence: 'Directriz "sin despertar a Don Naranjón".',
  }),
  dynamite: T({
    name: 'Dinamita', role: 'trigger', hp: 1, blocks: 'wave',
    onHit: { schedule: 'explode', pattern: 'dynamite', delayTicks: 1 },
    status: STATUS.ASSUMED, evidence: 'Patrón configurable (3x3, +1, +2, fila, columna).',
  }),
  detonator: T({
    name: 'Detonador', role: 'trigger', hp: 1, blocks: 'wave', disappears: false,
    onHit: { schedule: 'detonateLinked', delayTicks: 1 },
    status: STATUS.ASSUMED, evidence: 'Detona las cargas conectadas por cable.',
  }),
  magma_rock: T({
    name: 'Roca de magma', role: 'trigger', hp: 1, blocks: 'wave',
    onHit: { schedule: 'explode', pattern: 'magma', delayTicks: 1 },
    status: STATUS.ASSUMED, evidence: 'Explosión en cruz de alcance configurable (Q en spec).',
  }),
  mirror_slash: T({
    name: 'Espejo /', role: 'redirect', hp: null, blocks: 'none', damageable: false, disappears: false,
    redirect: 'slash', status: STATUS.ASSUMED,
    evidence: 'Refleja 90°. Convención de orientación verificada con pruebas de óptica del repo.',
  }),
  mirror_backslash: T({
    name: 'Espejo \\', role: 'redirect', hp: null, blocks: 'none', damageable: false, disappears: false,
    redirect: 'backslash', status: STATUS.ASSUMED,
    evidence: 'Refleja 90°. Convención de orientación verificada con pruebas de óptica del repo.',
  }),
  portal: T({
    name: 'Portal', role: 'transport', hp: null, blocks: 'none', damageable: false, disappears: false,
    params: { color: 'blue' },
    status: STATUS.ASSUMED,
    evidence: 'Regla confirmada por el usuario: transporta la explosión conservando dirección y alcance completo. ' +
      'El emparejamiento por color no está confirmado (Q1).',
  }),
  geyser: T({
    name: 'Géiser', role: 'trigger', hp: null, blocks: 'wave', damageable: false, disappears: false,
    params: { timer: 3 },
    status: STATUS.ASSUMED,
    evidence: 'Regla confirmada por el usuario: arranca al pulsar Detonar, sin mecha; cruz de alcance 2 al vencer. ' +
      'Unidad de tiempo no confirmada (Q5).',
  }),
};

// Bombas enemigas: el documento técnico describe niveles 1..4 espejo de las N1..N4.
for (const lvl of [1, 2, 3, 4]) {
  OBJECTS[`enemy_${lvl}`] = T({
    name: `Bomba enemiga N${lvl}`, role: 'trigger', hp: 1, blocks: 'wave', isBombLike: true,
    onHit: { schedule: 'explode', pattern: lvl === 3 ? 'x3x3' : `cross:${lvl}`, delayTicks: 1 },
    status: STATUS.ASSUMED, evidence: 'Documento técnico. El patrón real de cada enemiga no está confirmado (Q10).',
  });
}

export const BOMB_LEVELS = {
  1: { name: 'N1', range: 1, powder: 1 },
  2: { name: 'N2', range: 2, powder: 2 },
  3: { name: 'N3', range: 3, powder: 4 },
  4: { name: 'N4', range: 4, powder: 8 },
};

export const PORTAL_COLORS = ['blue', 'purple'];

export const HAZARD_TYPES = new Set(
  Object.entries(OBJECTS).filter(([, d]) => d.role === 'hazard').map(([id]) => id),
);
export const TARGET_TYPES = new Set(
  Object.entries(OBJECTS).filter(([, d]) => d.role === 'target').map(([id]) => id),
);

export function getObject(type) {
  return OBJECTS[type] || null;
}

export function isKnownType(type) {
  return Object.prototype.hasOwnProperty.call(OBJECTS, type);
}

/** Objetos presentes en la paleta del editor. */
export function paletteTypes() {
  return Object.keys(OBJECTS).filter((t) => t !== 'void').concat(['void']);
}

// ------------------------------------------------------------
// Objetos vistos en las capturas del editor SIN física conocida.
// Se documentan para no inventarles comportamiento, pero NO existen en el
// motor: si aparecen en una imagen, el detector debe marcarlos 'unknown'.
// ------------------------------------------------------------
export const UNRESOLVED_VISUALS = [
  {
    visualId: 'locked_padlock_group',
    description: 'Iconos con candado en la paleta del editor (aparecen varios).',
    status: STATUS.UNKNOWN,
    blockedBy: 'Q9 — no se conoce su typeId real ni su física.',
  },
  {
    visualId: 'orange_figure',
    description: 'Figura naranja del editor, sin descripción en el documento técnico.',
    status: STATUS.UNKNOWN,
    blockedBy: 'Q9 — podría ser el personaje (gato/Don Naranjón) u otro objeto.',
  },
];

export function defaultRules() {
  return {
    fusionMode: 'equal',                 // 'equal' | 'sum'  (spec §3.1)
    dynamitePattern: 'cross1',           // cross1 | x3x3 | cross2 | row | col
    magmaRange: 1,                       // 1..4, dentro de la cruz
    magmaBlocks: true,                   // hipótesis: la roca detiene la onda que la activa
    objectsBlock: true,                   // los objetos con blocks:'wave' detienen el rayo
    bombBlocks: false,                   // las bombas colocadas detienen el rayo (configurable)
    requireEnemyBombs: false,             // victoria exige detonar todas las enemigas
    hazardDefeat: true,                   // tocar un peligro = derrota
    geyserHitBehavior: 'ignore',         // ignore | detonate  (Q7)
    geyserBlocks: true,                   // Q7
    portalPairing: 'color-order',         // color-order | explicit
    portalRangeMode: 'full',             // full (usuario) | remaining
    portalMaxJumps: 8,                    // corte anti-bucle por rayo
    hitPerSourcePerTick: true,            // un rayo no daña dos veces la misma casilla
    tickUnit: 'tick',                     // Q5: unidad declarada, no inventada
    maxTicks: 64,
    sameTypeChain: false,                 // reacción en cadena del mismo tipo (documento v21)
  };
}

/** Nombres y descripciones de reglas expuestas en la interfaz. */
export const RULE_DESCRIPTIONS = {
  fusionMode: 'Solo iguales (N1+N1→N2…) o suma libre (N2+N1→N3, tope N4).',
  dynamitePattern: 'Patrón de explosión de la dinamita.',
  magmaRange: 'Alcance de la cruz de la roca de magma.',
  magmaBlocks: 'La roca de magma detiene la onda que la activa.',
  objectsBlock: 'Los objetos sólidos detienen el rayo de explosión.',
  bombBlocks: 'Las bombas sin detonar detienen el rayo (si no, lo atraviesan y explotan igual).',
  requireEnemyBombs: 'La victoria exige que todas las bombas enemigas hayan detonado.',
  hazardDefeat: 'Tocar un peligro (cristal, gato) provoca derrota.',
  geyserHitBehavior: 'Qué hace un géiser alcanzado por una onda: ignorarla o explotar en el tick siguiente.',
  geyserBlocks: 'El géiser detiene el rayo que lo alcanza.',
  portalPairing: 'Cómo se emparejan los portales (por color en orden de lectura o pareja explícita).',
  portalRangeMode: 'full = el rayo transportado conserva todo su alcance; remaining = sólo lo que sobra.',
  portalMaxJumps: 'Corte determinista de seguridad contra bucles de portal.',
  hitPerSourcePerTick: 'Un mismo origen no daña dos veces la misma casilla en el mismo tick.',
  tickUnit: 'Unidad del temporizador de géiser. Sin confirmar: se declara "tick de simulación".',
  maxTicks: 'Tope de ticks simulados antes de declarar el turno no resuelto.',
  sameTypeChain: 'Reacción en cadena entre objetos del mismo tipo.',
};
