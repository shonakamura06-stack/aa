#!/usr/bin/env node
// CLI de BoomSolver: resuelve, genera, verifica y explica niveles desde JSON.
//
//   node scripts/cli.mjs solve nivel.json --mode=fewest_bombs --max=20
//   node scripts/cli.mjs generate --width=7 --height=5 --gems=2 --seed=42
//   node scripts/cli.mjs verify nivel.json solucion.json
//   node scripts/cli.mjs explain nivel.json
//   node scripts/cli.mjs catalog
//
// Autocontenido: sin dependencias externas ni claves de API.

import fs from 'node:fs';
import { solve, verifySolution } from '../src/solver/solver.js';
import { generate, objectivesFor, toExportable } from '../src/generator/generator.js';
import { prepareBoard, simulate } from '../src/core/engine.js';
import { evaluateOutcome, parseDirective } from '../src/core/goals.js';
import { OBJECTS, BOMB_LEVELS, defaultRules, UNRESOLVED_VISUALS } from '../src/core/catalog.js';
import { explainImpossible, necessaryBombs, redundantBombs, hint } from '../src/analysis.js';
import { scoreDifficulty } from '../src/difficulty.js';
import { runSuite } from '../src/validation/harness.js';
import { portalCases } from '../src/validation/cases.portals.js';
import { geyserCases } from '../src/validation/cases.geysers.js';
import {
  synthCase, evaluateCase, summarizeCorpus, watchedConfusionReport,
  renderReport, splitTrainEval, loadRealCorpus,
} from '../src/vision/evaluation.js';
import {
  loadRealCorpusFs,
  evaluateRealCorpus,
  renderRealCrossReport,
} from '../src/vision/realEval.js';
import { readFileSync, readdirSync } from 'node:fs';
import { bruteForce, bruteSignature, solverSignature } from '../src/solver/bruteforce.js';

const [cmd, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);
const positional = rest.filter((a) => !a.startsWith('--'));

if (!cmd || cmd === 'help' || flags.help) { printHelp(); process.exit(0); }

try {
  if (cmd === 'catalog') runCatalog();
  else if (cmd === 'solve') runSolve();
  else if (cmd === 'generate') runGenerate();
  else if (cmd === 'verify') runVerify();
  else if (cmd === 'explain') runExplain();
  else if (cmd === 'simulate') runSimulate();
  else if (cmd === 'validate') runValidate();
  else if (cmd === 'oracle') runOracle();
  else if (cmd === 'vision') runVision();
  else { console.error(`Comando desconocido: ${cmd}`); printHelp(); process.exit(1); }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

// ------------------------------------------------------------
function runCatalog() {
  console.log('CATÁLOGO DE OBJETOS\n');
  for (const [id, d] of Object.entries(OBJECTS)) {
    console.log(`${id.padEnd(18)} ${d.name.padEnd(24)} rol=${d.role.padEnd(10)} hp=${String(d.hp).padEnd(4)} bloqueo=${d.blocks.padEnd(6)} estado=${d.status}`);
  }
  console.log('\nBOMBAS');
  for (const [lvl, b] of Object.entries(BOMB_LEVELS)) {
    console.log(`  N${lvl}: alcance ${b.range}, pólvora ${b.powder}`);
  }
  console.log('\nSIN FÍSICA CONOCIDA (no se les inventa comportamiento):');
  for (const v of UNRESOLVED_VISUALS) console.log(`  ${v.visualId}: ${v.description} → ${v.blockedBy}`);
  console.log('\nREGLAS POR DEFECTO');
  console.log(JSON.stringify(defaultRules(), null, 2));
}

function runSolve() {
  const file = positional[0];
  if (!file) throw new Error('Falta el archivo de nivel');
  const level = loadLevel(file);
  const objectives = level.objectives && level.objectives.length
    ? level.objectives
    : parseDirective(flags.directive || '', prepareBoard(level)).negative.length || flags.directive
      ? [...parseDirective(flags.directive, prepareBoard(level)).positive, ...parseDirective(flags.directive, prepareBoard(level)).negative]
      : [];
  if (!objectives.length) throw new Error('El nivel no trae objetivos y no se pasó --directive');

  const mode = flags.mode || 'fewest_bombs';
  const maxSolutions = Number(flags.max || 20);
  const budget = Number(flags.time || 20000);
  const result = solve(level, objectives, { mode, maxSolutions, timeBudgetMs: budget });

  console.log(`Modo: ${mode}`);
  console.log(`Estado de optimalidad: ${result.status}${result.optimalityProven ? ' (demostrado)' : ' (NO demostrado)'}`);
  console.log(result.proofNote);
  if (result.reasons.length) console.log('Diagnóstico:', result.reasons.join(' '));
  console.log(`Soluciones conocidas: ${result.totalKnown}${result.truncatedPresentation ? ` (mostrando ${result.solutions.length})` : ''}`);
  console.log('');
  result.solutions.forEach((s, i) => {
    console.log(`#${i + 1}  bombas físicas=${s.physicalBombs}  pólvora=${s.powder}  ticks=${s.ticks}  fusiones=${s.fusions}`);
    console.log(`     mecha: ${s.mecha.cell}`);
    console.log(`     bombas: ${s.placements.map((p) => `${p.cell}=N${p.level}`).join('  ')}`);
    if (s.fusionSteps.length) console.log(`     fusiones: ${s.fusionSteps.join(' · ')}`);
    console.log(`     objetivos: ${s.checks.map((c) => `${c.label}:${c.ok ? 'ok' : 'falla'}`).join(' | ')}`);
  });
  const nec = necessaryBombs(result);
  console.log('\n' + nec.note);
  if (flags.json) console.log(JSON.stringify({ ...result, board: undefined, solutions: result.solutions.map(stripHeavy) }, null, 2));
}

function runGenerate() {
  const constraints = {
    width: Number(flags.width || 7),
    height: Number(flags.height || 5),
    seed: Number(flags.seed || 1),
    difficulty: flags.difficulty || 'any',
    solutionCount: flags.solutions || 'any',
    maxAttempts: Number(flags.attempts || 40),
    targets: {
      gem: Number(flags.gems || 0),
      chest_wood: Number(flags.chests || 0),
      chest_iron: Number(flags.iron || 0),
      switch: Number(flags.switches || 0),
    },
    hazards: { crystal: Number(flags.crystals || 0), cat: Number(flags.cats || 0) },
    obstacles: { rock_soft: Number(flags.rocks || 0), rock_hard: Number(flags.hardrocks || 0) },
    mechanics: {
      portalPairs: Number(flags.portals || 0),
      geysers: Number(flags.geysers || 0),
      mirrors: Number(flags.mirrors || 0),
      magma: Number(flags.magma || 0),
      dynamite: Number(flags.dynamite || 0),
      detonators: Number(flags.detonators || 0),
    },
    tray: { 1: Number(flags.n1 ?? 3), 2: Number(flags.n2 ?? 1), 3: Number(flags.n3 ?? 0), 4: Number(flags.n4 ?? 0) },
    minBombs: Number(flags.minbombs || 1),
    maxBombs: Number(flags.maxbombs || 6),
    requiredMechanics: flags.require ? String(flags.require).split(',') : [],
  };
  const r = generate(constraints);
  if (!r.ok) {
    console.error(r.reason);
    for (const rej of r.rejected.slice(0, 8)) console.error(`  semilla ${rej.seed}: ${rej.reason}`);
    if (r.hint) console.error('Sugerencias:', r.hint.suggestions.join(' '));
    process.exit(2);
  }
  console.log(`Nivel generado (semilla ${r.metrics.seed}) en ${r.attempts} intento(s).`);
  console.log(`Tamaño: ${r.level.cols}×${r.level.rows}`);
  console.log(`Óptimo: ${r.metrics.physicalBombs} bomba(s) física(s), ${r.metrics.powder} de pólvora, ${r.metrics.solutionsAtMinimum} solución(es) mínima(s).`);
  console.log(`Dificultad: ${r.difficulty.bandLabel} (${r.difficulty.score}/100)`);
  for (const line of r.difficulty.explanation) console.log('  · ' + line);
  console.log('\nTablero:');
  r.level.cells.forEach((row) => console.log('  ' + row.map((c) => (typeof c === 'string' ? c.slice(0, 6) : c.type.slice(0, 6))).join(' ')));
  if (flags.out) {
    fs.writeFileSync(flags.out, JSON.stringify(toExportable(r.level, r.objectives, r.level.constraints), null, 2));
    console.log(`\nGuardado en ${flags.out}`);
  } else if (flags.json) {
    console.log(JSON.stringify(toExportable(r.level, r.objectives, r.level.constraints), null, 2));
  }
}

function runVerify() {
  const [levelFile, solFile] = positional;
  if (!levelFile || !solFile) throw new Error('Uso: verify nivel.json solucion.json');
  const level = loadLevel(levelFile);
  const sol = JSON.parse(fs.readFileSync(solFile, 'utf8'));
  const objectives = level.objectives && level.objectives.length ? level.objectives : sol.objectives || [];
  const v = verifySolution(level, objectives, sol);
  console.log(v.ok ? 'VÁLIDA: el simulador reproduce la victoria.' : 'NO VÁLIDA.');
  for (const f of v.verdict.failures) console.log('  · ' + f.message);
  for (const c of v.verdict.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.label} (${c.done}/${c.total})`);
  process.exit(v.ok ? 0 : 3);
}

function runExplain() {
  const file = positional[0];
  const level = loadLevel(file);
  const objectives = level.objectives || [];
  const diag = explainImpossible(level, objectives, { timeBudgetMs: Number(flags.time || 8000) });
  if (!diag.impossible) {
    const res = solve(level, objectives, { maxSolutions: 20 });
    console.log(`El nivel SÍ tiene solución: mínimo ${res.solutions[0].physicalBombs} bomba(s) / ${res.solutions[0].powder} de pólvora.`);
    console.log('Pista:', hint(level, objectives).message);
    console.log('Necesarias:', necessaryBombs(res).note);
    console.log('Redundantes:', redundantBombs(level, objectives, res.solutions[0]).note);
    const d = scoreDifficulty(level, res, objectives);
    console.log(`Dificultad: ${d.bandLabel} (${d.score}/100)`);
    d.explanation.forEach((e) => console.log('  · ' + e));
  } else {
    console.log('El nivel NO tiene solución con estas reglas.');
    for (const c of diag.causes) console.log('  · ' + c);
  }
}

function runSimulate() {
  const file = positional[0];
  const level = loadLevel(file);
  const placements = new Map();
  for (const p of String(flags.bombs || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+),(\d+):(\d)$/.exec(p);
    if (!m) throw new Error(`Bomba mal formada: ${p}. Formato: --bombs="col,fila:nivel;col,fila:nivel"`);
    placements.set(Number(m[2]) * level.cols + Number(m[1]), Number(m[3]));
  }
  if (!placements.size) throw new Error('Indica --bombs=col,fila:nivel,...');
  const [mx, my] = String(flags.mecha || '0,0').split(',').map(Number);
  const mecha = my * level.cols + mx;
  const board = prepareBoard(level);
  const res = simulate(board, placements, mecha, board.rules);
  console.log(`Estado: ${res.status}${res.reason ? ' (' + res.reason + ')' : ''}`);
  console.log(`Ticks: ${res.metrics.tickCount} · bombas: ${res.metrics.placedCount} · pólvora: ${res.metrics.powder}`);
  for (const t of res.ticks) {
    console.log(`\nTICK ${t.tick}`);
    for (const e of t.events) {
      const detail = e.cell ? ` en ${e.cell}` : '';
      console.log(`  · ${e.type}${detail}${e.object ? ` [${e.object}]` : ''}${e.dir ? ` dir=${e.dir}` : ''}${e.rangeTransported != null ? ` alcance=${e.rangeTransported}` : ''}`);
    }
  }
}

// ------------------------------------------------------------
function loadLevel(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw.format && raw.format !== 'boomsolver-level') throw new Error(`Formato desconocido: ${raw.format}`);
  if (raw.version && raw.version > 2) throw new Error(`Versión de formato no soportada: ${raw.version}`);
  const level = {
    cols: raw.cols, rows: raw.rows, cells: raw.cells, tray: raw.tray || [1],
    links: raw.links || {}, rules: raw.rules || {}, name: raw.name,
    objectives: raw.objectives || [],
  };
  // Migración de formato v1 (grid en lugar de cells)
  if (!level.cells && raw.grid) level.cells = raw.grid;
  if (!level.cells) throw new Error('El nivel no tiene tablero');
  return level;
}

function stripHeavy(s) {
  const { log, waves, result, ...rest } = s;
  void log; void waves; void result;
  return rest;
}

function parseFlags(args) {
  const out = {};
  for (const a of args) {
    if (!a.startsWith('--')) continue;
    const [k, ...v] = a.slice(2).split('=');
    out[k] = v.length ? v.join('=') : true;
  }
  return out;
}

function printHelp() {
  console.log(`BoomSolver CLI

  validate [--json]              Ejecuta la batería de portales y géiseres contra el motor.
  oracle nivel.json [--max=2]    Fuerza bruta independiente y comparación con el solver.
  vision [--json] [--real=DIR]   Evalúa visión: corpus sintético y, si se pasa --real, capturas reales.
  catalog                       Muestra el catálogo de objetos y las reglas por defecto.
  solve nivel.json [opciones]   Busca soluciones.
      --mode=fewest_bombs|least_powder|pareto
      --max=20 --time=20000 --directive="Abre los cofres 0/2" --json
  generate [opciones]           Genera un nivel que cumple restricciones.
      --width=7 --height=5 --gems=2 --chests=1 --crystals=1
      --portals=1 --geysers=1 --seed=42 --solutions=unique|few|many
      --difficulty=easy|medium|hard|expert --minbombs=1 --maxbombs=6
      --n1=3 --n2=1 --n3=0 --n4=0 --out=nivel.json
  verify nivel.json sol.json     Revalida una solución con el simulador oficial.
  explain nivel.json            Dice por qué un nivel es imposible o difícil.
  simulate nivel.json --bombs="0,1:2;3,2:1" --mecha=0,1
`);
}

// ------------------------------------------------------------
// validate: batería de mecánicas contra el motor
// ------------------------------------------------------------
function runValidate() {
  const grupos = [
    { nombre: 'portales', casos: portalCases },
    { nombre: 'géiseres', casos: geyserCases },
  ];
  let fallos = 0;
  const json = { groups: [] };
  for (const g of grupos) {
    const suite = runSuite(g.casos);
    fallos += suite.failed.length;
    json.groups.push({
      nombre: g.nombre,
      total: suite.total,
      asertados: suite.asserted,
      aprobados: suite.passed,
      observacionales: suite.observational,
      fallos: suite.failed.map((c) => ({ id: c.id, pregunta: c.question })),
    });
    if (flags.json) continue;
    console.log(`\n${g.nombre.toUpperCase()}: ${suite.passed}/${suite.asserted} casos asertados`
      + (suite.observational ? `, ${suite.observational} observacionales` : ''));
    for (const c of suite.failed) {
      console.log(`  ✗ ${c.id} — ${c.question}`);
      for (const ch of c.checks.filter((x) => !x.pass)) {
        console.log(`      ${ch.name}: esperado ${JSON.stringify(ch.expected)} · real ${JSON.stringify(ch.actual)}`);
      }
    }
    const porEstado = {};
    for (const c of suite.results) porEstado[c.state] = (porEstado[c.state] || 0) + 1;
    console.log('  estados: ' + Object.entries(porEstado).map(([k, v]) => `${k}=${v}`).join(' · '));
  }
  if (flags.json) { console.log(JSON.stringify(json, null, 2)); return; }
  console.log('\nRecordatorio: estas pruebas demuestran que el motor cumple la especificación,');
  console.log('no que el juego real se comporte así. Ningún caso está marcado como "verified".');
  if (fallos) process.exitCode = 1;
}

// ------------------------------------------------------------
// oracle: fuerza bruta independiente
// ------------------------------------------------------------
function runOracle() {
  const file = positional.find((a) => a.endsWith('.json'));
  if (!file) throw new Error('Uso: oracle nivel.json [--max=2]');
  const level = JSON.parse(fs.readFileSync(file, 'utf8'));
  const objectives = level.objectives || [];
  const max = Number(flags.max || 2);
  const bf = bruteForce(level, objectives, { maxBombs: max, includeFusions: flags.fusions === 'true' });
  const sv = solve(level, objectives, { maxBombs: max + 1, timeBudgetMs: Number(flags.time || 15000) });

  const bset = new Set(bf.solutions.map(bruteSignature));
  const sset = new Set(sv.solutions.map(solverSignature));
  const onlyBrute = [...bset].filter((x) => !sset.has(x));
  const onlySolver = [...sset].filter((x) => !bset.has(x));

  console.log(`Fuerza bruta: ${bf.complete ? 'completa' : 'INCOMPLETA (límite de combinaciones)'}`
    + ` · ${bf.combosTried} jugadas probadas · ${bf.elapsedMs} ms`);
  console.log(`Mínimo de bombas (bruto): ${bf.minimumBombs ?? 'sin solución'} · soluciones mínimas: ${bf.solutions.length}`);
  console.log(`Solver: ${sv.status} · ${sv.solutions.length} solución(es) · ${sv.elapsedMs} ms`);
  if (onlyBrute.length) console.log(`DISCREPANCIA — sólo la fuerza bruta encuentra: ${onlyBrute.join(' | ')}`);
  if (onlySolver.length) console.log(`DISCREPANCIA — sólo el solver presenta: ${onlySolver.join(' | ')}`);
  if (!onlyBrute.length && !onlySolver.length) console.log('Coinciden: el solver no pierde ni inventa soluciones óptimas.');
  if (onlyBrute.length || onlySolver.length) process.exitCode = 1;
}

// ------------------------------------------------------------
// vision: evaluación sobre corpus sintético
// ------------------------------------------------------------
function runVision() {
  // Dos corpus, nunca mezclados:
  //   · sintético (siempre): comprueba que la tubería mide, no valida nada;
  //   · real (si se pasa --real=<carpeta>): pares <id>.png + <id>.json con
  //     etiqueta humana. Es el ÚNICO que puede decir algo sobre el juego.
  const casos = [
    synthCase({ id: 'S1', layout: [['empty', 'gem', 'empty', 'crystal'], ['chest_wood', 'empty', 'wall', 'empty']], cellPx: 48, seed: 3 }),
    synthCase({ id: 'S2', layout: [['portal', 'empty', 'empty'], ['empty', 'cat', 'empty'], ['empty', 'empty', 'mirror_slash']], cellPx: 56, seed: 7 }),
    synthCase({
      id: 'S3',
      layout: [['portal:blue', 'empty', 'portal:purple']],
      etiqueta: [[{ type: 'portal', color: 'blue' }, { type: 'empty' }, { type: 'portal', color: 'purple' }]],
      cellPx: 60, seed: 11,
    }),
    // Tablero grande: es el tamaño donde la rejilla se confundía (10x7 → 2x3)
    // antes de separar "borde fuerte" de "textura" en `buildGrid`.
    synthCase({
      id: 'S4-10x7',
      layout: Array.from({ length: 7 }, (_, y) =>
        Array.from({ length: 10 }, (_, x) => ((x * 3 + y * 5) % 7 === 0 ? 'gem' : ((x + y) % 4 === 0 ? 'crystal' : 'empty')))),
      cellPx: 40, seed: 13,
    }),
  ];

  let real = { casos: [], warnings: [], errors: [] };
  if (flags.real) {
    // Corpus real nuevo: `corpus/real/*.json` con la captura recortada al
    // tablero. Se evalúa con validación cruzada por nivel (ver
    // `evaluateRealCorpus`), que es lo único defendible con 13 capturas.
    try {
      const { casos, errores } = loadRealCorpusFs({ dir: flags.real, readFile: readFileSync, readDir: readdirSync });
      real = { casos, warnings: [], errors: errores };
    } catch (err) {
      throw new Error(`No se pudo leer el corpus real "${flags.real}": ${err.message}`);
    }
    for (const e of real.errors) console.warn(`CASO IGNORADO ${e.id}: ${e.error}`);
  }

  const syntheticResults = casos.map((c) => evaluateCase(c));
  const syntheticSummary = summarizeCorpus(syntheticResults);
  const realCross = real.casos.length ? evaluateRealCorpus(real.casos) : null;
  const realSummary = realCross ? realCross.agregado : null;
  // `watchedConfusionReport` espera un resumen del corpus SINTÉTICO (con su
  // matriz); el real trae la suya en `confusiones`. Mezclarlos reventaba.
  const watched = watchedConfusionReport(realSummary ? { matrix: {} } : syntheticSummary);
  const split = splitTrainEval(real.casos.length ? real.casos : casos);

  if (flags.json) {
    console.log(JSON.stringify({
      synthetic: { summary: syntheticSummary, watched: watchedConfusionReport(syntheticSummary) },
      real: realCross ? {
        agregado: realCross.agregado,
        pliegues: realCross.pliegues.map((p) => ({
          grupo: p.grupo, dev: p.dev, eval: p.eval, resumen: p.resumen,
        })),
        porClase: realCross.porClase,
        confusiones: realCross.confusiones,
        notas: realCross.notas,
        errors: real.errors,
      } : null,
    }, null, 2));
    return;
  }

  console.log('# Informe de evaluación de visión\n');
  console.log('## 1. Corpus REAL (capturas del juego con etiqueta humana)');
  if (!real.casos.length) {
    console.log('');
    console.log('**No hay capturas reales.** Sin ellas no se puede afirmar nada sobre la precisión');
    console.log('del detector frente al juego. Para añadirlas:');
    console.log('');
    console.log('  node scripts/cli.mjs vision --real=./corpus/real');
    console.log('');
    console.log('y en esa carpeta, por cada captura, `<id>.png` (la captura) y `<id>.json` (la etiqueta');
    console.log('humana del tablero). El formato está documentado en corpus/real/README.md.');
  } else {
    console.log('');
    console.log(renderRealCrossReport(realCross));
    if (real.errors.length) {
      console.log('');
      console.log(`Casos ignorados: ${real.errors.length}`);
      for (const e of real.errors) console.log(`  · ${e.id}: ${e.error}`);
    }
  }
  console.log('');
  console.log('## 2. Corpus SINTÉTICO (regresión; no valida nada)');
  console.log('');
  console.log(renderReport(syntheticSummary, watchedConfusionReport(syntheticSummary), { realImages: 0 }));
  console.log('');
  console.log(`Split train/eval sobre ${real.casos.length ? 'las capturas reales' : 'el corpus sintético'}: `
    + `${split.train.length} / ${split.eval.length}`);
}
