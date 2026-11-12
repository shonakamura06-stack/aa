// ============================================================
// BoomSolver — análisis de una jugada para el workbench (§8)
// ============================================================
// Funciones PURAS sobre el resultado del motor y la salida del solver.
// No tocan el DOM: así se pueden probar y el workbench sólo pinta.
//
// Lo que el encargo pide poder ver y aquí se calcula:
//   · comparar dos soluciones (qué cambia y por qué importa)
//   · ondas individuales (qué casillas alcanza CADA rayo de cada explosión)
//   · recorrido por portal (orden de saltos, dirección y alcance transportado)
//   · temporizador por géiser (cuándo se arma, cuándo vence, cuándo estalla)
//   · daño recibido por objeto (tick, origen, golpes, resultado)
//   · cadenas (quién enciende a quién y en qué tick)
//   · etiqueta honesta de optimalidad (demostrado / mejor conocido / sin demostrar)

// ------------------------------------------------------------
// Ondas individuales
// ------------------------------------------------------------
export function waveBreakdown(result) {
  const waves = [];
  for (const tick of result.ticks || []) {
    if (tick.idle) continue;
    for (const ex of tick.explosions || []) {
      const rays = (ex.rays || []).map((r, i) => ({
        index: i,
        dir: r.dir,
        cells: r.cells.slice(),
        jumps: (r.jumps || []).map((j) => ({ from: j.from, to: j.to, dir: j.dir, range: j.range })),
        blocked: !!r.blocked,
        loopCut: r.loopCut || null,
        blockedByPortal: r.blockedByPortal || null,
      }));
      waves.push({
        tick: tick.tick,
        source: ex.source,
        kind: ex.kind,
        level: ex.level,
        pattern: ex.pattern,
        cells: ex.cells.slice(),
        rays,
        rayCount: rays.length,
        // Casillas alcanzadas sólo por la suma de rayos (sin la del centro).
        unionFromRays: [...new Set(rays.flatMap((r) => r.cells))],
      });
    }
  }
  return waves;
}

// ------------------------------------------------------------
// Recorrido por portal
// ------------------------------------------------------------
export function portalTrail(result) {
  const jumps = (result.log || []).filter((e) => e.type === 'portal-jump');
  const cuts = (result.log || []).filter((e) => e.type === 'portal-loop-cut');
  const blocked = (result.log || []).filter((e) => e.type === 'portal-blocked');
  return {
    jumps: jumps.map((j, i) => ({
      order: i + 1,
      tick: j.tick,
      source: j.source,
      from: j.from,
      to: j.to,
      dir: j.dir,
      rangeTransported: j.rangeTransported,
      // Para que el workbench pueda dibujar la entrada y la salida por separado.
      entry: j.from,
      exit: j.to,
    })),
    loopCuts: cuts.map((c) => ({ tick: c.tick, cell: c.cell, dir: c.dir })),
    blocked: blocked.map((b) => ({ tick: b.tick, cell: b.cell, reason: b.reason, target: b.target })),
    total: jumps.length,
  };
}

// ------------------------------------------------------------
// Temporizadores de géiser
// ------------------------------------------------------------
export function geyserTimers(result) {
  const armed = (result.log || []).filter((e) => e.type === 'geyser-armed');
  const explosions = [];
  for (const tick of result.ticks || []) {
    for (const ex of tick.explosions || []) {
      if (ex.kind === 'geyser') explosions.push({ tick: tick.tick, source: ex.source, cells: ex.cells });
    }
  }
  const advanced = (result.log || []).filter((e) => e.type === 'scheduled-explosion-advanced');
  return armed.map((a) => {
    const boom = explosions.find((e) => e.source === a.cell);
    const adv = advanced.find((e) => e.cell === a.cell);
    return {
      cell: a.cell,
      timer: a.timer,
      armedTick: a.tick,
      // Vencimiento ORIGINAL al armarse y vencimiento EFECTIVO tras posibles
      // adelantos: si se mezclan, el visor miente sobre cuándo estalla.
      armedDueTick: a.dueTick,
      dueTick: adv ? adv.dueTick : a.dueTick,
      advancedFrom: adv ? adv.previousDueTick : null,
      explodedTick: boom ? boom.tick : null,
      cells: boom ? boom.cells : [],
      // Honestidad: el motor cuenta ticks de simulación, no segundos del juego.
      unit: 'tick de simulación',
    };
  });
}

// ------------------------------------------------------------
// Daño recibido
// ------------------------------------------------------------
export function damageLedger(result, board) {
  const rows = [];
  for (const ev of result.log || []) {
    if (ev.type !== 'damage' && ev.type !== 'hazard-hit' && ev.type !== 'activated') continue;
    rows.push({
      tick: ev.tick,
      cell: ev.cell,
      object: ev.object || (board ? board.types[indexOfCell(ev.cell, board.cols)] : null),
      hits: ev.hits ?? null,
      hpAfter: ev.hpAfter ?? null,
      destroyed: ev.destroyed === true,
      kind: ev.type,
      hazard: ev.type === 'hazard-hit',
    });
  }
  const byObject = new Map();
  for (const r of rows) {
    const k = r.object || 'desconocido';
    if (!byObject.has(k)) byObject.set(k, { object: k, cells: new Set(), hits: 0, destroyed: 0, hazard: 0 });
    const s = byObject.get(k);
    s.cells.add(r.cell);
    s.hits += r.hits || 1;
    if (r.destroyed) s.destroyed++;
    if (r.hazard) s.hazard++;
  }
  return {
    rows,
    summary: [...byObject.values()].map((s) => ({ ...s, cells: [...s.cells] })),
    hazardsReached: rows.filter((r) => r.hazard).length,
  };
}

function indexOfCell(coord, cols) {
  const [x, y] = String(coord).split(',').map(Number);
  return y * cols + x;
}

// ------------------------------------------------------------
// Cadenas
// ------------------------------------------------------------
export function chainGraph(result) {
  const edges = [];
  let seq = 0;
  for (const ev of result.log || []) {
    if (ev.type === 'bomb-ignited') {
      edges.push({
        order: seq++, tick: ev.tick, from: ev.by, to: ev.cell,
        kind: 'bomb', level: ev.level, cause: 'onda de otra bomba',
      });
    } else if (ev.type === 'scheduled-explosion') {
      edges.push({
        order: seq++, tick: ev.tick, from: null, to: ev.cell,
        kind: ev.object || 'reacción', dueTick: ev.dueTick, cause: ev.cause,
      });
    } else if (ev.type === 'detonator-fired') {
      for (const t of ev.targets || []) {
        edges.push({
          order: seq++, tick: ev.tick, from: ev.cell, to: t,
          kind: 'cable', cause: 'detonador',
        });
      }
    }
  }
  // La profundidad es el último momento tocado por la cadena: una reacción
  // programada en el tick N cuenta hasta su dueTick, no sólo hasta el disparo.
  const depth = edges.reduce((m, e) => Math.max(m, e.tick, e.dueTick || 0), 0);
  return { edges, depth, count: edges.length };
}

// ------------------------------------------------------------
// Comparar dos soluciones
// ------------------------------------------------------------
export function compareSolutions(a, b) {
  if (!a || !b) throw new Error('Se necesitan dos soluciones para comparar');
  const cellsOf = (s) => new Map(s.placements.map((p) => [p.idx, p.level]));
  const ca = cellsOf(a);
  const cb = cellsOf(b);
  const onlyA = [...ca.keys()].filter((k) => !cb.has(k));
  const onlyB = [...cb.keys()].filter((k) => !ca.has(k));
  const both = [...ca.keys()].filter((k) => cb.has(k));
  const levelChanged = both
    .filter((k) => ca.get(k) !== cb.get(k))
    .map((k) => ({ idx: k, a: ca.get(k), b: cb.get(k) }));

  const diffs = [];
  const push = (label, av, bv) => { if (av !== bv) diffs.push({ label, a: av, b: bv }); };
  push('bombas físicas', a.physicalBombs, b.physicalBombs);
  push('pólvora', a.powder, b.powder);
  push('ticks', a.ticks, b.ticks);
  push('profundidad de cadena', a.chainDepth, b.chainDepth);
  push('saltos de portal', a.portalJumps, b.portalJumps);
  push('fusiones', a.fusions, b.fusions);
  push('objetos destruidos', a.destroyed, b.destroyed);
  push('mecha', a.mecha.idx, b.mecha.idx);

  const objectiveDiffs = [];
  const byLabel = new Map((b.checks || []).map((c) => [c.label, c]));
  for (const c of a.checks || []) {
    const other = byLabel.get(c.label);
    if (!other) { objectiveDiffs.push({ label: c.label, a: c.ok, b: null }); continue; }
    if (c.ok !== other.ok || c.done !== other.done) {
      objectiveDiffs.push({ label: c.label, a: `${c.done}/${c.total}`, b: `${other.done}/${other.total}` });
    }
  }

  // Veredicto en palabras: qué gana cada una.
  const verdicts = [];
  if (a.physicalBombs !== b.physicalBombs) {
    verdicts.push(`A usa ${a.physicalBombs} bomba(s) y B ${b.physicalBombs}.`);
  }
  if (a.powder !== b.powder) {
    verdicts.push(`A gasta ${a.powder} de pólvora y B ${b.powder}.`);
  }
  if (!verdicts.length) verdicts.push('Empate en bombas y pólvora: la diferencia es de forma, no de coste.');

  return {
    samePhysical: onlyA.length === 0 && onlyB.length === 0 && levelChanged.length === 0,
    onlyA, onlyB, levelChanged,
    diffs, objectiveDiffs, verdicts,
    identical: diffs.length === 0 && objectiveDiffs.length === 0 && onlyA.length === 0
      && onlyB.length === 0 && levelChanged.length === 0,
  };
}

// ------------------------------------------------------------
// Etiqueta de optimalidad
// ------------------------------------------------------------
export function optimalityBanner(solveResult) {
  const r = solveResult || {};
  const map = {
    optimalityProven: {
      label: 'Óptimo DEMOSTRADO',
      tone: 'ok',
      detail: 'Se agotó la enumeración: no existe ninguna jugada con menos bombas que cumpla los objetivos.',
    },
    bestKnown: {
      label: 'MEJOR CONOCIDO (no demostrado)',
      tone: 'warn',
      detail: 'La búsqueda no terminó. Lo mostrado es lo mejor encontrado hasta el límite, no el óptimo.',
    },
    timedOut: {
      label: 'SIN SOLUCIÓN CONOCIDA (tiempo agotado)',
      tone: 'warn',
      detail: 'No se encontró solución antes del límite. Esto NO significa que el nivel sea imposible.',
    },
    cancelled: {
      label: 'CANCELADO',
      tone: 'warn',
      detail: 'Búsqueda detenida por el usuario. Resultado parcial.',
    },
    unknown: {
      label: 'SIN DEMOSTRAR',
      tone: 'warn',
      detail: 'No se encontró solución y la enumeración no fue exhaustiva. No se puede afirmar imposibilidad.',
    },
    infeasible: {
      label: 'IMPOSIBLE DEMOSTRADO',
      tone: 'err',
      detail: 'Se agotó la enumeración sin ninguna jugada ganadora.',
    },
    'invalid-level': {
      label: 'NIVEL ILEGIBLE',
      tone: 'err',
      detail: 'El nivel tiene datos inválidos (por ejemplo un cable mal escrito): no se evalúa.',
    },
  };
  const base = map[r.status] || {
    label: `ESTADO DESCONOCIDO (${r.status})`, tone: 'warn', detail: 'Estado no reconocido por el visor.',
  };
  return {
    ...base,
    status: r.status,
    proofNote: r.proofNote || null,
    exhaustive: r.exhaustive ?? null,
    incompleteReason: r.incompleteReason ?? null,
    totalKnown: r.totalKnown ?? (r.solutions || []).length,
    shown: (r.solutions || []).length,
    truncated: !!r.truncatedPresentation,
  };
}

// ------------------------------------------------------------
// Explicación de "por qué funciona"
// ------------------------------------------------------------
export function explainPlay(sol, { board = null } = {}) {
  if (!sol) return { lines: ['No hay jugada seleccionada.'] };
  const lines = [];
  lines.push(`Jugada con ${sol.physicalBombs} bomba(s) física(s) y ${sol.powder} de pólvora `
    + `(mecha en ${sol.mecha.cell ?? sol.mecha.idx}).`);

  const byLevel = new Map();
  for (const p of sol.placements) byLevel.set(p.level, (byLevel.get(p.level) || 0) + 1);
  lines.push('Bombas: ' + [...byLevel.entries()].map(([l, n]) => `${n}×N${l}`).join(', ')
    + (sol.fusions ? ` (con ${sol.fusions} fusión(es): ${sol.fusionSteps.join(' → ')})` : ''));

  // Cadenas: quién enciende a quién.
  const chain = chainGraph({ log: sol.log || [] });
  if (chain.edges.length) {
    lines.push(`Cadena de ${chain.edges.length} reacción(es):`);
    for (const e of chain.edges.slice(0, 12)) {
      lines.push(`  · tick ${e.tick}: ${e.from ? `${e.from} enciende ` : ''}${e.to} (${e.kind}${e.cause ? `, ${e.cause}` : ''})`);
    }
    if (chain.edges.length > 12) lines.push(`  · … y ${chain.edges.length - 12} más`);
  }

  const trail = portalTrail({ log: sol.log || [] });
  if (trail.total) {
    lines.push(`Recorrido por portales (${trail.total} salto(s)):`);
    for (const j of trail.jumps) {
      lines.push(`  · tick ${j.tick}: entra en ${j.from} y sale por ${j.to} hacia ${j.dir}, alcance ${j.rangeTransported}`);
    }
    if (trail.loopCuts.length) lines.push(`  · ${trail.loopCuts.length} bucle(s) cortado(s) para no detonar infinitamente`);
    if (trail.blocked.length) lines.push(`  · ${trail.blocked.length} salto(s) bloqueado(s)`);
  }

  for (const c of sol.checks || []) {
    lines.push(`${c.ok ? '✔' : '✘'} ${c.label}: ${c.detail || `${c.done}/${c.total}`}${c.optional ? ' (opcional)' : ''}`);
  }
  if (sol.failures && sol.failures.length) {
    for (const f of sol.failures) lines.push(`✘ ${f.message}`);
  }
  void board;
  return { lines, chain, trail };
}

export function describeCell(idx, board) {
  if (!board || idx == null) return String(idx);
  const x = idx % board.cols;
  const y = Math.floor(idx / board.cols);
  return `C${x + 1}F${y + 1}`;
}
