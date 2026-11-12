// ============================================================
// BoomSolver — interfaz del banco de pruebas
// ============================================================
// Importa EXACTAMENTE el mismo motor y buscador que las pruebas de Node.
// No hay una segunda implementación de la física en la UI.

import { OBJECTS, BOMB_LEVELS, defaultRules, getObject, paletteTypes } from '/src/core/catalog.js';
import { prepareBoard, simulate } from '/src/core/engine.js';
import { evaluateOutcome, parseDirective } from '/src/core/goals.js';
import { solve } from '/src/solver/solver.js';
import { generate, toExportable } from '/src/generator/generator.js';
import { scoreDifficulty } from '/src/difficulty.js';
import {
  waveBreakdown, portalTrail, geyserTimers, damageLedger, chainGraph,
  compareSolutions, optimalityBanner, explainPlay,
} from '/src/analysis/sessions.js';

const ICONS = {
  empty: '·', void: '░', wall: '🧱', rock_soft: '🪨', rock_hard: '⛰️', gem: '💎',
  chest_wood: '🧰', chest_iron: '🔒', switch: '🔴', crystal: '🔷', cat: '🐱',
  dynamite: '🧨', detonator: '📡', magma_rock: '🌋', mirror_slash: '／',
  mirror_backslash: '＼', portal: '🌀', geyser: '♨️',
  enemy_1: '👾', enemy_2: '👾', enemy_3: '👾', enemy_4: '👾',
};

const state = {
  cols: 8,
  rows: 5,
  cells: [],
  links: {},
  tray: [1, 1, 1, 2],
  mode: 'edit',           // edit | simulate
  brush: 'gem',
  sim: { placements: new Map(), mecha: null, selectedLevel: 1, ticks: [], tickIdx: -1, result: null },
  solutions: [],
  selectedSol: 0,
  objectiveSpec: [],
  rules: defaultRules(),
  playTimer: null,
  search: { cancelled: false, running: false },
  activeTab: 'log',
  lastSolve: null,
  levelName: 'Nivel sin título',
};

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const idx = (x, y) => y * state.cols + x;
const coord = (i) => `${i % state.cols},${Math.floor(i / state.cols)}`;
const cellName = (i) => `C${(i % state.cols) + 1}F${Math.floor(i / state.cols) + 1}`;

function emptyCells(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill('empty'));
}

function setStatus(text, cls = 'ok') {
  const el = $('status');
  el.textContent = text;
  el.className = 'pill ' + cls;
}

function currentLevel() {
  return {
    cols: state.cols,
    rows: state.rows,
    cells: state.cells.map((row) => row.map((c) => (typeof c === 'string' ? c : { ...c }))),
    links: { ...state.links },
    tray: state.tray.slice(),
    rules: state.rules,
    name: state.levelName,
  };
}

// ------------------------------------------------------------
// Tablero
// ------------------------------------------------------------
function renderBoard() {
  const board = $('board');
  board.style.gridTemplateColumns = `repeat(${state.cols}, 46px)`;
  board.replaceChildren();
  const simResult = state.sim.result;
  const uptoTick = state.sim.tickIdx;
  const hit = new Set();
  const destroyed = new Set();
  if (simResult && uptoTick >= 0) {
    for (const t of simResult.ticks) {
      if (t.tick > uptoTick) break;
      for (const ex of t.explosions || []) for (const c of ex.cells) hit.add(c);
      for (const c of t.destroyed || []) destroyed.add(c);
    }
  }
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const cell = state.cells[y][x];
      const type = typeof cell === 'string' ? cell : cell.type;
      const def = getObject(type) || { role: 'passable', name: type };
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cell ' + def.role;
      el.dataset.pos = `${x},${y}`;
      el.setAttribute('role', 'gridcell');
      const key = `${x},${y}`;
      if (hit.has(key)) el.classList.add('hit');
      if (destroyed.has(key)) el.classList.add('resolved');
      if (type === 'portal') el.textContent = '🌀';
      else if (type === 'geyser') el.textContent = `♨️${cell.timer ?? ''}`;
      else el.textContent = ICONS[type] || type.slice(0, 2);
      const i = idx(x, y);
      const placed = state.sim.placements.get(i);
      if (placed) {
        el.classList.add('bomb');
        el.textContent = `N${placed}`;
        if (state.sim.mecha === i) el.classList.add('mecha');
      }
      const badge = document.createElement('span');
      badge.className = 'badge';
      if (type === 'portal') badge.textContent = (cell.color || 'blue') === 'blue' ? 'B' : 'P';
      el.appendChild(badge);
      const coordEl = document.createElement('span');
      coordEl.className = 'coord';
      coordEl.textContent = `${x + 1},${y + 1}`;
      el.appendChild(coordEl);
      el.addEventListener('click', () => onCellClick(x, y));
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); setMecha(x, y); });
      board.appendChild(el);
    }
  }
  $('levelSize').textContent = `${state.cols}×${state.rows}`;
  $('trayInfo').textContent = traySummary();
}

function traySummary() {
  const counts = new Map();
  for (const l of state.tray) counts.set(l, (counts.get(l) || 0) + 1);
  const parts = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${n}×N${l}`);
  const powder = state.tray.reduce((a, l) => a + BOMB_LEVELS[l].powder, 0);
  return `Bandeja: ${parts.join(', ') || 'vacía'} · ${powder} de pólvora`;
}

function renderPalette() {
  const pal = $('palette');
  pal.replaceChildren();
  for (const type of paletteTypes()) {
    const def = getObject(type);
    if (!def) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost' + (state.brush === type ? ' active' : '');
    b.innerHTML = `<span aria-hidden="true">${ICONS[type] || '▫'}</span> ${def.name}` +
      (def.status !== 'confirmed' ? ' <em title="regla no confirmada en el juego">?</em>' : '');
    b.title = def.evidence || '';
    b.addEventListener('click', () => { state.brush = type; renderPalette(); });
    pal.appendChild(b);
  }
}

function onCellClick(x, y) {
  if (state.mode === 'simulate') {
    placeBomb(x, y);
    return;
  }
  const i = idx(x, y);
  if (state.brush === 'portal') {
    const existing = state.cells[y][x];
    const color = existing && existing.type === 'portal' && existing.color === 'blue' ? 'purple' : 'blue';
    state.cells[y][x] = { type: 'portal', color };
  } else if (state.brush === 'geyser') {
    const existing = state.cells[y][x];
    const timer = existing && existing.type === 'geyser' ? (existing.timer % 5) + 1 : 1;
    state.cells[y][x] = { type: 'geyser', timer };
  } else {
    state.cells[y][x] = state.brush;
  }
  state.links = Object.fromEntries(Object.entries(state.links).filter(([k]) => k !== `${x},${y}`));
  void i;
  renderBoard();
}

function placeBomb(x, y) {
  const i = idx(x, y);
  if (state.sim.placements.has(i)) {
    state.sim.placements.delete(i);
    if (state.sim.mecha === i) state.sim.mecha = null;
  } else {
    const level = state.sim.selectedLevel;
    if (!level) { setStatus('Elige una bomba de la bandeja', 'warn'); return; }
    const def = getObject(typeof state.cells[y][x] === 'string' ? state.cells[y][x] : state.cells[y][x].type);
    if (!def || def.role !== 'passable') { setStatus('Esa casilla no admite bombas', 'warn'); return; }
    state.sim.placements.set(i, level);
    if (state.sim.mecha == null) state.sim.mecha = i;
  }
  state.sim.ticks = [];
  state.sim.tickIdx = -1;
  renderBoard();
  renderSimTray();
}

function setMecha(x, y) {
  if (state.mode !== 'simulate') return;
  const i = idx(x, y);
  if (!state.sim.placements.has(i)) { setStatus('La mecha debe ser una bomba colocada', 'warn'); return; }
  state.sim.mecha = i;
  renderBoard();
}

// ------------------------------------------------------------
// Bandeja de simulación
// ------------------------------------------------------------
function renderSimTray() {
  const box = $('simTray');
  box.replaceChildren();
  const used = new Map();
  for (const lvl of state.sim.placements.values()) used.set(lvl, (used.get(lvl) || 0) + 1);
  const available = new Map();
  for (const lvl of state.tray) available.set(lvl, (available.get(lvl) || 0) + 1);
  for (const [lvl, n] of available) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bomb-chip' + (state.sim.selectedLevel === lvl ? ' active' : '');
    const left = n - (used.get(lvl) || 0);
    chip.textContent = `N${lvl} · ${left} libre(s) · ${BOMB_LEVELS[lvl].powder} pólvora`;
    chip.disabled = left <= 0;
    chip.addEventListener('click', () => { state.sim.selectedLevel = lvl; renderSimTray(); });
    box.appendChild(chip);
  }
  if (!available.size) box.innerHTML = '<span class="hint">Añade bombas a la bandeja del nivel.</span>';
}

// ------------------------------------------------------------
// Reglas
// ------------------------------------------------------------
function readRules() {
  state.rules = {
    ...defaultRules(),
    fusionMode: $('fusionMode').value,
    dynamitePattern: $('dynamitePattern').value,
    magmaRange: Number($('magmaRange').value),
    magmaBlocks: $('magmaBlocks').checked,
    objectsBlock: $('objectsBlock').checked,
    bombBlocks: $('bombBlocks').checked,
    requireEnemyBombs: $('requireEnemy').checked,
    geyserHitBehavior: $('geyserDetonate').checked ? 'detonate' : 'ignore',
    portalRangeMode: $('portalRangeMode').value,
  };
  return state.rules;
}

// ------------------------------------------------------------
// Directriz y objetivos
// ------------------------------------------------------------
function renderObjectives() {
  const box = $('objectiveList');
  box.replaceChildren();
  if (!state.objectiveSpec.length) {
    box.innerHTML = '<span class="chip">Sin objetivos: escribe una directriz o usa el botón.</span>';
    return;
  }
  for (const o of state.objectiveSpec) {
    const chip = document.createElement('span');
    chip.className = 'chip' + (o.negative ? ' bad' : '');
    chip.textContent = `${o.negative ? '✗' : '✓'} ${o.kind} ${(o.types || [o.type]).join('/')}${o.count ? ` ×${o.count}` : ''}${o.simultaneous ? ' (a la vez)' : ''}`;
    box.appendChild(chip);
  }
}

function interpretDirective() {
  const level = currentLevel();
  const text = $('directive').value.trim();
  if (!text) { setStatus('Escribe una directriz', 'warn'); return; }
  const board = prepareBoard(level);
  const parsed = parseDirective(text, board);
  state.objectiveSpec = [...parsed.positive, ...parsed.negative];
  renderObjectives();
  const notes = [];
  if (parsed.unparsed.length) notes.push(`Sin interpretar: ${parsed.unparsed.join(' / ')}`);
  notes.push(...parsed.questions);
  setStatus(notes.length ? 'Directriz interpretada con dudas' : 'Directriz interpretada', notes.length ? 'warn' : 'ok');
  $('proofNote').textContent = notes.length ? notes.join(' ') : `Objetivos: ${state.objectiveSpec.length}.`;
}

// ------------------------------------------------------------
// Buscador
// ------------------------------------------------------------
async function runSolver() {
  if (state.search.running) return;
  readRules();
  const level = currentLevel();
  if (!state.objectiveSpec.length) interpretDirective();
  if (!state.objectiveSpec.length) {
    setStatus('No hay objetivos que cumplir', 'err');
    return;
  }
  state.search.running = true;
  state.search.cancelled = false;
  $('btnSolve').disabled = true;
  $('btnCancel').disabled = false;
  setStatus('Buscando…', 'warn');
  $('stStatus').textContent = '…';
  await new Promise((r) => setTimeout(r, 30)); // deja pintar el estado

  const mode = $('solveMode').value;
  const t0 = performance.now();
  const result = solve(level, state.objectiveSpec, {
    mode,
    maxSolutions: 200,
    timeBudgetMs: 15000,
    shouldCancel: () => state.search.cancelled,
  });
  const ms = Math.round(performance.now() - t0);

  state.solutions = result.solutions;
  state.selectedSol = 0;
  state.search.running = false;
  $('btnSolve').disabled = false;
  $('btnCancel').disabled = true;

  $('stStatus').textContent = result.status;
  $('stBombs').textContent = result.solutions.length ? result.solutions[0].physicalBombs : '—';
  $('stPowder').textContent = result.solutions.length ? result.solutions[0].powder : '—';
  $('stCount').textContent = result.totalKnown + (result.truncatedPresentation ? ` (${result.solutions.length} mostradas)` : '');
  $('stTime').textContent = `${ms} ms`;
  $('stEval').textContent = result.stats ? result.stats.evaluations.toLocaleString('es') : '—';
  $('proofNote').textContent = result.proofNote + (result.reasons && result.reasons.length ? ' · ' + result.reasons.join(' ') : '');
  state.lastSolve = result;
  renderOptimality(result);
  syncCompareSelects();

  const paretoBox = $('paretoBox');
  paretoBox.replaceChildren();
  if (result.pareto && result.pareto.length) {
    paretoBox.hidden = false;
    for (const p of result.pareto) {
      const d = document.createElement('div');
      d.className = 'pt';
      d.textContent = `${p.physicalBombs} bomba(s) · ${p.powder} pólvora`;
      paretoBox.appendChild(d);
    }
  } else paretoBox.hidden = true;

  renderSolutions();
  setStatus(result.optimalityProven ? 'Óptimo demostrado' : result.status, result.optimalityProven ? 'ok' : 'warn');
}

function renderOptimality(result) {
  const banner = optimalityBanner(result);
  const box = $('optimalityBanner');
  if (!box) return;
  box.hidden = false;
  box.className = `banner ${banner.tone}`;
  $('optLabel').textContent = banner.label;
  $('optDetail').textContent = banner.detail
    + (banner.truncated ? ` Se muestran ${banner.shown} de ${banner.totalKnown} (lista recortada).` : '');
}

function syncCompareSelects() {
  const a = $('cmpA');
  const b = $('cmpB');
  if (!a || !b) return;
  a.replaceChildren();
  b.replaceChildren();
  state.solutions.forEach((sol, i) => {
    const label = `${i + 1}: ${sol.physicalBombs} bomba(s) · ${sol.powder} pólvora · ${sol.signature}`;
    for (const sel of [a, b]) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = label;
      sel.appendChild(o);
    }
  });
  if (state.solutions.length > 1) b.value = '1';
}

function renderSolutions() {
  const box = $('solutions');
  box.replaceChildren();
  if (!state.solutions.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Sin soluciones con las reglas y objetivos actuales. Revisa la directriz, la bandeja y las reglas.';
    box.appendChild(p);
    return;
  }
  state.solutions.forEach((sol, i) => {
    const card = document.createElement('div');
    card.className = 'sol' + (i === state.selectedSol ? ' selected' : '');
    const fusions = sol.fusionSteps.length ? sol.fusionSteps.join(' · ') : 'sin fusiones';
    card.innerHTML = `
      <div class="sol-head"><span>Solución ${i + 1}</span><span class="tag">${sol.ticks} tick(s)</span></div>
      <div class="sol-metrics">
        <span class="tag bombs">${sol.physicalBombs} bomba(s) física(s)</span>
        <span class="tag powder">${sol.powder} pólvora equiv.</span>
        <span class="tag">${sol.fusions} fusión(es)</span>
        ${sol.portalJumps ? `<span class="tag">${sol.portalJumps} salto(s) de portal</span>` : ''}
      </div>
      <ul>
        <li><b>Mecha:</b> ${sol.mecha.cell}</li>
        <li><b>Bombas:</b> ${sol.placements.map((p) => `${p.cell}=N${p.level}`).join(' · ')}</li>
        <li><b>Fusiones:</b> ${fusions}</li>
        <li><b>Objetivos:</b> ${sol.checks.map((c) => `${c.label} ${c.done}/${c.total}`).join(' · ')}</li>
      </ul>`;
    const acts = document.createElement('div');
    acts.className = 'acts';
    const b1 = document.createElement('button');
    b1.type = 'button'; b1.className = 'ghost'; b1.textContent = 'Cargar en simulador';
    b1.addEventListener('click', () => loadSolution(i));
    const b2 = document.createElement('button');
    b2.type = 'button'; b2.className = 'ghost'; b2.textContent = 'Explicar';
    b2.addEventListener('click', () => explainSolution(sol));
    acts.append(b1, b2);
    card.appendChild(acts);
    card.addEventListener('click', (ev) => {
      if (ev.target.tagName === 'BUTTON') return;
      state.selectedSol = i; renderSolutions(); renderBoard();
    });
    box.appendChild(card);
  });
}

function renderComparison() {
  const out = $('cmpResult');
  out.replaceChildren();
  if (state.solutions.length < 2) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = state.solutions.length === 1
      ? 'Sólo hay una solución óptima con estas reglas: no hay nada que comparar.'
      : 'Busca primero soluciones: no hay ninguna cargada.';
    out.appendChild(p);
    return;
  }
  const ia = Number($('cmpA').value);
  const ib = Number($('cmpB').value);
  const diff = compareSolutions(state.solutions[ia], state.solutions[ib]);
  const lines = [`A = solución ${ia + 1} · B = solución ${ib + 1}`];
  if (diff.identical) lines.push('Las dos jugadas son idénticas: mismo conjunto de bombas, mecha y coste.');
  else {
    for (const v of diff.verdicts) lines.push(v);
    if (diff.onlyA.length) lines.push(`Bombas sólo en A: ${diff.onlyA.map((i) => cellName(i)).join(', ')}`);
    if (diff.onlyB.length) lines.push(`Bombas sólo en B: ${diff.onlyB.map((i) => cellName(i)).join(', ')}`);
    for (const c of diff.levelChanged) {
      lines.push(`${cellName(c.idx)}: en A es N${c.a}, en B es N${c.b}`);
    }
    for (const d of diff.diffs) lines.push(`${d.label}: A=${d.a} · B=${d.b}`);
    for (const o of diff.objectiveDiffs) lines.push(`${o.label}: A=${o.a} · B=${o.b}`);
  }
  out.textContent = lines.join('\n');
}

function explainSolution(sol) {
  const { lines } = explainPlay(sol);
  switchTab('log');
  $('simLog').textContent = lines.join('\n');
  $('simLog').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function loadSolution(i) {
  const sol = state.solutions[i];
  if (!sol) return;
  state.mode = 'simulate';
  state.sim.placements = new Map(sol.placements.map((p) => [p.idx, p.level]));
  state.sim.mecha = sol.mecha.idx;
  state.sim.ticks = [];
  state.sim.tickIdx = -1;
  state.sim.result = null;
  state.tray = sol.trayLevels.slice();
  $('btnEditMode').classList.remove('active');
  $('btnSimMode').classList.add('active');
  renderBoard();
  renderSimTray();
  setStatus('Jugada cargada: pulsa Detonar', 'ok');
}

// ------------------------------------------------------------
// Simulación
// ------------------------------------------------------------
function detonate() {
  readRules();
  const level = currentLevel();
  const board = prepareBoard(level);
  if (!state.sim.placements.size) { setStatus('Coloca al menos una bomba', 'warn'); return; }
  if (state.sim.mecha == null) { setStatus('Marca la mecha (clic derecho)', 'warn'); return; }
  const result = simulate(board, state.sim.placements, state.sim.mecha, state.rules);
  state.sim.result = result;
  state.sim.tickIdx = result.ticks.length - 1;
  renderBoard();
  renderSimLog(result);
  renderAnalysis();
  const verdict = state.objectiveSpec.length ? evaluateOutcome(board, result, state.objectiveSpec) : null;
  if (result.status === 'lose') setStatus('Derrota: peligro alcanzado', 'err');
  else if (result.status === 'invalid') setStatus(`Jugada no válida: ${result.reason}`, 'err');
  else if (verdict && !verdict.win) setStatus('Explosión válida pero objetivos incompletos', 'warn');
  else setStatus('Jugada válida', 'ok');
}

function renderSimLog(result) {
  const box = $('simLog');
  const cls = { explosion: 'explosion', 'portal-jump': 'portal', damage: 'damage', 'hazard-hit': 'lose' };
  const lines = [];
  lines.push(`Estado final: ${result.status}${result.reason ? ' (' + result.reason + ')' : ''}`);
  lines.push(`Bombas físicas: ${result.metrics.placedCount} · pólvora: ${result.metrics.powder} · ticks: ${result.metrics.tickCount}`);
  for (const t of result.ticks) {
    lines.push(`<span class="tick">TICK ${t.tick}</span>`);
    for (const e of t.events) {
      const c = cls[e.type] || '';
      const parts = [e.type];
      if (e.cell) parts.push(e.cell);
      if (e.object) parts.push(`[${e.object}]`);
      if (e.dir) parts.push(`dir=${e.dir}`);
      if (e.rangeTransported != null) parts.push(`alcance=${e.rangeTransported}`);
      if (e.to) parts.push(`→ ${e.to}`);
      if (e.hpAfter != null) parts.push(`hp=${e.hpAfter}`);
      lines.push(`  <span class="${c}">${parts.join(' ')}</span>`);
    }
  }
  if (state.sim.result && state.sim.result.status === 'resolved') lines.push('<span class="win">Turno resuelto sin peligros.</span>');
  box.innerHTML = lines.join('\n');
}

// ------------------------------------------------------------
// Paneles de análisis (pestañas)
// ------------------------------------------------------------
function switchTab(name) {
  state.activeTab = name;
  for (const tab of document.querySelectorAll('#analysisTabs .tab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== name;
  }
}

function renderAnalysis() {
  const res = state.sim.result;
  if (!res) {
    for (const id of ['panelWaves', 'panelPortals', 'panelGeysers', 'panelChain', 'panelDamage']) {
      const el = $(id);
      if (el) el.textContent = 'Detona una jugada para ver este análisis.';
    }
    return;
  }

  const waves = waveBreakdown(res);
  $('panelWaves').innerHTML = waves.length
    ? waves.map((w) => `<div class="tick">TICK ${w.tick} · ${w.kind}${w.level ? ' N' + w.level : ''} en ${w.source} (${w.pattern})</div>`
      + w.rays.map((r) => `<div>  rayo ${r.index + 1} dir=${r.dir}: ${r.cells.join(' ')}`
        + (r.jumps.length ? ` · ${r.jumps.length} salto(s): ${r.jumps.map((j) => `${j.from}→${j.to} (${j.dir}, alcance ${j.range})`).join(' ')}` : '')
        + (r.loopCut ? ' · bucle cortado' : '')
        + (r.blockedByPortal ? ` · bloqueado en portal (${r.blockedByPortal.reason})` : '')
        + '</div>').join('')).join('')
    : 'Sin explosiones registradas.';

  const trail = portalTrail(res);
  $('panelPortals').textContent = trail.total === 0 && !trail.loopCuts.length && !trail.blocked.length
    ? 'Esta jugada no atraviesa ningún portal.'
    : [
      `Saltos: ${trail.total}`,
      ...trail.jumps.map((j) => `  ${j.order}. tick ${j.tick}: entra en ${j.from} → sale por ${j.to}, dirección ${j.dir}, alcance transportado ${j.rangeTransported}`),
      ...(trail.loopCuts.length ? ['Bucles cortados:', ...trail.loopCuts.map((c) => `  tick ${c.tick}: ${c.cell} dir ${c.dir}`)] : []),
      ...(trail.blocked.length ? ['Saltos bloqueados:', ...trail.blocked.map((b) => `  tick ${b.tick}: ${b.cell} (${b.reason})`)] : []),
    ].join('\n');

  const geysers = geyserTimers(res);
  $('panelGeysers').textContent = geysers.length
    ? [
      'Unidad: tick de simulación (NO son segundos del juego; la unidad real no está confirmada).',
      ...geysers.map((g) => `  ${g.cell}: temporizador ${g.timer} · armado en tick ${g.armedTick} · vence en ${g.dueTick}`
        + (g.advancedFrom != null ? ` · adelantado desde el tick ${g.advancedFrom}` : '')
        + (g.explodedTick != null ? ` · estalla en el tick ${g.explodedTick}` : ' · no llegó a estallar')),
    ].join('\n')
    : 'Este nivel no tiene géiseres.';

  const chain = chainGraph(res);
  $('panelChain').textContent = chain.count
    ? [
      `Reacciones: ${chain.count} · última en el tick ${chain.depth}`,
      ...chain.edges.map((e) => `  ${e.order + 1}. tick ${e.tick}: ${e.from ? e.from + ' → ' : ''}${e.to} (${e.kind}${e.cause ? ', ' + e.cause : ''})`),
    ].join('\n')
    : 'Sin cadenas: sólo explotaron las bombas de la mecha.';

  const ledger = damageLedger(res, res.board || null);
  $('panelDamage').textContent = ledger.summary.length
    ? [
      `Objetos dañados: ${ledger.summary.length} · peligros alcanzados: ${ledger.hazardsReached}`,
      ...ledger.summary.map((s) => `  ${s.object}: ${s.hits} golpe(s) en ${s.cells.join(' ')}, destruidos ${s.destroyed}${s.hazard ? ' · PELIGRO' : ''}`),
      '',
      ...ledger.rows.map((r) => `  tick ${r.tick}: ${r.object} en ${r.cell}`
        + (r.hpAfter != null ? ` hp ${r.hpAfter}` : '')
        + (r.destroyed ? ' destruido' : '')) ,
    ].join('\n')
    : 'Ningún objeto recibió daño.';
}

function stepTick(dir) {
  const res = state.sim.result;
  if (!res) { setStatus('Detona primero', 'warn'); return; }
  state.sim.tickIdx = Math.max(0, Math.min(res.ticks.length - 1, state.sim.tickIdx + dir));
  renderBoard();
  setStatus(`Mostrando hasta el tick ${res.ticks[state.sim.tickIdx].tick}`, 'ok');
}

function playTicks() {
  const res = state.sim.result;
  if (!res) { setStatus('Detona primero', 'warn'); return; }
  clearInterval(state.playTimer);
  state.sim.tickIdx = 0;
  renderBoard();
  state.playTimer = setInterval(() => {
    if (state.sim.tickIdx + 1 >= res.ticks.length) { clearInterval(state.playTimer); return; }
    state.sim.tickIdx++;
    renderBoard();
  }, 650);
}

function resetSim() {
  clearInterval(state.playTimer);
  state.sim.placements = new Map();
  state.sim.mecha = null;
  state.sim.ticks = [];
  state.sim.tickIdx = -1;
  state.sim.result = null;
  $('simLog').replaceChildren();
  renderBoard();
  renderSimTray();
}

// ------------------------------------------------------------
// Generador
// ------------------------------------------------------------
function runGenerator() {
  const constraints = {
    width: Number($('gWidth').value),
    height: Number($('gHeight').value),
    seed: Number($('gSeed').value),
    targets: { gem: Number($('gGems').value), chest_wood: Number($('gChests').value) },
    hazards: { crystal: Number($('gCrystals').value) },
    mechanics: { portalPairs: Number($('gPortals').value), geysers: Number($('gGeysers').value), mirrors: Number($('gMirrors').value) },
    difficulty: $('gDifficulty').value,
    solutionCount: $('gSolutions').value,
    maxAttempts: 30,
  };
  setStatus('Generando…', 'warn');
  const t0 = performance.now();
  const r = generate(constraints, { timeBudgetMs: 2500 });
  const ms = Math.round(performance.now() - t0);
  const box = $('genResult');
  box.replaceChildren();
  if (!r.ok) {
    const p = document.createElement('p');
    p.textContent = `${r.reason} (${ms} ms)`;
    box.appendChild(p);
    for (const rej of r.rejected.slice(0, 5)) {
      const li = document.createElement('div');
      li.className = 'hint';
      li.textContent = `· semilla ${rej.seed}: ${rej.reason}`;
      box.appendChild(li);
    }
    if (r.hint) {
      const s = document.createElement('p');
      s.className = 'hint';
      s.textContent = 'Sugerencias: ' + r.hint.suggestions.join(' ');
      box.appendChild(s);
    }
    setStatus('No se encontró nivel válido', 'err');
    return;
  }
  const info = document.createElement('div');
  info.innerHTML = `<span class="band">${r.difficulty.bandLabel}</span> · ${r.metrics.physicalBombs} bomba(s) · ${r.metrics.powder} pólvora · ${r.metrics.solutionsAtMinimum} solución(es) mínima(s) · semilla ${r.metrics.seed} · ${ms} ms`;
  box.appendChild(info);
  for (const line of r.difficulty.explanation) {
    const d = document.createElement('div');
    d.className = 'hint';
    d.textContent = '· ' + line;
    box.appendChild(d);
  }
  const use = document.createElement('button');
  use.type = 'button';
  use.className = 'primary';
  use.textContent = 'Cargar en el tablero';
  use.addEventListener('click', () => {
    state.cols = r.level.cols;
    state.rows = r.level.rows;
    state.cells = r.level.cells.map((row) => row.map((c) => (typeof c === 'string' ? c : { ...c })));
    state.links = r.level.links || {};
    state.tray = r.level.tray.slice();
    state.levelName = r.level.name;
    state.objectiveSpec = r.objectives;
    $('levelName').value = state.levelName;
    $('cols').value = state.cols;
    $('rows').value = state.rows;
    syncTrayInputs();
    renderObjectives();
    renderBoard();
    renderSimTray();
    resetSim();
    setStatus('Nivel generado cargado y verificado', 'ok');
  });
  box.appendChild(use);
  setStatus('Nivel generado y verificado', 'ok');
}

// ------------------------------------------------------------
// Import / export
// ------------------------------------------------------------
function exportLevel() {
  const data = toExportable(currentLevel(), state.objectiveSpec, null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'boomsolver-nivel.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importLevel(file) {
  try {
    const raw = JSON.parse(await file.text());
    if (raw.format && raw.format !== 'boomsolver-level') throw new Error('Formato desconocido');
    if (raw.version && raw.version > 2) throw new Error(`Versión ${raw.version} no soportada`);
    state.cols = raw.cols;
    state.rows = raw.rows;
    state.cells = (raw.cells || raw.grid).map((row) => row.map((c) => (typeof c === 'string' ? c : { ...c })));
    state.links = raw.links || {};
    state.tray = (raw.tray || [1]).slice();
    state.levelName = raw.name || 'Nivel importado';
    state.objectiveSpec = raw.objectives || [];
    $('levelName').value = state.levelName;
    $('cols').value = state.cols;
    $('rows').value = state.rows;
    syncTrayInputs();
    renderObjectives();
    renderBoard();
    renderSimTray();
    resetSim();
    setStatus('Nivel importado', 'ok');
  } catch (err) {
    setStatus('Importación fallida: ' + err.message, 'err');
  }
}

function syncTrayInputs() {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const l of state.tray) counts[l] = (counts[l] || 0) + 1;
  for (const l of [1, 2, 3, 4]) $(`t${l}`).value = counts[l];
}

function readTrayInputs() {
  const tray = [];
  for (const l of [1, 2, 3, 4]) {
    const n = Math.max(0, Math.min(12, Number($(`t${l}`).value) || 0));
    for (let i = 0; i < n; i++) tray.push(l);
  }
  state.tray = tray;
  renderBoard();
  renderSimTray();
}

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
function boot() {
  state.cells = emptyCells(state.cols, state.rows);
  // Nivel de ejemplo: dos cofres y un cristal, para que la app arranque con algo útil.
  state.cells[1][1] = 'chest_wood';
  state.cells[1][6] = 'chest_wood';
  state.cells[3][3] = 'crystal';
  state.cells[2][4] = 'rock_soft';
  state.levelName = 'Ejemplo: dos cofres';
  $('levelName').value = state.levelName;
  $('directive').value = 'Abre los cofres 0/2 · sin romper cristales';
  state.objectiveSpec = [
    { kind: 'destroy', types: ['chest_wood', 'chest_iron'], count: 2 },
    { kind: 'noDestroy', types: ['crystal'], negative: true },
  ];
  $('engineBadge').textContent = `motor v2.0 · ${Object.keys(OBJECTS).length} objetos`;
  renderPalette();
  renderObjectives();
  renderBoard();
  renderSimTray();
  const d = defaultRules();
  $('fusionMode').value = d.fusionMode;
  $('dynamitePattern').value = d.dynamitePattern;
  $('magmaRange').value = String(d.magmaRange);
  $('objectsBlock').checked = d.objectsBlock;
  $('magmaBlocks').checked = d.magmaBlocks;
  $('bombBlocks').checked = d.bombBlocks;
  $('requireEnemy').checked = d.requireEnemyBombs;
  $('portalRangeMode').value = d.portalRangeMode;
}

$('btnEditMode').addEventListener('click', () => {
  state.mode = 'edit';
  $('btnEditMode').classList.add('active');
  $('btnSimMode').classList.remove('active');
  $('boardHint').textContent = 'Modo edición: haz clic para colocar el objeto de la paleta. Los portales alternan azul/morado; los géiseres su temporizador.';
});
$('btnSimMode').addEventListener('click', () => {
  state.mode = 'simulate';
  $('btnSimMode').classList.add('active');
  $('btnEditMode').classList.remove('active');
  $('boardHint').textContent = 'Modo simular: elige un nivel de bomba y haz clic en una casilla. Clic derecho marca la mecha.';
  renderSimTray();
});
$('btnNew').addEventListener('click', () => {
  state.cells = emptyCells(state.cols, state.rows);
  state.links = {};
  resetSim();
  renderBoard();
  setStatus('Tablero vacío', 'ok');
});
$('btnExport').addEventListener('click', exportLevel);
$('fileImport').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importLevel(f); e.target.value = ''; });
$('cols').addEventListener('change', () => {
  const cols = Math.max(2, Math.min(20, Number($('cols').value) || 8));
  state.cells = state.cells.map((row) => {
    const next = row.slice(0, cols);
    while (next.length < cols) next.push('empty');
    return next;
  });
  state.cols = cols;
  resetSim();
  renderBoard();
});
$('rows').addEventListener('change', () => {
  const rows = Math.max(2, Math.min(20, Number($('rows').value) || 5));
  while (state.cells.length > rows) state.cells.pop();
  while (state.cells.length < rows) state.cells.push(Array(state.cols).fill('empty'));
  state.rows = rows;
  resetSim();
  renderBoard();
});
$('levelName').addEventListener('input', () => { state.levelName = $('levelName').value; });
for (const l of [1, 2, 3, 4]) $(`t${l}`).addEventListener('change', readTrayInputs);
for (const id of ['fusionMode', 'dynamitePattern', 'magmaRange', 'objectsBlock', 'magmaBlocks', 'bombBlocks', 'requireEnemy', 'geyserDetonate', 'portalRangeMode']) {
  $(id).addEventListener('change', () => { readRules(); });
}
$('btnParseDirective').addEventListener('click', interpretDirective);
$('btnSolve').addEventListener('click', runSolver);
$('btnCompare') && $('btnCompare').addEventListener('click', renderComparison);
for (const tab of document.querySelectorAll('#analysisTabs .tab')) {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
}

$('btnCancel').addEventListener('click', () => { state.search.cancelled = true; setStatus('Cancelando…', 'warn'); });
$('btnDetonate').addEventListener('click', detonate);
$('btnResetSim').addEventListener('click', resetSim);
$('btnPrevTick').addEventListener('click', () => stepTick(-1));
$('btnNextTick').addEventListener('click', () => stepTick(1));
$('btnPlay').addEventListener('click', playTicks);
$('btnGenerate').addEventListener('click', runGenerator);
$('btnHelp').addEventListener('click', () => $('helpDialog').showModal());
$('btnCloseHelp').addEventListener('click', () => $('helpDialog').close());

boot();
setStatus('listo', 'ok');
