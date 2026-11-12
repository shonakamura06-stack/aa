// ============================================================
// BoomSolver — arnés de validación por casos
// ============================================================
// Cada caso declara: tablero, acción, resultado ESPERADO y explicación.
// El arnés ejecuta el mismo motor y compara. El resultado real se guarda
// literalmente, no se adapta para que cuadre.
//
// Estados de una mecánica (no confundir):
//   verified            → contrastada con el juego real (requiere evidencia humana)
//   internally-tested   → pasa pruebas contra el motor, sin validación externa
//   hypothesis          → implementada suponiendo el comportamiento
//   unknown             → sin información suficiente

import { prepareBoard, simulate } from '../core/engine.js';
import { evaluateOutcome } from '../core/goals.js';

export const MECHANIC_STATE = {
  VERIFIED: 'verified',
  INTERNALLY_TESTED: 'internally-tested',
  HYPOTHESIS: 'hypothesis',
  UNKNOWN: 'unknown',
};

/**
 * Ejecuta un caso.
 * @param {object} c
 *   id, question, board {cols,rows,cells,links?,tray?,rules?},
 *   placements [[idx,level]], mecha idx,
 *   expect {status?, reason?, hits?, misses?, jumps?: [...], events?: [...], hazard?, tickOf? }
 *   explanation, evidence (qué falta para verificar), state
 */
export function runCase(c) {
  const board = prepareBoard(c.board);
  const map = new Map(c.placements || []);
  const result = simulate(board, map, c.mecha, { ...(board.rules || {}), ...(c.rules || {}) });
  const actual = summarize(result, c.board.cols);
  const checks = [];
  const exp = c.expect || {};

  if (exp.status !== undefined) {
    checks.push(mk('status', exp.status, actual.status, actual.status === exp.status));
  }
  if (exp.reason !== undefined) {
    checks.push(mk('reason', exp.reason, actual.reason, actual.reason === exp.reason));
  }
  for (const cell of exp.hits || []) {
    checks.push(mk(`alcanza ${cell}`, true, actual.hits.includes(cell), actual.hits.includes(cell)));
  }
  for (const cell of exp.misses || []) {
    checks.push(mk(`no alcanza ${cell}`, false, actual.hits.includes(cell), !actual.hits.includes(cell)));
  }
  for (const j of exp.jumps || []) {
    const matches = actual.jumps.filter((x) => (!j.from || x.from === j.from)
      && (!j.to || x.to === j.to) && (!j.dir || x.dir === j.dir));
    const found = matches.find((x) => j.rangeTransported == null || x.rangeTransported === j.rangeTransported);
    const pass = j.absent ? matches.length === 0 : !!found;
    checks.push(mk(`salto portal desde ${j.from} a ${j.to}`
      + (j.dir ? ` dir ${j.dir}` : '')
      + (j.rangeTransported != null ? ` con alcance transportado ${j.rangeTransported}` : '')
      + (j.absent ? ' (no debe existir)' : ''),
    j.absent ? 'ninguno' : 'presente',
    found ? JSON.stringify(found) : (matches.length ? `presente con otro alcance: ${JSON.stringify(matches)}` : 'ninguno'),
    pass));
  }
  if (exp.jumpCount !== undefined) {
    checks.push(mk('nº de saltos', exp.jumpCount, actual.jumps.length, actual.jumps.length === exp.jumpCount));
  }
  if (exp.explosionsAtTick) {
    for (const [tick, kinds] of Object.entries(exp.explosionsAtTick)) {
      const found = result.ticks.find((t) => t.tick === Number(tick)) || {};
      const got = (found.explosions || []).map((e) => e.kind).sort();
      const want = kinds.slice().sort();
      checks.push(mk(`explosiones en tick ${tick}`, want.join(','), got.join(','), want.join(',') === got.join(',')));
    }
  }
  if (exp.objectives) {
    const verdict = evaluateOutcome(board, result, exp.objectives);
    checks.push(mk('veredicto', true, verdict.win, verdict.win === true));
  }
  if (exp.notObjectives) {
    const verdict = evaluateOutcome(board, result, exp.notObjectives);
    checks.push(mk('veredicto (no debe ganar)', false, verdict.win, verdict.win === false));
  }
  if (exp.tickHits) {
    for (const [tick, list] of Object.entries(exp.tickHits)) {
      const t = result.ticks.find((x) => x.tick === Number(tick));
      const cells = new Set();
      for (const ex of (t && t.explosions) || []) for (const c of ex.cells) cells.add(c);
      for (const want of list) {
        const ok = cells.has(want);
        checks.push(mk(`tick ${tick} alcanza ${want}`, true, ok, ok));
      }
    }
  }
  if (exp.tickMisses) {
    for (const [tick, list] of Object.entries(exp.tickMisses)) {
      const t = result.ticks.find((x) => x.tick === Number(tick));
      const cells = new Set();
      for (const ex of (t && t.explosions) || []) for (const c of ex.cells) cells.add(c);
      for (const want of list) {
        const ok = !cells.has(want);
        checks.push(mk(`tick ${tick} NO alcanza ${want}`, false, ok ? false : true, ok));
      }
    }
  }
  if (exp.idleTicks) {
    const idle = result.ticks.filter((t) => t.idle).map((t) => t.tick);
    for (const t of exp.idleTicks) {
      checks.push(mk(`tick ${t} ocioso`, true, idle.includes(t), idle.includes(t)));
    }
  }
  if (exp.geyserArm) {
    const armed = result.log.filter((e) => e.type === 'geyser-armed');
    for (const want of exp.geyserArm) {
      const got = armed.find((e) => e.cell === want.cell);
      const ok = !!got && (want.timer == null || got.timer === want.timer)
        && (want.dueTick == null || got.dueTick === want.dueTick);
      checks.push(mk(`armado del géiser ${want.cell}`, JSON.stringify(want), got
        ? JSON.stringify({ timer: got.timer, dueTick: got.dueTick }) : 'ninguno', ok));
    }
  }
  if (exp.eventCount) {
    for (const [type, n] of Object.entries(exp.eventCount)) {
      const got = result.log.filter((e) => e.type === type).length;
      checks.push(mk(`nº de eventos ${type}`, n, got, got === n));
    }
  }
  if (exp.logHas) {
    for (const w of exp.logHas) {
      const found = result.log.some((e) => e.type === w.type
        && (w.cell == null || e.cell === w.cell) && (w.tick == null || e.tick === w.tick));
      checks.push(mk(`evento ${JSON.stringify(w)}`, 'presente', found ? 'presente' : 'ninguno', found));
    }
  }
  if (exp.logLacks) {
    for (const w of exp.logLacks) {
      const found = result.log.some((e) => e.type === w.type
        && (w.cell == null || e.cell === w.cell) && (w.tick == null || e.tick === w.tick));
      checks.push(mk(`evento ausente ${JSON.stringify(w)}`, 'ninguno', found ? 'presente' : 'ninguno', !found));
    }
  }
  if (exp.noLoop) {
    checks.push(mk('termina sin bucle', true, result.status !== 'invalid' || result.reason !== 'unresolved',
      !(result.status === 'invalid' && result.reason === 'unresolved')));
  }

  // Caso de observación: no hay expectativa escrita, sólo se registra lo que hace
  // el motor. No cuenta como aprobado ni como fallo: se informa aparte.
  const observational = !!c.observe;
  const pass = observational ? true : checks.every((c2) => c2.pass);
  return {
    observational,
    id: c.id,
    question: c.question,
    state: c.state || MECHANIC_STATE.INTERNALLY_TESTED,
    evidence: c.evidence || null,
    explanation: c.explanation || '',
    pass,
    checks,
    expected: exp,
    actual,
    result,
  };
}

function mk(name, expected, actual, pass) {
  return { name, expected, actual, pass };
}

export function summarize(result, cols) {
  const hits = new Set();
  for (const t of result.ticks) for (const ex of t.explosions || []) for (const c of ex.cells) hits.add(c);
  const jumps = result.log.filter((e) => e.type === 'portal-jump')
    .map((e) => ({ from: e.from, to: e.to, dir: e.dir, rangeTransported: e.rangeTransported }));
  return {
    status: result.status,
    reason: result.reason,
    powder: result.metrics.powder,
    placedCount: result.metrics.placedCount,
    tickCount: result.metrics.tickCount,
    hits: [...hits],
    jumps,
    loopCuts: result.log.filter((e) => e.type === 'portal-loop-cut').length,
    events: result.log.map((e) => e.type),
    destroyed: result.metrics.destroyed,
    activated: result.metrics.activated,
    hazard: result.metrics.hazard ? result.metrics.hazard.type : null,
  };
}

export function runSuite(cases) {
  const results = cases.map(runCase);
  const asserted = results.filter((r) => !r.observational);
  return {
    total: results.length,
    asserted: asserted.length,
    passed: asserted.filter((r) => r.pass).length,
    observational: results.filter((r) => r.observational).length,
    failed: results.filter((r) => !r.observational && !r.pass),
    results,
  };
}

/** Tabla de casillas para tableros de validación. */
export function grid(lines) {
  const rows = lines.length;
  const cols = Math.max(...lines.map((l) => l.length));
  const cells = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) row.push(charToCell(lines[y][x] || '.'));
    cells.push(row);
  }
  return { cols, rows, cells };
}

export function charToCell(ch) {
  const M = {
    '.': 'empty', '#': 'wall', X: 'rock_soft', R: 'rock_hard', G: 'gem', C: 'chest_wood',
    I: 'chest_iron', S: 'switch', K: 'crystal', T: 'cat', D: 'dynamite', E: 'detonator',
    M: 'magma_rock', '/': 'mirror_slash', '\\': 'mirror_backslash',
    B: { type: 'portal', color: 'blue' }, P: { type: 'portal', color: 'purple' },
    Y: { type: 'geyser', timer: 1 }, Z: { type: 'geyser', timer: 3 },
    e: 'enemy_1', f: 'enemy_2', g: 'enemy_3', h: 'enemy_4',
  };
  if (!(ch in M)) throw new Error(`Carácter desconocido: ${ch}`);
  const v = M[ch];
  return typeof v === 'object' ? { ...v } : v;
}

export const at = (x, y, cols) => y * cols + x;
