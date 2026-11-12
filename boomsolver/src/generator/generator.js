// ============================================================
// BoomSolver — generador de niveles por restricciones
// ============================================================
// No es un colocador aleatorio: cada candidato pasa por
//   estructura legal → simulador → buscador completo → filtros →
//   dificultad → deduplicación.
// Si el buscador no demuestra solvencia, el nivel NO se marca resoluble.

import { BOMB_LEVELS, getObject } from '../core/catalog.js';
import { prepareBoard } from '../core/engine.js';
import { solve, verifySolution } from '../solver/solver.js';
import { mulberry32 } from '../rng.js';
import { scoreDifficulty } from '../difficulty.js';

export const DEFAULT_CONSTRAINTS = {
  name: 'Nivel generado',
  theme: 'mine',
  width: 7,
  height: 5,
  seed: 1,
  targets: { gem: 1, chest_wood: 0, chest_iron: 0, switch: 0 },
  negative: { crystal: 0 },
  hazards: { crystal: 0, cat: 0 },
  obstacles: { wall: 0, rock_soft: 0, rock_hard: 0 },
  mechanics: { portalPairs: 0, geysers: 0, mirrors: 0, magma: 0, dynamite: 0, detonators: 0 },
  geyserTimers: [1, 2, 3],
  portalColors: ['blue'],
  tray: { 1: 3, 2: 1 },
  rules: {},
  difficulty: 'any',            // easy | medium | hard | expert | any
  minBombs: 1, maxBombs: 6,
  minPowder: null, maxPowder: null,
  solutionCount: 'any',         // unique | few | many | any
  exactSolutionCount: null,     // nº EXACTO de soluciones óptimas físicamente distintas
  // Temporizadores: si se pide un géiser, se puede exigir un temporizador concreto
  // (o una lista). Sigue siendo "tick de simulación", no una unidad del juego.
  requireGeyserTimers: null,    // p.ej. [2] o [1,3]
  difficultyMinScore: null,     // p.ej. 45
  difficultyMaxScore: null,     // p.ej. 70
  forbidObjects: [],            // tipos que no pueden aparecer en el tablero
  requiredMechanics: [],        // p.ej. ['portal'] obliga a que el óptimo use portales
  forbidMechanics: [],
  allowTrayFusions: true,
  maxAttempts: 60,
};

export function normalizeConstraints(input = {}) {
  const c = structuredClone(DEFAULT_CONSTRAINTS);
  for (const [k, v] of Object.entries(input || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && c[k] && typeof c[k] === 'object' && !Array.isArray(c[k])) {
      c[k] = { ...c[k], ...v };
    } else {
      c[k] = v;
    }
  }
  c.width = clampInt(c.width, 3, 12);
  c.height = clampInt(c.height, 2, 10);
  c.seed = Number.isFinite(c.seed) ? Math.trunc(c.seed) : 1;
  return c;
}

function clampInt(v, lo, hi) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// ------------------------------------------------------------
// Estructura del candidato
// ------------------------------------------------------------
function emptyBoard(c, rnd) {
  const cells = [];
  for (let y = 0; y < c.height; y++) {
    const row = [];
    for (let x = 0; x < c.width; x++) {
      const edge = y === 0 || y === c.height - 1 || x === 0 || x === c.width - 1;
      // Algunos muros en el borde exterior, nunca pegado a objetos objetivo.
      row.push(edge && rnd() < 0.18 ? 'wall' : 'empty');
    }
    cells.push(row);
  }
  return cells;
}

function freeCells(cells, c, rnd) {
  const out = [];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) if (cells[y][x] === 'empty') out.push([x, y]);
  }
  // Barajar determinista
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function placeCount(cells, pool, type, count, params = null) {
  let placed = 0;
  for (const [x, y] of pool) {
    if (placed >= count) break;
    if (cells[y][x] !== 'empty') continue;
    cells[y][x] = params ? { type, ...params } : type;
    placed++;
  }
  return placed;
}

/**
 * Construye un candidato a partir de las restricciones. Determinista con la semilla.
 */
export function buildCandidate(constraints) {
  const c = normalizeConstraints(constraints);
  const rnd = mulberry32(c.seed);
  const cells = emptyBoard(c, rnd);

  // Portales: se colocan por parejas y con colores permitidos.
  let pool = freeCells(cells, c, rnd);
  const portalPairs = [];
  const nPairs = clampInt(c.mechanics.portalPairs, 0, 3);
  for (let p = 0; p < nPairs; p++) {
    const color = c.portalColors[p % c.portalColors.length] || 'blue';
    const a = pool.pop();
    const b = pool.pop();
    if (!a || !b) break;
    cells[a[1]][a[0]] = { type: 'portal', color };
    cells[b[1]][b[0]] = { type: 'portal', color };
    // Separación mínima para que el portal aporte algo al puzle.
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 3) {
      cells[a[1]][a[0]] = 'empty';
      cells[b[1]][b[0]] = 'empty';
      pool.push(a, b);
      break;
    }
    portalPairs.push({ color, a, b });
  }

  // Géiseres con temporizador dentro del rango permitido.
  const timers = c.geyserTimers.length ? c.geyserTimers : [1, 2, 3];
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'geyser', clampInt(c.mechanics.geysers, 0, 4), null);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const v = cells[y][x];
      if (v && v.type === 'geyser') {
        v.timer = timers[Math.floor(rnd() * timers.length)];
      }
    }
  }

  // Espejos, magma, dinamita y detonadores.
  pool = freeCells(cells, c, rnd);
  for (let i = 0; i < clampInt(c.mechanics.mirrors, 0, 6); i++) {
    const [x, y] = pool.pop() || [];
    if (x === undefined) break;
    cells[y][x] = rnd() < 0.5 ? 'mirror_slash' : 'mirror_backslash';
  }
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'magma_rock', clampInt(c.mechanics.magma, 0, 4));
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'dynamite', clampInt(c.mechanics.dynamite, 0, 4));
  pool = freeCells(cells, c, rnd);
  const nDet = placeCount(cells, pool, 'detonator', clampInt(c.mechanics.detonators, 0, 2));

  // Obstáculos.
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'rock_soft', clampInt(c.obstacles.rock_soft, 0, 8));
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'rock_hard', clampInt(c.obstacles.rock_hard, 0, 6));

  // Peligros (nunca en el borde, para no bloquear demasiado).
  pool = freeCells(cells, c, rnd).filter(([x, y]) => x > 0 && y > 0 && x < c.width - 1 && y < c.height - 1);
  placeCount(cells, pool, 'crystal', clampInt(c.hazards.crystal, 0, 6));
  pool = freeCells(cells, c, rnd).filter(([x, y]) => x > 0 && y > 0 && x < c.width - 1 && y < c.height - 1);
  placeCount(cells, pool, 'cat', clampInt(c.hazards.cat, 0, 2));

  // Objetivos.
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'gem', clampInt(c.targets.gem, 0, 9));
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'chest_wood', clampInt(c.targets.chest_wood, 0, 6));
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'chest_iron', clampInt(c.targets.chest_iron, 0, 6));
  pool = freeCells(cells, c, rnd);
  placeCount(cells, pool, 'switch', clampInt(c.targets.switch, 0, 6));

  // Cables detonador → dinamita (uno por detonador, al azar determinista).
  const links = {};
  let detCount = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (cells[y][x] === 'detonator') detCount++;
  if (nDet > 0 && detCount > 0) {
    const dyn = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (cells[y][x] === 'dynamite') dyn.push([x, y]);
    if (dyn.length) {
      let i = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (cells[y][x] !== 'detonator') continue;
          const t = dyn[i++ % dyn.length];
          links[`${x},${y}`] = [`${t[0]},${t[1]}`];
        }
      }
    }
  }

  const tray = [];
  for (const [lvl, n] of Object.entries(c.tray)) {
    for (let i = 0; i < n; i++) tray.push(Number(lvl));
  }

  return {
    name: c.name,
    theme: c.theme,
    cols: c.width,
    rows: c.height,
    cells,
    links,
    tray,
    rules: c.rules,
    seed: c.seed,
    constraints: c,
  };
}

// ------------------------------------------------------------
// Validación completa
// ------------------------------------------------------------
export function validateStructure(level) {
  const problems = [];
  if (!level.cols || !level.rows) problems.push('Dimensiones ausentes.');
  if (!Array.isArray(level.tray) || level.tray.length === 0) problems.push('Bandeja vacía.');
  if (!Array.isArray(level.cells)) problems.push('Tablero ausente.');
  let targets = 0, placeable = 0;
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const cell = level.cells[y][x];
      const type = typeof cell === 'string' ? cell : cell && cell.type;
      const def = getObject(type);
      if (!def) { problems.push(`Tipo desconocido en (${x},${y}): ${type}`); continue; }
      if (def.role === 'target') targets++;
      if (def.role === 'passable') placeable++;
    }
  }
  if (targets === 0) problems.push('El tablero no tiene ningún objetivo.');
  if (placeable === 0) problems.push('No hay casillas donde colocar bombas.');
  return { ok: problems.length === 0, problems };
}

export function objectivesFor(level, constraints) {
  const c = normalizeConstraints(constraints);
  const present = new Set();
  for (const row of level.cells) {
    for (const cell of row) present.add(typeof cell === 'string' ? cell : cell && cell.type);
  }
  const positive = [];
  if (present.has('chest_wood') || present.has('chest_iron')) positive.push({ kind: 'destroy', types: ['chest_wood', 'chest_iron'].filter((t) => present.has(t)) });
  if (present.has('gem')) positive.push({ kind: 'destroy', types: ['gem'] });
  if (present.has('switch')) positive.push({ kind: 'activate', types: ['switch'], simultaneous: true });
  const negative = [];
  if (present.has('crystal') || (c.negative && c.negative.crystal > 0)) negative.push({ kind: 'noDestroy', types: ['crystal'], negative: true });
  if (present.has('cat')) negative.push({ kind: 'noDestroy', types: ['cat'], negative: true });
  return [...positive, ...negative];
}

/**
 * Genera un nivel que cumple las restricciones, o explica por qué no pudo.
 * Cada intento usa una semilla derivada determinista.
 */
export function generate(input, options = {}) {
  const c = normalizeConstraints(input);
  const attempts = Math.max(1, Math.min(c.maxAttempts, options.maxAttempts || c.maxAttempts));
  const rejected = [];
  const seenSignatures = new Set();
  const opts = {
    timeBudgetMs: options.timeBudgetMs ?? 4000,
    solverMode: options.solverMode || 'fewest_bombs',
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    const seed = (c.seed + attempt * 7919) >>> 0;
    const candidate = buildCandidate({ ...c, seed });
    const structure = validateStructure(candidate);
    if (!structure.ok) { rejected.push({ seed, reason: structure.problems.join(' ') }); continue; }

    const objectives = objectivesFor(candidate, c);
    if (!objectives.length) { rejected.push({ seed, reason: 'Sin objetivos derivados.' }); continue; }

    const board = prepareBoard(candidate);
    void board;

    const solved = solve(candidate, objectives, {
      mode: opts.solverMode,
      maxBombs: c.maxBombs,
      maxSolutions: 40,
      timeBudgetMs: opts.timeBudgetMs,
    });

    if (solved.status === 'infeasible' || solved.solutions.length === 0) {
      rejected.push({ seed, reason: 'Imposible: ' + (solved.reasons[0] || 'sin solución') });
      continue;
    }
    if (solved.status !== 'optimalityProven') {
      rejected.push({ seed, reason: `Solvencia no demostrada (${solved.status}); no se acepta.` });
      continue;
    }

    const best = solved.solutions[0];
    if (best.physicalBombs < c.minBombs || best.physicalBombs > c.maxBombs) {
      rejected.push({ seed, reason: `Óptimo ${best.physicalBombs} bombas fuera de [${c.minBombs},${c.maxBombs}].` });
      continue;
    }
    if (c.minPowder != null && best.powder < c.minPowder) { rejected.push({ seed, reason: `Pólvora ${best.powder} < ${c.minPowder}.` }); continue; }
    if (c.maxPowder != null && best.powder > c.maxPowder) { rejected.push({ seed, reason: `Pólvora ${best.powder} > ${c.maxPowder}.` }); continue; }

    // Mecánicas obligatorias: el óptimo debe usarlas de verdad.
    for (const mech of c.requiredMechanics) {
      if (!usesMechanic(candidate, best, mech)) {
        rejected.push({ seed, reason: `La solución óptima no usa la mecánica obligatoria "${mech}".` });
        continue;
      }
    }
    for (const mech of c.forbidMechanics) {
      if (usesMechanic(candidate, best, mech)) {
        rejected.push({ seed, reason: `La solución óptima usa la mecánica prohibida "${mech}".` });
        continue;
      }
    }

    const diff = scoreDifficulty(candidate, solved, objectives);
    if (c.difficulty !== 'any' && diff.band !== c.difficulty) {
      rejected.push({ seed, reason: `Dificultad ${diff.band} ≠ solicitada ${c.difficulty}.` });
      continue;
    }
    if (c.difficultyMinScore != null && diff.score < c.difficultyMinScore) {
      rejected.push({ seed, reason: `Dificultad ${diff.score} < ${c.difficultyMinScore}.` });
      continue;
    }
    if (c.difficultyMaxScore != null && diff.score > c.difficultyMaxScore) {
      rejected.push({ seed, reason: `Dificultad ${diff.score} > ${c.difficultyMaxScore}.` });
      continue;
    }

    // Temporizadores exigidos: el nivel debe contener un géiser con ese temporizador.
    if (Array.isArray(c.requireGeyserTimers) && c.requireGeyserTimers.length) {
      const timers = new Set();
      candidate.cells.forEach((row) => row.forEach((cell) => {
        if (cell && typeof cell === 'object' && cell.type === 'geyser') timers.add(Number(cell.timer));
      }));
      const okTimer = c.requireGeyserTimers.some((t) => timers.has(Number(t)));
      if (!okTimer) {
        rejected.push({
          seed,
          reason: `Se exigía un géiser con temporizador ${c.requireGeyserTimers.join('/')} `
            + `y hay ${[...timers].join('/') || 'ninguno'}.`,
        });
        continue;
      }
    }

    // Objetos prohibidos: ni uno solo en el tablero.
    if (Array.isArray(c.forbidObjects) && c.forbidObjects.length) {
      const present = new Set();
      candidate.cells.forEach((row) => row.forEach((cell) => {
        const t = typeof cell === 'string' ? cell : cell && cell.type;
        if (t) present.add(t);
      }));
      const found = c.forbidObjects.filter((t) => present.has(t));
      if (found.length) {
        rejected.push({ seed, reason: `El tablero contiene objetos prohibidos: ${found.join(', ')}.` });
        continue;
      }
    }

    const minimumCount = solved.solutions.length;
    // Número EXACTO de soluciones óptimas (distintas físicamente, ya deduplicadas
    // por el solver). Es más estricto que unique/few/many: se exige igualdad.
    if (c.exactSolutionCount != null && minimumCount !== c.exactSolutionCount) {
      rejected.push({
        seed,
        reason: `Se pedían exactamente ${c.exactSolutionCount} soluciones óptimas y hay ${minimumCount}.`,
      });
      continue;
    }
    if (c.solutionCount === 'unique' && minimumCount !== 1) {
      rejected.push({ seed, reason: `Se pedía solución única y hay ${minimumCount}.` });
      continue;
    }
    if (c.solutionCount === 'few' && (minimumCount < 2 || minimumCount > 6)) {
      rejected.push({ seed, reason: `Se pedían pocas soluciones y hay ${minimumCount}.` });
      continue;
    }
    if (c.solutionCount === 'many' && minimumCount < 7) {
      rejected.push({ seed, reason: `Se pedían muchas soluciones y hay ${minimumCount}.` });
      continue;
    }

    // Deduplicación por "forma" del tablero con las coordenadas normalizadas.
    const sig = boardShapeSignature(candidate);
    if (seenSignatures.has(sig)) { rejected.push({ seed, reason: 'Duplicado estructural.' }); continue; }
    seenSignatures.add(sig);

    const verification = verifySolution(candidate, objectives, best);
    if (!verification.ok) {
      rejected.push({ seed, reason: 'La solución óptima no pasa la verificación final del simulador.' });
      continue;
    }

    return {
      ok: true,
      level: {
        ...toExportable(candidate, objectives, c),
        // Un nivel generado sólo es entregable si el buscador demostró la solvencia.
        verified: true,
        solverStatus: solved.status,
        difficulty: diff,
        difficultyExplanation: {
          score: diff.score,
          band: diff.band,
          factors: diff.factors,
          note: 'Los factores son medibles por el motor. playerDifficulty es una estimación '
            + 'sin calibrar contra partidas reales: no presentarla como dificultad medida.',
        },
      },
      objectives,
      solution: best,
      solutionsAtMinimum: solved.solutions.length,
      optimalityProven: true,
      difficulty: diff,
      difficultyExplanation: {
        score: diff.score,
        band: diff.band,
        factors: diff.factors,
        note: 'Los factores son medibles por el motor. playerDifficulty es una estimación '
          + 'sin calibrar contra partidas reales: no presentarla como dificultad medida.',
      },
      metrics: {
        physicalBombs: best.physicalBombs,
        powder: best.powder,
        ticks: best.ticks,
        solutionsAtMinimum: solved.solutions.length,
        seed,
      },
      attempts: attempt + 1,
      rejected,
    };
  }

  return {
    ok: false,
    reason: `No se encontró ningún nivel que cumpla las restricciones en ${attempts} intentos.`,
    rejected,
    hint: suggestRelaxation(c, rejected),
  };
}

function usesMechanic(level, solution, mech) {
  if (mech === 'portal') return solution.portalJumps > 0;
  if (mech === 'geyser') return level.cells.some((row) => row.some((x) => (x && x.type === 'geyser')));
  if (mech === 'fusion') return solution.fusionSteps.length > 0;
  if (mech === 'chain') return solution.chainDepth > 1;
  if (mech === 'hazard') return level.cells.some((row) => row.some((x) => x === 'crystal' || x === 'cat'));
  return true;
}

function boardShapeSignature(level) {
  const cells = level.cells.map((row) => row.map((x) => (typeof x === 'string' ? x[0] : 'p')).join('')).join('/');
  return `${level.cols}x${level.rows}:${cells}:${level.tray.join(',')}`;
}

function suggestRelaxation(c, rejected) {
  const counts = new Map();
  for (const r of rejected) {
    const key = r.reason.replace(/\d+/g, 'N').slice(0, 60);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return {
    mainObstacles: top.map(([reason, n]) => ({ reason, count: n })),
    suggestions: [
      'Aumenta el tamaño del tablero o el número de bombas disponibles.',
      'Reduce los objetivos o relaja el rango de dificultad.',
      'Quita la exigencia de solución única si la hay.',
    ],
  };
}

/** Formato JSON versionado del nivel. */
export function toExportable(level, objectives, constraints) {
  return {
    format: 'boomsolver-level',
    version: 2,
    name: level.name,
    theme: level.theme,
    cols: level.cols,
    rows: level.rows,
    cells: level.cells.map((row) => row.map((cell) => (typeof cell === 'string' ? cell : { ...cell }))),
    links: level.links || {},
    tray: level.tray.slice(),
    rules: level.rules || {},
    objectives: objectives.map((o) => ({ ...o })),
    seed: level.seed,
    generator: constraints ? {
      width: constraints.width, height: constraints.height, seed: constraints.seed,
      difficulty: constraints.difficulty, solutionCount: constraints.solutionCount,
    } : undefined,
  };
}

export { BOMB_LEVELS };
