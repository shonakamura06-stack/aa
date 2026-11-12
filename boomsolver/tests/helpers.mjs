// Utilidades de prueba: crear tableros a partir de arte ASCII.
import { prepareBoard, simulate } from '../src/core/engine.js';
import { evaluateOutcome } from '../src/core/goals.js';

export const LEGEND_CHARS = new Map();

/**
 * Construye un nivel desde líneas tipo:
 *   "..G.."
 *   "..X.."
 * Leyenda por defecto:
 *   . vacío   # muro   X roca blanda   R roca dura   G gema
 *   C cofre madera    I cofre hierro   S interruptor
 *   K cristal         T gato          D dinamita     E detonador
 *   M magma           / espejo /     \ espejo \
 *   B portal azul     P portal morado  Y géiser (timer 3)
 *   e enemiga N1..N4 (e1..e4)
 */
export function levelFromAscii(lines, { tray = [1, 1, 1], rules = {}, portals = [], timers = {} } = {}) {
  const rows = lines.length;
  const cols = Math.max(...lines.map((l) => l.length));
  const cells = [];
  const portalCells = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const ch = lines[y][x] || '.';
      row.push(charToCell(ch, { timers, portals: portalCells, x, y }));
    }
    cells.push(row);
  }
  const lvl = { cols, rows, cells, tray, rules };
  if (portalCells.length) lvl.portals = portalCells;
  return lvl;
}

function charToCell(ch, { timers, portals, x, y }) {
  switch (ch) {
    case '.': return 'empty';
    case '#': return 'wall';
    case 'X': return 'rock_soft';
    case 'R': return 'rock_hard';
    case 'G': return 'gem';
    case 'C': return 'chest_wood';
    case 'I': return 'chest_iron';
    case 'S': return 'switch';
    case 'K': return 'crystal';
    case 'T': return 'cat';
    case 'D': return 'dynamite';
    case 'E': return 'detonator';
    case 'M': return 'magma_rock';
    case '/': return 'mirror_slash';
    case '\\': return 'mirror_backslash';
    case 'B': portals.push({ cell: `${x},${y}`, color: 'blue' }); return { type: 'portal', color: 'blue' };
    case 'P': portals.push({ cell: `${x},${y}`, color: 'purple' }); return { type: 'portal', color: 'purple' };
    case 'Y': return { type: 'geyser', timer: timers[`${x},${y}`] ?? 3 };
    case 'e': return 'enemy_1';
    case 'f': return 'enemy_2';
    case 'g': return 'enemy_3';
    case 'h': return 'enemy_4';
    default: throw new Error(`Carácter no reconocido en tablero: ${ch}`);
  }
}

export function run(level, placements, mecha, objectives = []) {
  const board = prepareBoard(level);
  const res = simulate(board, new Map(placements), mecha, {});
  const verdict = objectives.length ? evaluateOutcome(board, res, objectives) : null;
  return { board, res, verdict };
}

/** Casillas alcanzadas (únicas) por una simulación, como "x,y". */
export function hitSet(res) {
  const s = new Set();
  for (const t of res.ticks) for (const ex of t.explosions || []) for (const c of ex.cells) s.add(c);
  return s;
}

export function eventsOf(res, type) {
  return res.log.filter((e) => e.type === type);
}

export function idx(x, y, cols) { return y * cols + x; }
