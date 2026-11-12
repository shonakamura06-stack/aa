// ============================================================
// BoomSolver — motor de reglas determinista (autoridad única)
// ============================================================
// Todo el sistema (buscador, animación, modo manual, generador y validador)
// llama a `simulate()`. No existe ninguna segunda implementación de explosión.
//
// MODELO DE TIEMPO
//   El turno se resuelve en TICKS. Un tick = una "ola" de la referencia v21.
//   Dentro de un tick todas las explosiones se resuelven de forma SIMULTÁNEA:
//   los rayos se calculan contra el estado al INICIO del tick, el daño se
//   acumula y la destrucción se aplica al FINAL. Por tanto un objeto destruido
//   en este tick sigue bloqueando hasta que termina el tick (regla de ola).
//   Esto hace que el resultado no dependa del orden de iteración.
//
//   tick 0  → arranque: los géiseres se cargan con su temporizador.
//   tick 1  → detona la mecha.
//   tick n  → detonan los eventos cuyo dueTick === n.
//
//   La unidad del temporizador del géiser está SIN CONFIRMAR (Q5). Se declara
//   "tick de simulación" y `rules.geyserArmMode` permite cambiarla sin tocar el
//   resto del motor.

import {
  getObject, BOMB_LEVELS, HAZARD_TYPES, defaultRules, isKnownType,
} from './catalog.js';

export const ENGINE_VERSION = '2.0.0';

// ------------------------------------------------------------
// Preparación del tablero (inmutable, reutilizable por miles de búsquedas)
// ------------------------------------------------------------
/**
 * @param {{cols:number, rows:number, cells:any[][], links?:object,
 *          portals?:Array<{cell:string,color:string,pair?:string}>,
 *          rules?:object}} level
 */
export function prepareBoard(level) {
  const { cols, rows } = level;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error('Dimensiones de tablero inválidas');
  }
  const rules = { ...defaultRules(), ...(level.rules || {}) };
  const n = cols * rows;
  const types = new Array(n);
  const params = new Array(n).fill(null);
  const warnings = [];

  for (let y = 0; y < rows; y++) {
    const row = level.cells[y];
    if (!Array.isArray(row) || row.length !== cols) throw new Error(`Fila ${y} con longitud incorrecta`);
    for (let x = 0; x < cols; x++) {
      let cell = row[x];
      let type = typeof cell === 'string' ? cell : cell && cell.type;
      if (typeof type !== 'string' || !isKnownType(type)) {
        // Incógnita: se comporta como muro (no bloquea el análisis) y se avisa.
        warnings.push({ kind: 'unknown-cell', cell: `${x},${y}`, type: String(type) });
        type = 'wall';
      }
      const idx = y * cols + x;
      types[idx] = type;
      if (typeof cell === 'object' && cell !== null) {
        params[idx] = { ...cell };
        delete params[idx].type;
      }
    }
  }

  // Portales: emparejamiento explícito o por color en orden de lectura.
  const portalPairs = new Map(); // idx -> partner idx
  const portalInfo = new Map();  // idx -> {color, pair}
  const grouped = new Map();
  for (let i = 0; i < n; i++) {
    if (types[i] !== 'portal') continue;
    const p = params[i] || {};
    const color = p.color || rules.portalDefaultColor || 'blue';
    const pair = p.pair ?? null;
    params[i] = { ...(params[i] || {}), color, pair };
    portalInfo.set(i, { color, pair });
    const key = pair ? `pair:${pair}` : `color:${color}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(i);
  }
  for (const [key, list] of grouped) {
    if (list.length % 2 === 1) {
      warnings.push({
        kind: 'unpaired-portal', color: key, cells: list.map((i) => `${i % cols},${Math.floor(i / cols)}`),
        detail: 'Número impar de portales en el grupo: el último queda inerte (regla determinista, Q1).',
      });
    }
    for (let k = 0; k + 1 < list.length; k += 2) {
      portalPairs.set(list[k], list[k + 1]);
      portalPairs.set(list[k + 1], list[k]);
    }
    if (list.length > 2) {
      warnings.push({
        kind: 'ambiguous-portal-group', color: key,
        detail: 'Más de dos portales en el mismo grupo: se empareja por orden de lectura (Q1).',
      });
    }
  }

  const hp0 = new Int32Array(n).fill(-1);
  const placeable = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const def = getObject(types[i]);
    if (def.role !== 'passable') placeable[i] = 0;
    else placeable[i] = 1;
    if (def.hp !== null && def.hp !== undefined && def.hp > 0) hp0[i] = def.hp;
    if (types[i] === 'gem' || types[i] === 'crystal' || types[i] === 'cat') hp0[i] = def.hp ?? 1;
  }

  // Cables detonador→carga. Formato: { "x,y": ["x2,y2", ...] }.
  // CRÍTICO: un cable mal escrito NO puede ignorarse en silencio. Si se descarta sin
  // avisar, el solver puede declarar un nivel imposible cuando en realidad era
  // resoluble. Por eso todo enlace inválido se registra como advertencia y como error.
  const links = new Map();
  const linkErrors = [];
  const parseCoord = (raw, what) => {
    const parts = String(raw).split(',');
    if (parts.length !== 2) {
      linkErrors.push({ kind: 'bad-link', value: String(raw), reason: `${what}: se esperaba "x,y"` });
      return null;
    }
    const [x, y] = parts.map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= cols || y >= rows) {
      linkErrors.push({ kind: 'bad-link', value: String(raw), reason: `${what}: fuera del tablero (${cols}x${rows})` });
      return null;
    }
    return y * cols + x;
  };
  for (const [k, v] of Object.entries(level.links || {})) {
    const src = parseCoord(k, 'origen del cable');
    if (src === null) continue;
    const list = Array.isArray(v) ? v : [v];
    const targets = [];
    for (const raw of list) {
      const t = parseCoord(raw, 'destino del cable');
      if (t === null) continue;
      if (t === src) {
        linkErrors.push({ kind: 'bad-link', value: String(raw), reason: 'el cable apunta a su propia casilla' });
        continue;
      }
      targets.push(t);
    }
    if (targets.length !== list.length) {
      linkErrors.push({ kind: 'incomplete-link', source: String(k), from: list.length, kept: targets.length });
    }
    links.set(src, targets);
  }
  if (linkErrors.length) warnings.push(...linkErrors);

  return { cols, rows, n, types, params, hp0, placeable, links, linkErrors, registry: portalPairs, portalInfo, warnings, rules };
}

function cloneState(board) {
  return {
    hp: Int32Array.from(board.hp0),
    alive: new Uint8Array(board.n).fill(1),
    activated: new Uint8Array(board.n),
    activatedTick: new Int32Array(board.n).fill(-1),
  };
}

// ------------------------------------------------------------
// Patrones de explosión
// ------------------------------------------------------------
const DIRS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1],
};
const DIR_NAME = new Map(Object.entries(DIRS).map(([k, v]) => [`${v[0]},${v[1]}`, k]));

export function patternDirs(pattern, board, rules) {
  const { cols, rows } = board;
  const cross = (r) => ({ dirs: ['up', 'down', 'left', 'right'].map((d) => [d, r]), center: true });
  switch (pattern) {
    case 'bomb:1': case 'cross1': case 'cross:1': return cross(1);
    case 'bomb:2': case 'cross2': case 'cross:2': return cross(2);
    case 'bomb:3': case 'cross3': case 'cross:3': return cross(3);
    case 'bomb:4': case 'cross4': case 'cross:4': return cross(4);
    case 'x3x3':
      return { dirs: ['up', 'down', 'left', 'right', 'ul', 'ur', 'dl', 'dr'].map((d) => [d, 1]), center: true };
    case 'row': return { dirs: [['left', cols], ['right', cols]], center: true };
    case 'col': return { dirs: [['up', rows], ['down', rows]], center: true };
    case 'magma': return cross(Number(rules.magmaRange) || 1);
    case 'geyser': return cross(2);
    default: {
      if (String(pattern).startsWith('cross:')) return cross(Number(String(pattern).slice(6)) || 1);
      if (String(pattern).startsWith('bomb:')) return cross(Number(String(pattern).slice(5)) || 1);
      throw new Error(`Patrón de explosión desconocido: ${pattern}`);
    }
  }
}

function dynamitePattern(rules) {
  if (rules.dynamitePattern) return rules.dynamitePattern;
  return 'cross1';
}

/** Giro que produce un espejo sobre una dirección cardinal. */
export function mirrorTurn(kind, dirName) {
  const [dx, dy] = DIRS[dirName];
  if (dx && dy) return null; // los espejos no redirigen rayos diagonales (supuesto)
  // '/'  : right→up, up→right, left→down, down→left   (necesita dx,-dy→ ... )
  if (kind === 'slash') {
    return DIR_NAME.get(`${-dy},${-dx}`);
  }
  return DIR_NAME.get(`${dy},${dx}`); // '\'
}

// ------------------------------------------------------------
// Simulación de un turno
// ------------------------------------------------------------
/**
 * @param {ReturnType<typeof prepareBoard>} board
 * @param {Map<number, number>} placements  idx -> nivel de bomba (1..4)
 * @param {number} mechaIdx
 * @param {object} [ruleOverrides]
 */
export function simulate(board, placements, mechaIdx, ruleOverrides = {}) {
  const rules = { ...board.rules, ...ruleOverrides };
  const { cols, rows, n, types, params } = board;
  const st = cloneState(board);
  const world = { board, rules, st, cols, rows, n, types, params };
  const log = [];
  const ticks = [];

  const placedBombs = placements instanceof Map ? new Map(placements) : new Map();
  const exploded = new Set();

  // Validación de la jugada: el juego no deja colocar una bomba sobre un objeto
  // sólido. Si la jugada lo hace, no es una jugada legal y no se simula.
  const illegal = [];
  for (const [idx, level] of placedBombs) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= n) { illegal.push({ idx, why: 'fuera del tablero' }); continue; }
    if (!board.placeable[idx]) illegal.push({ idx, cell: coordOf(idx, cols), why: `casilla ocupada por ${types[idx]}` });
    if (!BOMB_LEVELS[level]) illegal.push({ idx, cell: coordOf(idx, cols), why: `nivel de bomba inexistente (${level})` });
  }
  if (illegal.length) {
    log.push({ tick: 0, type: 'illegal-play', details: illegal });
    return finish({
      status: 'invalid', reason: 'illegal_placement', log, ticks, st, board, placedBombs, exploded,
      metricsBase: {
        placedCount: placedBombs.size, powder: powderOf(placedBombs), illegal,
      },
    });
  }

  const mechaOk = placements instanceof Map && placements.has(mechaIdx);

  if (!mechaOk) {
    return finish({
      status: 'invalid', reason: 'no_mecha', log, ticks, st, board, placedBombs, exploded,
      metricsBase: { placedCount: placedBombs.size, powder: powderOf(placedBombs) },
    });
  }

  // Cola de eventos: {due, cell, kind, level, cause, order}
  const queue = [];
  let order = 0;
  const schedule = (item) => queue.push({ order: order++, ...item });

  // --- tick 0: arranque de géiseres (sólo si la mecha es válida) ---
  for (let i = 0; i < n; i++) {
    if (types[i] !== 'geyser') continue;
    const timer = clampTimer((params[i] && params[i].timer) ?? 3);
    const due = rules.geyserArmMode === 'tick1' ? timer + 1 : timer;
    schedule({ due, cell: i, kind: 'geyser', cause: 'armed' });
    log.push({ tick: 0, type: 'geyser-armed', cell: coordOf(i, cols), timer, dueTick: due, cause: 'detonar' });
  }
  schedule({ due: 1, cell: mechaIdx, kind: 'bomb', level: placedBombs.get(mechaIdx), cause: 'mecha' });
  exploded.add(mechaIdx);

  let hazard = null;
  let unresolved = false;
  let tickNo = 0;
  let chainDepth = 0;

  for (tickNo = 1; tickNo <= rules.maxTicks; tickNo++) {
    const due = queue.filter((q) => q.due === tickNo);
    if (due.length === 0) {
      // Un evento con due futuro mantiene la simulación viva (temporizadores).
      if (!queue.some((q) => q.due > tickNo)) break;
      ticks.push({ tick: tickNo, events: [], idle: true });
      continue;
    }
    // Orden determinista: por tipo (bomba antes que reacción) y luego por casilla.
    due.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.cell - b.cell || a.order - b.order);

    const tickLog = [];
    const damage = new Map();      // cell -> hits
    const scheduledExplosions = []; // {cell, kind, level, cause}
    const destroyedNow = new Set();
    const activatedNow = new Set();
    const explosions = [];
    const chainQueuedThisTick = new Set();

    for (const item of due) {
      const origin = coordOf(item.cell, cols);
      const kindLabel = item.kind;
      let pattern;
      if (item.kind === 'bomb') pattern = `bomb:${item.level}`;
      else if (item.kind === 'geyser') pattern = 'geyser';
      else if (item.kind === 'enemy') pattern = types[item.cell].startsWith('enemy_3') ? 'x3x3' : `cross:${item.level || 1}`;
      else if (item.kind === 'magma') pattern = 'magma';
      else if (item.kind === 'dynamite') pattern = dynamitePattern(rules);
      else throw new Error(`Evento de explosión con tipo desconocido: ${item.kind}`);

      const spec = patternDirs(pattern, board, rules);
      const rays = [];
      const hitHere = new Set();

      if (spec.center) {
        hitHere.add(item.cell);
        // Las casillas de un rayo se publican en coordenadas "x,y"; el centro
        // también, para que la UI no tenga que mezclar dos formatos.
        rays.push({ dir: 'center', cells: [coordOf(item.cell, cols)], blocked: false, jumps: [] });
      }

      for (const [dirName, range] of spec.dirs) {
        const ray = traceRay(world, {
          start: item.cell, dirName, range, source: item.cell,
          pattern, fullRange: range, rayIndex: `${item.cell}:${dirName}`,
          excludeStart: !!spec.center,
        });
        // `traceRay` trabaja con índices; la explosión se publica con coordenadas
        // "x,y" (igual que `jumps`, `source` y `cells`). Antes se publicaban
        // índices y el workbench los pintaba como si fueran coordenadas.
        rays.push({ ...ray, cells: ray.cells.map((i) => coordOf(i, cols)) });
        for (const cIdx of ray.cells) hitHere.add(cIdx);
        for (const j of ray.jumps) {
          tickLog.push({
            tick: tickNo, type: 'portal-jump', source: origin, from: j.from, to: j.to,
            dir: j.dir, rangeTransported: j.range, jumpIndex: j.jumpIndex,
          });
        }
        if (ray.loopCut) {
          tickLog.push({ tick: tickNo, type: 'portal-loop-cut', source: origin, cell: ray.loopCut.cell, dir: ray.loopCut.dir });
        }
        if (ray.blockedByPortal) {
          tickLog.push({
            tick: tickNo, type: 'portal-blocked', source: origin,
            cell: ray.blockedByPortal.cell, reason: ray.blockedByPortal.reason, target: ray.blockedByPortal.target,
          });
        }
      }

      explosions.push({
        source: origin, sourceIdx: item.cell, kind: kindLabel, level: item.level ?? null,
        pattern, rays, cells: [...hitHere].map((i) => coordOf(i, cols)),
      });
      tickLog.push({
        tick: tickNo, type: 'explosion', source: origin, kind: kindLabel,
        level: item.level ?? null, pattern, cause: item.cause,
        cells: [...hitHere].length, originIdx: item.cell,
      });

      // Bombas colocadas alcanzadas por la onda: detonan en el tick siguiente.
      for (const cIdx of hitHere) {
        if (cIdx === item.cell) continue;
        if (!placedBombs.has(cIdx)) continue;
        if (exploded.has(cIdx)) continue;
        if (chainQueuedThisTick.has(cIdx)) continue;
        chainQueuedThisTick.add(cIdx);
        scheduledExplosions.push({
          cell: cIdx, kind: 'bomb', level: placedBombs.get(cIdx), cause: 'chain',
        });
        tickLog.push({ tick: tickNo, type: 'bomb-ignited', cell: coordOf(cIdx, cols), level: placedBombs.get(cIdx), by: origin });
      }

      // Daño / activaciones. Nada se destruye hasta el final del tick.
      for (const cIdx of hitHere) {
        if (cIdx === item.cell) {
          // Un disparador que explota se consume con su propia explosión.
          const selfBeh = getObject(types[cIdx]);
          if (selfBeh.onHit && selfBeh.onHit.schedule === 'explode' && selfBeh.disappears !== false) {
            damage.set(cIdx, (damage.get(cIdx) || 0) + 1);
          }
          continue;
        }
        const t = types[cIdx];
        if (t === 'portal') continue;
        const beh = getObject(t);
        if (!st.alive[cIdx] && beh.role !== 'passable') continue;

        if (beh.role === 'hazard' && (rules.hazardDefeat !== false)) {
          if (!hazard) hazard = { cell: coordOf(cIdx, cols), index: cIdx, type: t, tick: tickNo, source: origin };
          tickLog.push({ tick: tickNo, type: 'hazard-hit', cell: coordOf(cIdx, cols), object: t, source: origin });
        }

        if (beh.hp !== null && beh.hp !== undefined && beh.hp > 0 && st.alive[cIdx]) {
          damage.set(cIdx, (damage.get(cIdx) || 0) + 1);
        }

        // Activación de interruptores / objetivos de activación.
        if (t === 'switch' && !st.activated[cIdx]) {
          activatedNow.add(cIdx);
        }

        // Disparadores que programan una nueva explosión en el tick siguiente.
        // Los que usan 'detonateLinked' se gestionan en su bloque propio.
        if (beh.onHit && beh.onHit.schedule === 'explode' && st.alive[cIdx]) {
          scheduledExplosions.push({
            cell: cIdx,
            kind: t.startsWith('enemy_') ? 'enemy' : (t === 'dynamite' ? 'dynamite' : t === 'magma_rock' ? 'magma' : t),
            level: t.startsWith('enemy_') ? Number(t.split('_')[1]) : null,
            cause: kindLabel === 'bomb' ? 'bomb' : 'chain',
          });
        }
        if (t === 'detonator' && st.alive[cIdx]) {
          const targets = board.links.get(cIdx) || [];
          tickLog.push({
            tick: tickNo, type: 'detonator-fired', cell: coordOf(cIdx, cols),
            targets: targets.map((i) => coordOf(i, cols)),
          });
          // El detonador físico también se consume al detonar sus cargas.
          if (getObject(t).disappears !== false) damage.set(cIdx, (damage.get(cIdx) || 0) + 1);
          for (const tIdx of targets) {
            const tBeh = getObject(types[tIdx]);
            if (tBeh.onHit && st.alive[tIdx]) {
              scheduledExplosions.push({
                cell: tIdx, kind: types[tIdx] === 'dynamite' ? 'dynamite' : types[tIdx], level: null,
                cause: 'detonator',
              });
            }
          }
        }

        // Bombas enemigas cuentan como disparadores (ya cubierto por beh.onHit).
        if (t === 'geyser' && rules.geyserHitBehavior === 'detonate' && st.alive[cIdx]) {
          scheduledExplosions.push({ cell: cIdx, kind: 'geyser', level: null, cause: 'explosion' });
        }
      }
    }

    // --- commit del tick ---
    for (const [cIdx, hits] of damage) {
      if (!st.alive[cIdx]) continue;
      st.hp[cIdx] = Math.max(0, st.hp[cIdx] - hits);
      const t = types[cIdx];
      const beh = getObject(t);
      tickLog.push({
        tick: tickNo, type: 'damage', cell: coordOf(cIdx, cols), object: t,
        hits, hpAfter: st.hp[cIdx], destroyed: st.hp[cIdx] <= 0 && beh.disappears !== false,
      });
      if (st.hp[cIdx] <= 0 && beh.disappears !== false) {
        st.alive[cIdx] = 0;
        destroyedNow.add(cIdx);
      }
    }
    for (const cIdx of activatedNow) {
      st.activated[cIdx] = 1;
      st.activatedTick[cIdx] = tickNo;
      tickLog.push({ tick: tickNo, type: 'activated', cell: coordOf(cIdx, cols), object: types[cIdx] });
    }

    // Reacciones a las ondas de este tick. Reglas:
    //  - una sola explosión pendiente por casilla ('alreadyQueued' sólo desempata);
    //  - si la reacción ya está programada para un tick POSTERIOR y la nueva sería
    //    más temprana, la adelanta (es lo que significa "el impacto adelanta la
    //    reacción"). Nunca la retrasa: un temporizador que ya va a vencer conserva
    //    su tick, en cualquiera de los dos órdenes de procesamiento.
    const pendingByCell = new Map(queue.filter((q) => q.due > tickNo).map((q) => [q.cell, q]));
    for (const s of scheduledExplosions) {
      const def = getObject(types[s.cell]);
      const delay = (def.onHit && def.onHit.delayTicks) || 1;
      if (s.cell === mechaIdx) continue;
      const due = tickNo + delay;
      const pending = pendingByCell.get(s.cell);
      if (pending && pending.due <= due) continue; // ya estaba programada igual o antes
      if (pending) {
        const previousDueTick = pending.due;
        pending.due = due;
        pending.kind = s.kind;
        pending.level = s.level;
        pending.cause = s.cause || 'chain';
        tickLog.push({
          tick: tickNo, type: 'scheduled-explosion-advanced', cell: coordOf(s.cell, cols),
          dueTick: due, previousDueTick, cause: s.cause || 'chain',
        });
      } else {
        schedule({ due, cell: s.cell, kind: s.kind, level: s.level, cause: s.cause || 'chain' });
        tickLog.push({
          tick: tickNo, type: 'scheduled-explosion', cell: coordOf(s.cell, cols),
          dueTick: due, cause: s.cause || 'chain', object: types[s.cell],
        });
      }
      pendingByCell.set(s.cell, pending || { cell: s.cell, due });
      chainDepth = Math.max(chainDepth, due);
      if (s.kind === 'bomb') exploded.add(s.cell);
      if (placedBombs.has(s.cell)) exploded.add(s.cell);
    }

    ticks.push({ tick: tickNo, events: tickLog, explosions, destroyed: [...destroyedNow].map((i) => coordOf(i, cols)) });
    log.push(...tickLog);

    // Quitar eventos ya consumidos.
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].due <= tickNo) queue.splice(i, 1);

    if (hazard && rules.hazardDefeat !== false) break;
    if (queue.length === 0) break;
    if (tickNo === rules.maxTicks) unresolved = queue.length > 0;
  }

  const pendingBombs = [...placedBombs.keys()].filter((k) => !exploded.has(k));
  for (const k of pendingBombs) {
    log.push({ tick: tickNo, type: 'bomb-not-detonated', cell: coordOf(k, cols), level: placedBombs.get(k) });
  }

  let status = 'resolved';
  let reason = null;
  if (hazard && rules.hazardDefeat !== false) { status = 'lose'; reason = 'hazard'; }
  else if (unresolved) { status = 'invalid'; reason = 'unresolved'; }
  else if (pendingBombs.length > 0) { status = 'invalid'; reason = 'disconnected'; }

  return finish({
    status, reason, log, ticks, st, board, placedBombs, exploded,
    metricsBase: {
      placedCount: placedBombs.size,
      powder: powderOf(placedBombs),
      tickCount: tickNo,
      chainDepth: chainDepth > 0 ? chainDepth : 1,
      hazardsHit: hazard ? 1 : 0,
      hazard,
      pendingBombs,
      portalJumps: log.filter((e) => e.type === 'portal-jump').length,
      destroyed: countDestroyed(board, st),
      activated: countActivated(st),
      uniquePlacements: countUnique(placedBombs, board),
    },
  });
}

function clampTimer(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function kindRank(k) {
  switch (k) {
    case 'bomb': return 0;
    case 'enemy': return 1;
    case 'geyser': return 2;
    case 'dynamite': return 3;
    case 'magma': return 4;
    default: return 5;
  }
}

function coordOf(idx, cols) {
  return `${idx % cols},${Math.floor(idx / cols)}`;
}

export function cellIndex(x, y, cols) { return y * cols + x; }

function powderOf(placements) {
  let p = 0;
  for (const lvl of placements.values()) p += (BOMB_LEVELS[lvl] || { powder: 0 }).powder;
  return p;
}

function countDestroyed(board, st) {
  let c = 0;
  for (let i = 0; i < board.n; i++) if (!st.alive[i] && board.hp0[i] > 0) c++;
  return c;
}
function countActivated(st) {
  let c = 0;
  for (let i = 0; i < st.activated.length; i++) if (st.activated[i]) c++;
  return c;
}
function countUnique(placements, board) {
  const set = new Set();
  for (const [idx, lvl] of placements) set.add(`${board.types[idx]}@${idx}:${lvl}`);
  return set.size;
}

// ------------------------------------------------------------
// Trazado de un rayo (incluye espejos, portales y bloqueos)
// ------------------------------------------------------------
/**
 * Devuelve {cells:[idx], jumps:[], loopCut, blockedByPortal, dirFinal}.
 * El rayo NO incluye la casilla de origen.
 */
export function traceRay(world, { start, dirName, range, source, fullRange = range, rayIndex = '', excludeStart = true }) {
  const { board, cols, rows, n, types, params, rules, st } = world;
  const cells = [];
  const jumps = [];
  const visitedPortals = new Set();
  let blockedByPortal = null;
  let loopCut = null;
  let pending = [{ idx: start, dir: dirName, remaining: range, full: fullRange, jumpsLeft: rules.portalMaxJumps }];

  let guard = 0;
  const guardMax = 4096;
  const seen = new Set();
  let finalDir = dirName;

  while (pending.length) {
    if (++guard > guardMax) { loopCut = { cell: coordOf(pending[0].idx, cols), dir: pending[0].dir }; break; }
    const leg = pending.shift();
    let idx = leg.idx;
    let dir = leg.dir;
    let remaining = leg.remaining;
    let [dx, dy] = DIRS[dir];
    finalDir = dir;

    while (remaining > 0) {
      const nx = (idx % cols) + dx;
      const ny = Math.floor(idx / cols) + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;
      const cIdx = ny * cols + nx;
      const t = types[cIdx];
      const def = getObject(t);
      remaining--;
      idx = cIdx;
      if (!excludeStart) {
        // Patrón sin casilla central explícita: el origen del patrón cuenta como alcanzado.
        if (!seen.has(cIdx)) { seen.add(cIdx); cells.push(cIdx); }
      }

      // Portal: transporta el rayo al compañero conservando dirección y alcance.
      if (t === 'portal') {
        const partner = board.registry.get(cIdx);
        const pInfo = board.portalInfo.get(cIdx) || {};
        const key = `${cIdx}:${dir}`;
        if (visitedPortals.has(key) || leg.jumpsLeft <= 0) {
          loopCut = { cell: coordOf(cIdx, cols), dir };
          break;
        }
        visitedPortals.add(key);
        if (partner === undefined) {
          blockedByPortal = { cell: coordOf(cIdx, cols), reason: 'unpaired', target: null };
          break;
        }
        const pt = types[partner];
        const pDef = getObject(pt);
        if (pDef.blocks === 'always' || pDef.blocks === 'wave') {
          blockedByPortal = { cell: coordOf(cIdx, cols), reason: 'target-blocked', target: coordOf(partner, cols) };
          break;
        }
        const transported = rules.portalRangeMode === 'remaining' ? remaining + 1 : leg.full;
        jumps.push({
          from: coordOf(cIdx, cols), to: coordOf(partner, cols), dir,
          range: transported, jumpIndex: jumps.length, color: pInfo.color || null,
        });
        if (!seen.has(cIdx)) { seen.add(cIdx); cells.push(cIdx); }
        pending.push({ idx: partner, dir, remaining: transported, full: transported, jumpsLeft: leg.jumpsLeft - 1 });
        break; // este tramo termina: el rayo sale por el compañero
      }

      if (!seen.has(cIdx)) { seen.add(cIdx); cells.push(cIdx); }

      // Espejos: redirigen 90° consumiendo un paso de alcance.
      if (def.redirect) {
        const turned = mirrorTurn(def.redirect, dir);
        if (!turned) break; // diagonal: sin convención confirmada → se detiene
        dir = turned;
        [dx, dy] = DIRS[dir];
        continue;
      }

      // Bloqueos
      if (def.blocks === 'always') break;
      if (def.blocks === 'wave') {
        if (t === 'geyser' && rules.geyserBlocks === false) continue;
        if (def.hp === null || def.hp === undefined) break;
        if (st.alive[cIdx]) break; // si ya fue destruido en un tick anterior, no bloquea
        continue;
      }
      if (t === 'magma_rock' && rules.magmaBlocks === false) continue;
      if (rules.bombBlocks) {
        // Bombas colocadas sin detonar bloquean.
        const isPlacedBomb = false; // las bombas no forman parte del tablero fijo
        if (isPlacedBomb) break;
      }
    }
  }
  return { cells, jumps, loopCut, blockedByPortal, dir: finalDir };
}

// ------------------------------------------------------------
// Resultado final
// ------------------------------------------------------------
function finish({ status, reason, log, ticks, st, board, placedBombs, exploded, metricsBase }) {
  return {
    engineVersion: ENGINE_VERSION,
    status, reason,
    log, ticks,
    // Estado final serializable
    final: {
      alive: Array.from(st.alive),
      hp: Array.from(st.hp),
      activated: Array.from(st.activated),
      activatedTick: Array.from(st.activatedTick),
    },
    placements: [...placedBombs.entries()].map(([idx, level]) => ({
      idx, level, cell: coordOf(idx, board.cols),
    })),
    metrics: metricsBase,
    // Compatibilidad hacia atrás con el visor v21: waves = ticks
    waves: ticks.filter((t) => !t.idle).map((t) => ({
      events: (t.explosions || []).map((ex) => ({
        bx: Number(ex.source.split(',')[0]), by: Number(ex.source.split(',')[1]),
        lvl: ex.level ?? 'dyn',
        cells: ex.cells.map((c) => c.split(',').map(Number)),
      })),
      tick: t.tick,
    })),
  };
}

/** Ejecuta y verifica un turno contra un objetivo (usado por solver y tests). */
export function detonatesAllPlaced(result) {
  return result.metrics.pendingBombs.length === 0;
}
