// ============================================================
// BoomSolver — dificultad explicable
// ============================================================
// Separa claramente dos cosas:
//   algorithmicDifficulty → lo que mide el motor (bombas mínimas, ramificación,
//                           mecánicas obligatorias, sincronización, etc.).
//   playerDifficulty      → estimación del esfuerzo humano. NO está calibrada
//                           hasta compararla con partidas reales.
// Cada factor se devuelve con su valor y su peso para que la puntuación sea
// auditable, no una caja negra.

import { getObject } from './core/catalog.js';

export const DIFFICULTY_FACTORS = [
  { id: 'minBombs', label: 'Bombas físicas mínimas', weight: 2.0, explain: 'Más tiros que encadenar.' },
  { id: 'minPowder', label: 'Pólvora equivalente mínima', weight: 0.4, explain: 'Coste de las bombas, no del número.' },
  { id: 'solutionScarcity', label: 'Escasez de soluciones', weight: 2.5, explain: 'Menos soluciones óptimas ⇒ más difícil acertar.' },
  { id: 'branching', label: 'Ramificación de casillas', weight: 1.2, explain: 'Muchas casillas válidas aumentan las posibilidades.' },
  { id: 'mechanics', label: 'Mecánicas obligatorias', weight: 2.2, explain: 'Portales, espejos, cables o temporizadores necesarios.' },
  { id: 'chainDepth', label: 'Profundidad de cadena', weight: 1.4, explain: 'Reacciones encadenadas que hay que prever.' },
  { id: 'timing', label: 'Sincronización temporal', weight: 2.0, explain: 'Géiseres o interruptores simultáneos.' },
  { id: 'fusions', label: 'Fusiones necesarias', weight: 1.3, explain: 'Hay que fusionar antes de colocar.' },
  { id: 'hazardMargin', label: 'Margen de seguridad', weight: 1.8, explain: 'Peligros cerca del camino crítico.' },
];

export function scoreDifficulty(level, solved, objectives = []) {
  const best = solved && solved.solutions && solved.solutions[0];
  const factors = [];
  const add = (id, raw, value, note) => {
    const f = DIFFICULTY_FACTORS.find((x) => x.id === id);
    factors.push({ id, label: f.label, raw, value, weight: f.weight, contribution: f.weight * value, note });
  };

  // Conteo de objetos del nivel
  const counts = new Map();
  let placeable = 0;
  for (const row of level.cells) {
    for (const cell of row) {
      const t = typeof cell === 'string' ? cell : cell && cell.type;
      counts.set(t, (counts.get(t) || 0) + 1);
      const def = getObject(t);
      if (def && def.role === 'passable') placeable++;
    }
  }
  const has = (t) => (counts.get(t) || 0) > 0;

  const bombs = best ? best.physicalBombs : (level.tray || []).length;
  add('minBombs', bombs, clamp((bombs - 1) / 5), `Bombas mínimas: ${bombs}.`);

  const powder = best ? best.powder : 0;
  add('minPowder', powder, clamp(powder / 24), `Pólvora mínima: ${powder}.`);

  const solCount = solved ? solved.solutions.length : 0;
  const proven = solved && solved.status === 'optimalityProven';
  add('solutionScarcity', solCount, proven ? clamp(1 - Math.min(solCount, 40) / 40) : 0.3,
    proven ? `${solCount} solución(es) óptima(s) demostradas.` : 'Optimalidad no demostrada: factor estimado.');

  add('branching', placeable, clamp(placeable / 40), `Casillas colocables: ${placeable}.`);

  const mechs = [];
  if (has('portal')) mechs.push('portales');
  if (has('mirror_slash') || has('mirror_backslash')) mechs.push('espejos');
  if (has('detonator')) mechs.push('cables');
  if (has('geyser')) mechs.push('géiseres');
  if (has('magma_rock')) mechs.push('magma');
  if (has('dynamite')) mechs.push('dinamita');
  add('mechanics', mechs.length, clamp(mechs.length / 3), mechs.length ? `Mecánicas presentes: ${mechs.join(', ')}.` : 'Sin mecánicas especiales.');

  const chain = best ? best.chainDepth : 1;
  add('chainDepth', chain, clamp((chain - 1) / 4), `Profundidad de cadena: ${chain} tick(s).`);

  const timing = (has('geyser') ? 1 : 0) + (objectives.some((o) => o.simultaneous) ? 1 : 0);
  add('timing', timing, clamp(timing / 2), timing ? 'Hay temporizadores o activaciones simultáneas.' : 'Sin sincronización temporal.');

  const fusions = best ? best.fusionSteps.length : 0;
  add('fusions', fusions, clamp(fusions / 3), `${fusions} fusión(es) necesarias en el óptimo.`);

  const hazards = (counts.get('crystal') || 0) + (counts.get('cat') || 0);
  add('hazardMargin', hazards, clamp(hazards / 6), `${hazards} peligro(s) en el tablero.`);

  const raw = factors.reduce((a, f) => a + f.contribution, 0);
  const score = Math.round(clamp(raw / 6) * 100); // 0..100
  const band = score < 25 ? 'easy' : score < 50 ? 'medium' : score < 75 ? 'hard' : 'expert';

  return {
    score,
    band,
    bandLabel: { easy: 'Fácil', medium: 'Medio', hard: 'Difícil', expert: 'Experto' }[band],
    factors,
    algorithmicDifficulty: { score, band, provenOptimality: !!proven },
    playerDifficulty: {
      score: Math.round(score * 1.1),
      calibrado: false,
      note: 'Estimación sin calibrar: no se ha comparado con partidas humanas.',
    },
    explanation: factors
      .filter((f) => f.contribution > 2)
      .sort((a, b) => b.contribution - a.contribution)
      .map((f) => `${f.label} (+${f.contribution.toFixed(1)}): ${f.note}`),
  };
}

function clamp(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
