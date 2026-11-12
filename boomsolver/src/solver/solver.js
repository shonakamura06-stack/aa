// ============================================================
// BoomSolver — buscador de soluciones
// ============================================================
// Tres modos, dos métricas separadas y estado de optimalidad HONESTO.
//
// Enumeración COMPLETA (no heurística) sobre los conjuntos de bombas:
//   1. cargamentos alcanzables por fusiones desde la bandeja,
//   2. submultisets de tamaño k (k = bombas físicas colocadas),
//   3. combinaciones de k casillas colocables,
//   4. asignación de niveles a esas casillas (multiset),
//   5. para cada conjunto, cada bomba se prueba como mecha.
// Toda solución se valida con el mismo motor y con goals.evaluateOutcome.
//
// Poda aplicada (la única) es por CANDIDATOS IMPOSIBLES: una bomba que por sí
// sola ya alcanza un peligro no puede formar parte de una jugada ganadora,
// porque el daño a un peligro es monótono con el conjunto de bombas. El resto
// de la búsqueda es exhaustiva, así que `optimalityProven` es demostrable.

import { BOMB_LEVELS, getObject } from '../core/catalog.js';
import { prepareBoard, simulate } from '../core/engine.js';
import { evaluateOutcome, normalizeObjectives } from '../core/goals.js';

// ------------------------------------------------------------
// Fusiones
// ------------------------------------------------------------
export function canFuse(l1, l2, mode) {
  if (l1 === l2) return l1 < 4 ? l1 + 1 : 0;
  if (mode === 'sum') {
    if (l1 === 1 && l2 >= 2 && l2 < 4) return l2 + 1;
    if (l2 === 1 && l1 >= 2 && l1 < 4) return l1 + 1;
    return 0;
  }
  return 0;
}

const keyOf = (levels) => levels.slice().sort((a, b) => b - a).join(',');

/**
 * Estados (multisets) alcanzables desde la bandeja aplicando fusiones legales.
 * ordenadas por pólvora: [{levels, powder, fusions, steps}]
 */
export function fusionStates(tray, mode) {
  const states = new Map();
  const push = (levels, fusions, steps) => {
    const k = keyOf(levels);
    const cur = states.get(k);
    if (cur && cur.fusions <= fusions) return false;
    states.set(k, {
      levels: levels.slice().sort((a, b) => b - a),
      powder: levels.reduce((a, l) => a + BOMB_LEVELS[l].powder, 0),
      fusions,
      steps: steps.slice(),
    });
    return true;
  };
  const start = tray.slice().sort((a, b) => b - a);
  push(start, 0, []);
  const queue = [[start, []]];
  let guard = 0;
  while (queue.length && guard++ < 50000) {
    const [items, steps] = queue.shift();
    const seenPair = new Set();
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const res = canFuse(items[i], items[j], mode);
        if (!res) continue;
        const pk = `${items[i]}+${items[j]}`;
        if (seenPair.has(pk)) continue;
        seenPair.add(pk);
        const next = items.filter((_, k) => k !== i && k !== j);
        next.push(res);
        next.sort((a, b) => b - a);
        const nextSteps = [...steps, `N${Math.max(items[i], items[j])} + N${Math.min(items[i], items[j])} → N${res}`];
        if (push(next, steps.length + 1, nextSteps)) queue.push([next, nextSteps]);
      }
    }
  }
  return [...states.values()].sort((a, b) => a.powder - b.powder || a.fusions - b.fusions);
}

function subMultisets(levels, k) {
  const out = new Map();
  const rec = (i, chosen) => {
    if (chosen.length === k) { out.set(keyOf(chosen), chosen.slice()); return; }
    if (i >= levels.length || levels.length - i < k - chosen.length) return;
    chosen.push(levels[i]); rec(i + 1, chosen); chosen.pop();
    rec(i + 1, chosen);
  };
  rec(0, []);
  return [...out.values()];
}

/**
 * Cargamentos posibles de exactamente k bombas físicas.
 * Cada cargamento indica qué bombas de la bandeja usa y qué fusiones hacen falta.
 */
export function loadoutsOfSize(tray, mode, k, states = fusionStates(tray, mode)) {
  const map = new Map();
  for (const st of states) {
    if (st.levels.length < k) continue;
    for (const sub of subMultisets(st.levels, k)) {
      const key = keyOf(sub);
      if (map.has(key)) continue;
      const need = multiset(sub);
      const have = multiset(tray);
      let direct = true;
      for (const [l, c] of need) if ((have.get(l) || 0) < c) direct = false;
      map.set(key, {
        levels: key.split(',').map(Number),
        powder: sub.reduce((a, l) => a + BOMB_LEVELS[l].powder, 0),
        usesNoFusion: direct,
        fusionSteps: direct ? [] : st.steps.slice(),
        trayLevels: st.levels.slice(),
        fusions: direct ? 0 : st.steps.length,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.powder - b.powder || a.fusions - b.fusions);
}

export function permutationsOfMultiset(levels) {
  const counts = multiset(levels);
  const uniq = [...counts.keys()].sort((a, b) => b - a);
  const out = [];
  const cur = [];
  const rec = () => {
    if (cur.length === levels.length) { out.push(cur.slice()); return; }
    for (const l of uniq) {
      if (!counts.get(l)) continue;
      counts.set(l, counts.get(l) - 1); cur.push(l);
      rec();
      cur.pop(); counts.set(l, counts.get(l) + 1);
    }
  };
  rec();
  return out;
}

export function combinations(n, k) {
  const out = [];
  const cur = [];
  const rec = (start) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < n; i++) { cur.push(i); rec(i + 1); cur.pop(); }
  };
  rec(0);
  return out;
}

function multiset(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

// ------------------------------------------------------------
// Análisis de candidatos
// ------------------------------------------------------------
function analyseCandidates(board, rules) {
  const cells = [];
  for (let i = 0; i < board.n; i++) if (board.placeable[i]) cells.push(i);
  const cands = new Map();
  for (const level of [1, 2, 3, 4]) {
    for (const cell of cells) {
      const res = simulate(board, new Map([[cell, level]]), cell, rules);
      const targetsHit = new Map();
      for (let i = 0; i < board.n; i++) {
        if (board.hp0[i] <= 0) continue;
        const before = board.hp0[i];
        const after = res.final.hp[i];
        if (after >= 0 && after < before) targetsHit.set(i, before - after);
      }
      cands.set(`${cell}:${level}`, {
        cell, level, targetsHit,
        safe: res.status !== 'lose' && res.reason !== 'hazard',
        status: res.status, reason: res.reason,
        resolves: res.status === 'resolved',
        enemiesHit: [...targetsHit.keys()].filter((i) => board.types[i].startsWith('enemy_')),
      });
    }
  }
  return { cells, cands };
}

// ------------------------------------------------------------
// solve()
// ------------------------------------------------------------
/**
 * @param {object} level  {cols, rows, cells, links?, tray, rules?}
 * @param {Array|object} objectives  spec de goals.js
 * @param {object} options
 */
export function solve(level, objectives, options = {}) {
  const t0 = now();
  const opts = {
    mode: 'fewest_bombs',
    maxSolutions: 200,
    maxBombs: null,
    maxPowder: null,
    timeBudgetMs: 20000,
    shouldCancel: () => false,
    onProgress: null,
    extraRules: {},
    ...options,
  };

  const { positive, negative } = normalizeObjectives(objectives);
  // Los objetivos opcionales no condicionan la solución: se informan, no se exigen.
  // Si sólo hay opcionales, no hay nada que resolver.
  const requiredCount = [...positive, ...negative].filter((o) => o.required !== false).length;
  if (requiredCount === 0) {
    return infeasibleResult(
      'No hay objetivos obligatorios: el nivel sólo tiene condiciones opcionales, '
      + 'así que ninguna jugada puede considerarse necesaria ni mínima.',
      opts.mode,
    );
  }
  if (!positive.length && !negative.length) {
    return infeasibleResult('No hay objetivos definidos: un nivel sin objetivo no es resoluble.', opts.mode);
  }
  if (!Array.isArray(level.tray) || level.tray.length === 0) {
    return infeasibleResult('La bandeja está vacía: sin bombas no hay jugada posible.', opts.mode);
  }

  // La bandeja debe contener niveles de bomba reales: si no, la fusión produce
  // estados imposibles y el buscador fallaría con una excepción en vez de explicar.
  const trayLevels = (level.tray || []).map(Number);
  const badTray = trayLevels.filter((l) => !BOMB_LEVELS[l]);
  if (badTray.length) {
    return infeasibleResult(
      `La bandeja contiene niveles de bomba inexistentes: ${[...new Set(badTray)].join(', ')}. `
      + `Los niveles válidos son ${Object.keys(BOMB_LEVELS).join(', ')}.`,
      opts.mode,
    );
  }

  const board = prepareBoard({ ...level, rules: { ...(level.rules || {}), ...(opts.extraRules || {}) } });
  const stats = {
    evaluations: 0, simulated: 0, prunedUnsafe: 0, prunedCoverage: 0,
    prunedDuplicate: 0, fusionStates: 0, candidates: 0, combos: 0, solutionsRejectedBySimulator: 0,
  };
  const reasons = [];

  // Un cable mal escrito invalidaría la física entera del nivel: no se puede
  // declarar nada sobre él hasta corregirlo (evita una falsa imposibilidad).
  if (board.linkErrors && board.linkErrors.length) {
    return {
      ...infeasibleResult(
        'El nivel tiene cables ilegibles, así que su física es desconocida: '
        + board.linkErrors.map((e) => `${e.reason} (${e.value})`).join('; ')
        + '. Corrige el formato "x,y" antes de resolver.',
        opts.mode, null, board,
      ),
      status: 'invalid-level',
      note: 'Cables inválidos: no se evalúa el nivel.',
      linkErrors: board.linkErrors,
    };
  }

  const { cells, cands } = analyseCandidates(board, board.rules);
  stats.candidates = cands.size;
  if (!cells.length) return infeasibleResult('No hay casillas donde colocar bombas.', opts.mode, stats, board);

  // --- imposibilidad declarada, con causa concreta ---
  const present = new Map();
  board.types.forEach((t, i) => { if (board.hp0[i] > 0) present.set(t, (present.get(t) || 0) + 1); });
  const mentionedMissing = [];
  for (const o of [...positive, ...negative]) {
    for (const t of (o.types || (o.type ? [o.type] : []))) {
      if (!present.has(t)) mentionedMissing.push(getObject(t)?.name || t);
    }
  }
  if (mentionedMissing.length) {
    reasons.push(`La directriz menciona objetos que no están en el tablero: ${[...new Set(mentionedMissing)].join(', ')}.`);
  }

  const targetCells = new Set();
  for (const o of positive) {
    if (o.required === false) continue; // opcional: no exige cobertura
    if (o.kind !== 'destroy' && o.kind !== 'activate' && o.kind !== 'destroyAt') continue;
    if (o.cells && o.kind !== 'activate') {
      for (const c of o.cells) {
        const [x, y] = String(c).split(',').map(Number);
        if (board.hp0[y * board.cols + x] > 0) targetCells.add(y * board.cols + x);
      }
      continue;
    }
    const types = o.types || (o.type ? [o.type] : []);
    for (let i = 0; i < board.n; i++) if (board.hp0[i] > 0 && types.includes(board.types[i])) targetCells.add(i);
  }
  const reachable = new Set();
  for (const c of cands.values()) {
    if (!c.safe) continue;
    for (const t of c.targetsHit.keys()) reachable.add(t);
  }
  const unreachable = [...targetCells].filter((i) => !reachable.has(i));
  if (unreachable.length) {
    const groups = new Map();
    for (const i of unreachable) {
      const k = board.types[i];
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(cellName(i, board.cols));
    }
    reasons.push(`Ninguna bomba puede alcanzar: ${[...groups.entries()].map(([t, l]) => `${getObject(t)?.name || t} en ${l.join(' ')}`).join('; ')}. ` +
      'Causa probable: muro/objeto que bloquea el rayo o alcance insuficiente.');
    return infeasibleResult(reasons.join(' '), opts.mode, stats, board);
  }
  if (board.rules.requireEnemyBombs) {
    const enemies = [];
    for (let i = 0; i < board.n; i++) if (board.types[i].startsWith('enemy_')) enemies.push(i);
    const unreach = enemies.filter((i) => !reachable.has(i));
    if (unreach.length) {
      reasons.push(`El nivel exige detonar ${enemies.length} bomba(s) enemiga(s) y ${unreach.length} no son alcanzables.`);
    }
  }

  // --- enumeración ---
  const states = fusionStates(level.tray, board.rules.fusionMode);
  stats.fusionStates = states.size;
  const maxAvailable = Math.max(...states.map((s) => s.levels.length));
  const K = Math.max(0, Math.min(opts.maxBombs ?? maxAvailable, maxAvailable, cells.length));
  // Protección de memoria. CRÍTICO: cuando se activa, el resultado NUNCA puede
  // declararse 'infeasible'. Se declara 'bestKnown' con exhaustive=false y se
  // informa exactamente de cuántas combinaciones quedaron sin probar.
  const comboCap = Number.isFinite(opts.comboCap) ? Math.max(1, opts.comboCap) : 20000;

  const solutions = [];
  const seenSig = new Set();
  const seenOutcome = new Set();
  let cancelled = false;
  let timedOut = false;
  let combosSkipped = 0;
  let levelsIncomplete = 0;      // niveles de k donde no se probó todo
  let stoppedAtLevel = 0;        // primer k no agotado
  let truncatedByCap = false;

  const limits = () => {
    if (opts.shouldCancel()) { cancelled = true; return true; }
    if (now() - t0 > opts.timeBudgetMs) { timedOut = true; return true; }
    return false;
  };

  const evaluateCombo = (assignment, loadout) => {
    const map = new Map(assignment.map((lvl, i) => [assignment.cells[i], lvl]));
    for (const mecha of map.keys()) {
      if (limits()) return;
      stats.evaluations++;
      const res = simulate(board, map, mecha, board.rules);
      stats.simulated++;
      const verdict = evaluateOutcome(board, res, objectives);
      if (!verdict.win) continue;
      const sig = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([i, l]) => `${i}:${l}`).join('|') + `@${mecha}`;
      if (seenSig.has(sig)) { stats.prunedDuplicate++; continue; }
      seenSig.add(sig);
      const outcomeSig = `${res.final.alive.join('')}/${res.final.activated.join('')}`;
      seenOutcome.add(outcomeSig);
      solutions.push({
        signature: sig,
        placements: [...map.entries()].map(([idx, level]) => ({ idx, level, cell: cellName(idx, board.cols) })),
        mecha: { idx: mecha, cell: cellName(mecha, board.cols) },
        physicalBombs: map.size,
        powder: res.metrics.powder,
        ticks: res.metrics.tickCount,
        chainDepth: res.metrics.chainDepth,
        portalJumps: res.metrics.portalJumps,
        destroyed: res.metrics.destroyed,
        activated: res.metrics.activated,
        fusionSteps: loadout.fusionSteps,
        fusions: loadout.fusions,
        trayLevels: loadout.trayLevels,
        checks: verdict.checks,
        failures: verdict.failures,
        outcomeSig,
        waves: res.waves,
        log: res.log,
        resultSummary: {
          status: res.status, reason: res.reason, ticks: res.metrics.tickCount,
          powder: res.metrics.powder, destroyed: res.metrics.destroyed,
          activated: res.metrics.activated, portalJumps: res.metrics.portalJumps,
        },
      });
    }
  };

  let provenUpTo = 0;
  let stoppedMidLevel = false;

  outer:
  for (let k = 1; k <= K; k++) {
    const loadouts = loadoutsOfSize(level.tray, board.rules.fusionMode, k, states)
      .filter((l) => opts.maxPowder == null || l.powder <= opts.maxPowder);
    if (!loadouts.length) break;

    // Un cargamento sólo es viable si cada nivel cabe en alguna casilla segura.
    const safeLevels = new Set();
    for (const c of cands.values()) if (c.safe) safeLevels.add(`${c.cell}:${c.level}`);
    const usable = loadouts.filter((lo) => lo.levels.every((lvl) => cells.some((cell) => safeLevels.has(`${cell}:${lvl}`))));
    if (!usable.length) { stats.prunedUnsafe++; continue; }

    const combos = combinations(cells.length, k);
    const skippedHere = Math.max(0, combos.length - comboCap);
    if (skippedHere > 0) {
      combosSkipped += skippedHere;
      truncatedByCap = true;
      levelsIncomplete++;
      if (!stoppedAtLevel) stoppedAtLevel = k;
    }
    const comboList = combos.slice(0, comboCap);

    for (const lo of usable) {
      for (const combo of comboList) {
        if (limits()) break outer;
        stats.combos++;
        const chosenCells = combo.map((i) => cells[i]);
        for (const perm of permutationsOfMultiset(lo.levels)) {
          // Sólo asignaciones factibles: todas las casillas con candidato seguro.
          let ok = true;
          for (let i = 0; i < perm.length; i++) {
            const c = cands.get(`${chosenCells[i]}:${perm[i]}`);
            if (!c || !c.safe) { ok = false; break; }
          }
          if (!ok) { stats.prunedUnsafe++; continue; }
          perm.cells = chosenCells;
          evaluateCombo(perm, lo);
          if (cancelled || timedOut) break outer;
        }
      }
    }

    if (cancelled || timedOut) { stoppedMidLevel = true; break; }
    provenUpTo = k;
    if (opts.mode === 'fewest_bombs' && solutions.length > 0) break; // mínimos completos
    if (opts.mode !== 'fewest_bombs' && solutions.length > 0 && k >= K) break;
    if (opts.onProgress) opts.onProgress({ k, solutions: solutions.length, stats, elapsedMs: now() - t0 });
  }

  stats.timeMs = now() - t0;
  const sorted = sortByMode(solutions, opts.mode);
  let list = sorted;
  let pareto = null;
  if (opts.mode === 'pareto') {
    pareto = computePareto(sorted);
    list = pareto.map((p) => p.solution);
  }

  // Estado de optimalidad HONESTO. Regla dura: 'infeasible' sólo si la
  // enumeración fue exhaustiva. Cualquier límite de seguridad produce
  // 'bestKnown' o 'timedOut', jamás una falsa imposibilidad.
  const exhaustive = !cancelled && !timedOut && combosSkipped === 0 && levelsIncomplete === 0;
  let status;
  if (cancelled) status = 'cancelled';
  else if (timedOut) status = solutions.length ? 'bestKnown' : 'timedOut';
  else if (solutions.length === 0) status = exhaustive ? 'infeasible' : 'unknown';
  else if (!exhaustive) status = 'bestKnown';
  else status = 'optimalityProven';

  const groups = new Map();
  for (const s of list) {
    if (!groups.has(s.outcomeSig)) groups.set(s.outcomeSig, []);
    groups.get(s.outcomeSig).push(s.signature);
  }

  const bestBombs = list.length ? Math.min(...list.map((s) => s.physicalBombs)) : null;
  const bestPowder = list.length ? Math.min(...list.map((s) => s.powder)) : null;

  const proofNote = buildProofNote(status, provenUpTo, opts.mode, list, {
    kSearch: K, incompleteReason: cancelled ? 'cancelled' : timedOut ? 'timeout' : combosSkipped > 0 ? 'combination-cap' : null,
  });

  return {
    mode: opts.mode,
    status,
    optimalityProven: status === 'optimalityProven',
    proofNote,
    provenUpToBombs: provenUpTo,
    bounds: {
      lowerPhysicalBombs: bestBombs,
      upperPhysicalBombs: bestBombs,
      lowerPowder: bestPowder,
      maxBombsSearched: K,
    },
    solutions: list.slice(0, opts.maxSolutions),
    totalKnown: list.length,
    exhaustive,
    incompleteReason: cancelled ? 'cancelled' : timedOut ? 'timeout'
      : combosSkipped > 0 ? 'combination-cap' : null,
    firstUnprovenBombs: stoppedAtLevel || (timedOut || cancelled ? provenUpTo + 1 : null),
    truncatedPresentation: list.length > opts.maxSolutions,
    presentationLimit: opts.maxSolutions,
    groups: [...groups.entries()].map(([sig, variants]) => ({ outcomeSig: sig, variants })),
    pareto: pareto ? pareto.map((p) => ({ physicalBombs: p.physicalBombs, powder: p.powder, signature: p.solution.signature })) : null,
    stats,
    reasons,
    board,
    elapsedMs: stats.timeMs,
    engineVersion: '2.0.0',
    combosSkipped,
    levelsIncomplete,
    stoppedMidLevel,
  };
}

function buildProofNote(status, provenUpTo, mode, list, maxBombsSearched) {
  if (status === 'optimalityProven') {
    const b = list.length ? Math.min(...list.map((s) => s.physicalBombs)) : null;
    if (mode === 'fewest_bombs') {
      return `Enumeración exhaustiva completada: ${list.length} solución(es) con el mínimo de ${b} bomba(s) física(s). ` +
        'Todas verificadas por el mismo simulador.';
    }
    const powderBest = list.length ? Math.min(...list.map((s) => s.powder)) : null;
    return `Enumeración exhaustiva completada hasta ${maxBombsSearched.kSearch} bomba(s) física(s) (${provenUpTo} niveles de tamaño agotados): ` +
      `mínimo de pólvora ${powderBest} entre ${list.length} soluciones no dominadas. ` +
      'Ninguna jugada con menos bombas usa menos pólvora.';
  }
  if (status === 'bestKnown') {
    const why = maxBombsSearched && maxBombsSearched.incompleteReason
      ? maxBombsSearched.incompleteReason : 'límite de tiempo o de combinaciones';
    return `Mejor solución encontrada hasta ahora. La enumeración NO terminó (${why}): ` +
      `mínimo de bombas probado sólo hasta ${provenUpTo}. No se puede afirmar que sea el óptimo global.`;
  }
  if (status === 'cancelled') {
    return `Búsqueda cancelada por el usuario tras probar hasta ${provenUpTo} bomba(s). Resultado = mejor encontrado, no óptimo demostrado.`;
  }
  if (status === 'timedOut') {
    return 'Se agotó el tiempo antes de encontrar ninguna solución. Estado: sin solución conocida (no equivale a "imposible").';
  }
  if (status === 'unknown') {
    return 'No se encontró solución, pero la enumeración NO fue exhaustiva (límite de combinaciones o de tiempo). ' +
      'NO se puede afirmar que el nivel sea imposible: sube comboCap/timeBudgetMs o reduce maxBombs para demostrarlo.';
  }
  return 'No se encontró ninguna solución dentro de los límites explorados.';
}

function sortByMode(arr, mode) {
  if (mode === 'least_powder') {
    return arr.slice().sort((a, b) => a.powder - b.powder || a.physicalBombs - b.physicalBombs || a.ticks - b.ticks);
  }
  return arr.slice().sort((a, b) => a.physicalBombs - b.physicalBombs || a.powder - b.powder || a.ticks - b.ticks);
}

export function computePareto(solutions) {
  const pts = solutions.slice().sort((a, b) => a.physicalBombs - b.physicalBombs || a.powder - b.powder);
  const front = [];
  let bestPowder = Infinity;
  for (const s of pts) {
    if (s.powder < bestPowder) { front.push({ physicalBombs: s.physicalBombs, powder: s.powder, solution: s }); bestPowder = s.powder; }
  }
  return front;
}

function cellName(idx, cols) {
  return `C${(idx % cols) + 1}F${Math.floor(idx / cols) + 1}`;
}
function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function infeasibleResult(message, mode, stats = null, board = null) {
  return {
    mode, status: 'infeasible', optimalityProven: false,
    proofNote: message,
    note: message, // alias usado por la UI y el CLI
    provenUpToBombs: 0,
    bounds: { lowerPhysicalBombs: null, upperPhysicalBombs: null, lowerPowder: null, maxBombsSearched: 0 },
    solutions: [], totalKnown: 0, truncatedPresentation: false, presentationLimit: 0,
    groups: [], pareto: null,
    stats: stats || { evaluations: 0, simulated: 0 },
    reasons: [message],
    board,
    elapsedMs: 0,
    combosSkipped: 0,
    stoppedMidLevel: false,
  };
}

/** Verificación independiente de una solución (generador, validador, UI). */
export function verifySolution(level, objectives, solution) {
  const board = prepareBoard(level);
  const map = new Map(solution.placements.map((p) => [p.idx, p.level]));
  const res = simulate(board, map, solution.mecha.idx, board.rules);
  const verdict = evaluateOutcome(board, res, objectives);
  return { ok: verdict.win, verdict, result: res, board };
}

/** Comprueba que el mínimo declarado no se puede batir con menos bombas. */
export function proveMinimum(level, objectives, options = {}) {
  const k = options.maxBombs;
  const r = solve({ ...level, tray: level.tray }, objectives, { ...options, maxBombs: k });
  return {
    status: r.status, solutions: r.solutions.length, provenUpTo: r.provenUpToBombs,
    note: r.note, reasons: r.reasons, exhaustive: r.exhaustive,
  };
}
