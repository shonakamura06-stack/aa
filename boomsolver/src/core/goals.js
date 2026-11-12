// ============================================================
// BoomSolver — objetivos compuestos y condiciones negativas
// ============================================================
// Las capturas muestran directrices como
//   "Abre los cofres 0/2 · Recoge las gemas 0/2 · sin romper cristales"
//   "Activa los interruptores a la vez 0/4 · sin romper cristales"
// El modelo admite VARIOS objetivos positivos y VARIAS condiciones
// negativas en el mismo nivel. No hay un único desplegable de objetivo.

import { getObject, HAZARD_TYPES, TARGET_TYPES } from './catalog.js';

/** Esquema de objetivos. Todos los campos son opcionales salvo `kind`. */
export function objective(spec) {
  if (!spec || typeof spec !== 'object' || typeof spec.kind !== 'string') {
    throw new Error('Objetivo inválido: falta kind');
  }
  const o = { ...spec };
  if (o.type && !getObject(o.type)) throw new Error(`Tipo desconocido en objetivo: ${o.type}`);
  if (o.types) {
    if (!Array.isArray(o.types) || !o.types.length) throw new Error('types debe ser un array no vacío');
    for (const t of o.types) if (!getObject(t)) throw new Error(`Tipo desconocido en objetivo: ${t}`);
  }
  if (o.count !== undefined && (!Number.isInteger(o.count) || o.count < 1)) {
    throw new Error('count debe ser un entero ≥ 1');
  }
  return o;
}

export function normalizeObjectives(input) {
  const src = Array.isArray(input) ? input : (input ? [input] : []);
  const positive = [], negative = [];
  for (const raw of src) {
    const o = objective(raw);
    if (o.negative === true || o.kind.startsWith('no')) negative.push(o);
    else positive.push(o);
  }
  return { positive, negative };
}

function cellIndexOf(coord, cols) {
  const [x, y] = String(coord).split(',').map(Number);
  return y * cols + x;
}

function typesOf(o) {
  return o.types ? o.types.slice() : (o.type ? [o.type] : []);
}

function labelFor(kind, types, count, simultaneous) {
  const names = types.map((t) => (getObject(t) || {}).name || t).join(' + ');
  if (kind === 'destroy') return `Destruir ${names}`;
  if (kind === 'activate') return `Activar ${names}${simultaneous ? ' a la vez' : ''}`;
  if (kind === 'enemyBombs') return 'Detonar todas las bombas enemigas';
  if (kind === 'noDestroy') return `Sin romper ${names}`;
  if (kind === 'noActivate') return `Sin activar ${names}`;
  if (kind === 'avoidHazard') return 'Sin tocar peligros';
  return `${kind} ${names}`;
}

/**
 * Evalúa un resultado de simulación frente a los objetivos del nivel.
 * Nunca lanza: devuelve un informe explicable.
 */
export function evaluateOutcome(board, result, objectivesInput) {
  const { positive, negative } = normalizeObjectives(objectivesInput);
  const cols = board.cols;
  const aliveByType = new Map();
  const totalByType = new Map();
  const destroyedByType = new Map();
  const activatedByType = new Map();
  const activatedTicksByType = new Map();

  for (let i = 0; i < board.n; i++) {
    const t = board.types[i];
    const def = getObject(t);
    const hadHp = board.hp0[i] > 0;
    if (hadHp) totalByType.set(t, (totalByType.get(t) || 0) + 1);
    const alive = result.final.alive[i] === 1;
    if (hadHp) {
      if (alive) aliveByType.set(t, (aliveByType.get(t) || 0) + 1);
      else destroyedByType.set(t, (destroyedByType.get(t) || 0) + 1);
    }
    if (result.final.activated[i]) {
      activatedByType.set(t, (activatedByType.get(t) || 0) + 1);
      if (!activatedTicksByType.has(t)) activatedTicksByType.set(t, []);
      activatedTicksByType.get(t).push(result.final.activatedTick[i]);
    }
    // Objetos destruidos concretamente por la explosión (no los que nacieron muertos)
    void def; void cols;
  }

  // Objetos alcanzados por alguna onda (aunque no se destruyan): permite
  // evaluar condiciones negativas sobre peligros indestructibles.
  const hitByType = new Map();
  const hitCells = new Set();
  for (const ev of result.log || []) {
    if (ev.type === 'damage' || ev.type === 'hazard-hit' || ev.type === 'activated') {
      const t = ev.object || board.types[cellIndexOf(ev.cell, board.cols)];
      if (t) hitByType.set(t, (hitByType.get(t) || 0) + 1);
      hitCells.add(ev.cell);
    }
  }

  const statusOk = result.status === 'resolved' || result.status === 'win';
  const checks = [];
  const failures = [];

  if (!statusOk) {
    failures.push({
      kind: 'simulation',
      message: result.reason === 'hazard' ? 'La explosión alcanzó un peligro.'
        : result.reason === 'disconnected' ? 'Quedaron bombas colocadas sin detonar.'
          : result.reason === 'unresolved' ? 'El turno no terminó de resolverse (¿bucle de portales?).'
            : `Simulación no válida (${result.reason || result.status}).`,
    });
  }

  for (const o of positive) {
    const types = typesOf(o);
    if (o.kind === 'destroy') {
      const total = types.reduce((a, t) => a + (totalByType.get(t) || 0), 0);
      const done = types.reduce((a, t) => a + (destroyedByType.get(t) || 0), 0);
      const required = o.count ?? total;
      const ok = done >= required;
      checks.push({ label: labelFor('destroy', types), done: Math.min(done, required), total: required, ok, kind: 'destroy', types });
      if (!ok) failures.push({ kind: 'objective', message: `Objetivo incompleto: ${labelFor('destroy', types)} (${Math.min(done, required)}/${required})` });
    } else if (o.kind === 'activate') {
      const total = types.reduce((a, t) => a + (totalByType.get(t) || 0), 0);
      const done = types.reduce((a, t) => a + (activatedByType.get(t) || 0), 0);
      const required = o.count ?? total;
      let ok = done >= required;
      let simultaneousOk = true;
      if (o.simultaneous) {
        const ticks = [];
        for (const t of types) ticks.push(...(activatedTicksByType.get(t) || []));
        const uniq = new Set(ticks);
        simultaneousOk = ticks.length >= required && uniq.size <= 1;
        ok = ok && simultaneousOk;
      }
      checks.push({
        label: labelFor('activate', types, required, o.simultaneous),
        done: Math.min(done, required), total: required, ok, kind: 'activate', types,
        simultaneous: !!o.simultaneous, simultaneousOk,
      });
      if (!ok) {
        failures.push({
          kind: 'objective',
          message: o.simultaneous && !simultaneousOk
            ? `Los ${types.join('/')} no se activaron en el mismo tick (${done}/${required}).`
            : `Objetivo incompleto: ${labelFor('activate', types)} (${Math.min(done, required)}/${required})`,
        });
      }
    } else if (o.kind === 'enemyBombs') {
      const total = [...totalByType.entries()]
        .filter(([t]) => t.startsWith('enemy_'))
        .reduce((a, [, c]) => a + c, 0);
      const done = [...destroyedByType.entries()]
        .filter(([t]) => t.startsWith('enemy_'))
        .reduce((a, [, c]) => a + c, 0);
      const ok = total === 0 ? true : done >= total;
      checks.push({ label: labelFor('enemyBombs', [], total), done, total, ok, kind: 'enemyBombs' });
      if (!ok) failures.push({ kind: 'objective', message: `Bombas enemigas sin detonar (${done}/${total})` });
    } else {
      throw new Error(`Tipo de objetivo desconocido: ${o.kind}`);
    }
  }

  for (const o of negative) {
    const types = typesOf(o);
    if (o.kind === 'noDestroy' || (o.negative && o.type)) {
      const broken = types.reduce((a, t) => a + (destroyedByType.get(t) || 0) + (hitByType.get(t) || 0), 0);
      const ok = broken === 0;
      checks.push({ label: labelFor('noDestroy', types), done: broken, total: 0, ok, kind: 'noDestroy', types, negative: true });
      if (!ok) failures.push({ kind: 'negative', message: `Condición negativa incumplida: se rompieron ${broken} ${types.join('/')}.` });
    } else if (o.kind === 'noActivate') {
      const act = types.reduce((a, t) => a + (activatedByType.get(t) || 0), 0);
      const ok = act === 0;
      checks.push({ label: labelFor('noActivate', types), done: act, total: 0, ok, kind: 'noActivate', types, negative: true });
      if (!ok) failures.push({ kind: 'negative', message: `Condición negativa incumplida: se activaron ${act} ${types.join('/')}.` });
    } else if (o.kind === 'avoidHazard') {
      const ok = (result.metrics.hazardsHit || 0) === 0;
      checks.push({ label: labelFor('avoidHazard', [], 0), ok, kind: 'avoidHazard', negative: true });
      if (!ok) failures.push({ kind: 'negative', message: 'La explosión alcanzó un peligro.' });
    } else {
      throw new Error(`Condición negativa desconocida: ${o.kind}`);
    }
  }

  const win = statusOk && failures.length === 0 && checks.every((c) => c.ok);
  return { win, checks, failures, status: result.status, reason: result.reason };
}

// ------------------------------------------------------------
// Directriz en español → objetivos estructurados
// ------------------------------------------------------------
const TYPE_WORDS = [
  [/\bgemas?\b|\bdiamantes?\b/, 'gem'],
  [/\bcofres?\b/, null],
  [/\binterruptor(es)?\b|\bbotones?\b|\bswitch(es)?\b/, 'switch'],
  [/\brocas?\b|\bpiedras?\b/, null],
  [/\bcristales?\b/, 'crystal'],
  [/\bgatos?\b|\bdon naranj/i, 'cat'],
  [/\bmagma\b/, 'magma_rock'],
  [/\bdinamita\b/, 'dynamite'],
  [/\bespejos?\b/, null],
  [/\bportales?\b/, null],
  [/\bg[eé]iser(es)?\b/, null],
];

function typesForWord(word, board) {
  const present = new Set(board ? board.types : []);
  switch (word) {
    case 'cofre': return ['chest_wood', 'chest_iron'].filter((t) => present.size === 0 || present.has(t));
    case 'roca': return ['rock_soft', 'rock_hard'].filter((t) => present.size === 0 || present.has(t));
    case 'espejo': return ['mirror_slash', 'mirror_backslash'].filter((t) => present.size === 0 || present.has(t));
    case 'portal': return ['portal'].filter((t) => present.size === 0 || present.has(t));
    case 'geiser': return ['geyser'].filter((t) => present.size === 0 || present.has(t));
    default: return [word];
  }
}

/**
 * Interpreta una directriz escrita en español. Devuelve objetivos + dudas.
 * NUNCA inventa: lo que no reconoce se devuelve en `unparsed` para que el
 * usuario lo confirme.
 */
export function parseDirective(text, board = null) {
  const raw = String(text || '');
  const t = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clauses = t.split(/[·;]|\s-\s|\by\b/).map((s) => s.trim()).filter(Boolean);
  const positive = [];
  const negative = [];
  const unparsed = [];
  const questions = [];

  for (const clause of clauses) {
    const seg = clause.trim();
    if (!seg) continue;
    const isNegative = /(sin |no (romper|despertar|activar|tocar)|evita|evitar|prohibido)/.test(seg);
    const counts = [...seg.matchAll(/(\d+)\s*\/\s*(\d+)/g)].map((m) => Number(m[2]));
    const explicit = /(\d+)\s*$/.exec(seg);
    const count = counts.length ? counts[0] : (explicit ? Number(explicit[1]) : undefined);

    let matched = false;
    for (const [re, type] of TYPE_WORDS) {
      if (!re.test(seg)) continue;
      matched = true;
      const types = type ? [type] : typesForWord(
        /cofre/.test(seg) ? 'cofre' : /roca/.test(seg) ? 'roca' : /espejo/.test(seg) ? 'espejo'
          : /portal/.test(seg) ? 'portal' : 'geiser',
        board,
      );
      const simultaneous = /a la vez|simultane|al mismo tiempo|en el mismo/.test(seg);
      const activa = /activa|pulsa|enciende|interruptor|boton/.test(seg);
      if (isNegative) {
        if (/cristal|gato|despertar/.test(seg)) {
          negative.push({ kind: 'noDestroy', types, negative: true });
        } else {
          negative.push({ kind: 'noDestroy', types, negative: true });
        }
      } else if (activa && (types.includes('switch') || simultaneous)) {
        positive.push({ kind: 'activate', types, count, simultaneous });
      } else {
        const targetTypes = types.filter((x) => {
          const d = getObject(x);
          return d && (d.role === 'target' || d.role === 'obstacle');
        });
        if (targetTypes.length === 0) {
          positive.push({ kind: 'destroy', types, count });
        } else {
          positive.push({ kind: 'destroy', types: targetTypes, count });
        }
      }
      break;
    }
    if (!matched) {
      if (/enemig/.test(seg)) {
        positive.push({ kind: 'enemyBombs' });
      } else if (/peligro/.test(seg)) {
        negative.push({ kind: 'avoidHazard', negative: true });
      } else {
        unparsed.push(seg);
      }
    }
  }

  // Coherencia: un tipo que es objetivo positivo no debería ser también negativo.
  for (const neg of negative) {
    for (const pos of positive) {
      const shared = (neg.types || []).filter((x) => (pos.types || []).includes(x));
      if (shared.length) {
        questions.push(`La directriz pide destruir y no destruir ${shared.join('/')} a la vez. Confirma el texto.`);
      }
    }
  }
  if (positive.some((p) => p.kind === 'activate' && p.simultaneous)) {
    questions.push('Los interruptores "a la vez": ¿misma detonación, misma ola o mismo tick? Se asume mismo tick (Q11).');
  }
  return { positive, negative, unparsed, questions, source: raw };
}

/** Atajo: objetivos típicos para un tablero. */
export function objectivesForBoard(board, { mode = 'auto', counts = {} } = {}) {
  const present = new Map();
  board.types.forEach((t) => present.set(t, (present.get(t) || 0) + 1));
  const make = (types) => types.filter((t) => present.has(t));
  if (mode === 'auto') {
    const targets = make([...TARGET_TYPES]);
    if (!targets.length) return [];
    return targets.map((t) => ({ kind: 'destroy', types: [t], count: counts[t] || present.get(t) }));
  }
  if (mode === 'chests') return [{ kind: 'destroy', types: make(['chest_wood', 'chest_iron']), count: counts.chests }];
  if (mode === 'gems') return [{ kind: 'destroy', types: make(['gem']), count: counts.gems }];
  if (mode === 'switches') return [{ kind: 'activate', types: make(['switch']), count: counts.switches, simultaneous: true }];
  if (mode === 'rocks') return [{ kind: 'destroy', types: make(['rock_soft', 'rock_hard']), count: counts.rocks }];
  if (mode === 'hazards') return [...HAZARD_TYPES].flatMap((t) => (present.has(t) ? [{ kind: 'noDestroy', types: [t], negative: true }] : []));
  throw new Error(`Modo de objetivo desconocido: ${mode}`);
}

export function objectivesFromBoardTypes(board) {
  const present = new Set(board.types);
  const spec = [];
  if (present.has('chest_wood') || present.has('chest_iron')) {
    spec.push({ kind: 'destroy', types: ['chest_wood', 'chest_iron'].filter((t) => present.has(t)) });
  }
  if (present.has('gem')) spec.push({ kind: 'destroy', types: ['gem'] });
  if (present.has('switch')) spec.push({ kind: 'activate', types: ['switch'], simultaneous: true });
  if (present.has('crystal')) spec.push({ kind: 'noDestroy', types: ['crystal'], negative: true });
  if (present.has('cat')) spec.push({ kind: 'noDestroy', types: ['cat'], negative: true });
  return spec;
}
