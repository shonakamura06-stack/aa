import type {
  AggregateSummary,
  EngineFamily,
  EngineKind,
  EngineMeta,
  EngineRun,
  EvidenceLevel,
  TextProfile,
  ValidationStatus,
} from "@/lib/types";

/**
 * Agregador multimodelo.
 *
 * Regla central: **un grupo de dependencia metodológica = un voto**, no un
 * motor = un voto. Los motores que miden la misma variable subyacente (o una
 * transformación de ella) comparten un único voto, de modo que añadir tres
 * variantes del mismo cálculo no triplica la influencia.
 *
 * Aclaraciones que el código hace explícitas y la interfaz repite:
 *  1. El índice 0-100 es un **compuesto heurístico de rasgos descriptivos**.
 *     No es una probabilidad, no está calibrado y no emite veredicto de autoría.
 *  2. No se calcula acuerdo entre motores: no existen decisiones binarias
 *     válidas ni verdad de referencia, así que no hay kappa ni alpha que
 *     informar. Se informa dispersión descriptiva, que no mide acierto.
 *  3. `probability` es siempre null: no hay agregador entrenado ni calibración
 *     validada para español.
 */

export const FAMILY_LABEL: Record<EngineFamily, string> = {
  "information-theoretic": "Información y previsibilidad",
  "repetition-structure": "Repetición y estructura",
  stylometric: "Estilometría",
  "linguistic-surface": "Superficie lingüística",
  "trained-classifier": "Clasificador entrenado",
  commercial: "Detectores comerciales",
};

/** Peso base por naturaleza del método. Decisión de diseño, no calibración. */
const KIND_BASE_WEIGHT: Record<EngineKind, number> = {
  commercial: 1,
  "trained-classifier": 0.9,
  academic: 0.8,
  statistical: 0.7,
  linguistic: 0.35,
};

/** Cuánta credibilidad metodológica aporta el estado de validación declarado. */
const VALIDATION_WEIGHT: Record<ValidationStatus, number> = {
  "external-benchmark": 1,
  "internally-evaluated": 0.9,
  "vendor-claim": 0.75,
  unvalidated: 0.55,
  heuristic: 0.3,
  descriptive: 0.2,
};

const EVIDENCE_WEIGHT: Record<EvidenceLevel, number> = {
  high: 1,
  medium: 0.8,
  low: 0.5,
  insufficient: 0.2,
};

const EVIDENCE_ORDER: EvidenceLevel[] = ["insufficient", "low", "medium", "high"];

/** Umbrales de banda: solo presentación de la escala, sin base empírica. */
export const BAND_THRESHOLDS = { low: 35, high: 65 } as const;

export const CALIBRATED_PROBABILITY_MESSAGE =
  "No existe una probabilidad conjunta calibrada para estas condiciones.";

export const INDEX_NOTE =
  "Compuesto heurístico de intensidad de rasgos descriptivos. Las direcciones de cada motor provienen de la literatura, pero no están calibradas en español ni en este dominio: no es una probabilidad, no es un porcentaje de autoría y no debe usarse como veredicto.";

export const AUTHORSHIP_MESSAGE =
  "Umbral describe rasgos del texto; no estima quién lo escribió ni cuánta parte generó una IA. Cualquier cifra de esta pantalla es descriptiva.";

export const AGREEMENT_REASON =
  "No se calcula acuerdo entre motores: ninguno emite una decisión binaria validada y no existe verdad de referencia. Sin decisiones comparables, kappa o alpha no están definidos; la dispersión solo describe cuánto se separan las intensidades.";

export const EVIDENCE_DEFINITION =
  "Cobertura metodológica: cuántos grupos independientes aportaron señal, con qué validación declarada y con cuánto texto. No es probabilidad de acierto ni confianza en una autoría.";

export interface AggregateInput {
  runs: EngineRun[];
  metas: EngineMeta[];
  profile: TextProfile;
}

function capEvidence(level: EvidenceLevel, max: EvidenceLevel): EvidenceLevel {
  return EVIDENCE_ORDER.indexOf(level) <= EVIDENCE_ORDER.indexOf(max) ? level : max;
}

function best<T>(values: T[], score: (value: T) => number): T {
  return values.reduce((acc, value) => (score(value) > score(acc) ? value : acc));
}

interface Member {
  run: EngineRun;
  meta: EngineMeta;
}

interface Group {
  id: string;
  label: string;
  members: Member[];
  signal: number;
  weight: number;
}

export function aggregate({ runs, metas, profile }: AggregateInput): AggregateSummary {
  const metaById = new Map(metas.map((meta) => [meta.id, meta]));

  const simulated = runs.filter((run) => run.simulated);
  const okRuns = runs.filter((run) => run.status === "ok" && !run.simulated);
  const failed = runs.filter((run) => run.status === "error" || run.status === "timeout");
  const unavailable = runs.filter((run) => run.status === "unavailable" || run.status === "skipped");

  // Solo entran motores direccionales con señal finita y metadatos declarados.
  const directional: Member[] = [];
  for (const run of okRuns) {
    const meta = metaById.get(run.id);
    if (!meta) continue;
    if (meta.directionality !== "directional") continue;
    if (run.signal === null || !Number.isFinite(run.signal)) continue;
    directional.push({ run, meta });
  }

  // Agrupación por dependencia declarada (ver EngineMeta.dependenceCluster).
  const byCluster = new Map<string, Member[]>();
  for (const member of directional) {
    const key = member.meta.dependenceCluster;
    byCluster.set(key, [...(byCluster.get(key) ?? []), member]);
  }

  const groups: Group[] = [];
  for (const [clusterId, members] of byCluster) {
    let weightedSignal = 0;
    let weightSum = 0;
    let evidenceSum = 0;
    for (const { run, meta } of members) {
      const weight = VALIDATION_WEIGHT[meta.validation] * EVIDENCE_WEIGHT[run.evidence];
      weightedSignal += weight * (run.signal as number);
      weightSum += weight;
      evidenceSum += EVIDENCE_WEIGHT[run.evidence];
    }
    if (weightSum === 0) continue;
    const strongestKind = best(members, (m) => KIND_BASE_WEIGHT[m.meta.kind]).meta.kind;
    const strongestValidation = best(members, (m) => VALIDATION_WEIGHT[m.meta.validation]).meta.validation;
    const weight =
      KIND_BASE_WEIGHT[strongestKind] *
      VALIDATION_WEIGHT[strongestValidation] *
      (evidenceSum / members.length);
    groups.push({
      id: clusterId,
      label: clusterLabel(clusterId, members),
      members,
      signal: weightedSignal / weightSum,
      weight,
    });
  }

  const usable = groups.length >= 2 && profile.words >= 80;
  const weightTotal = groups.reduce((acc, group) => acc + group.weight, 0);
  const weightedSum = groups.reduce((acc, group) => acc + group.weight * group.signal, 0);

  const signalIndex = usable && weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : null;

  const signalBand: AggregateSummary["signalBand"] =
    signalIndex === null ? "no calculable" : signalIndex < BAND_THRESHOLDS.low ? "bajo" : signalIndex < BAND_THRESHOLDS.high ? "medio" : "alto";

  let weightedSd: number | null = null;
  if (usable && weightTotal > 0) {
    const meanSignal = weightedSum / weightTotal;
    const acc = groups.reduce((sum, group) => sum + group.weight * (group.signal - meanSignal) ** 2, 0);
    weightedSd = Math.sqrt(acc / Math.max(1e-9, weightTotal));
  }

  const signals = groups.map((group) => group.signal);
  const signalRange: [number, number] | null =
    usable && signals.length >= 2
      ? [Math.round(Math.min(...signals) * 100), Math.round(Math.max(...signals) * 100)]
      : null;

  // ------------------------------ Evidencia ------------------------------
  const reasons: string[] = [];
  let evidence: EvidenceLevel = "insufficient";
  if (groups.length >= 3) evidence = "high";
  else if (groups.length === 2) evidence = "medium";
  else if (groups.length === 1) evidence = "low";

  reasons.push(
    groups.length === 0
      ? "Ningún grupo metodológico aportó señal direccional utilizable."
      : `${groups.length} grupo(s) independiente(s) con señal: ${groups.map((group) => group.label).join(", ")}.`,
  );

  if (profile.words < 80) {
    evidence = capEvidence(evidence, "low");
    reasons.push("Menos de 80 palabras: la evidencia se limita a «baja» y el índice no se calcula.");
  } else if (profile.words < 200) {
    evidence = capEvidence(evidence, "medium");
    reasons.push("Entre 80 y 200 palabras: la evidencia no puede superar «media».");
  } else {
    reasons.push(`Longitud de ${profile.words} palabras: suficiente para estadísticos descriptivos.`);
  }

  if (profile.language === "unknown") {
    evidence = capEvidence(evidence, "low");
    reasons.push("Idioma no determinado con suficiente confianza.");
  } else {
    reasons.push(`Idioma detectado: ${profile.language} (confianza ${profile.languageConfidence}).`);
  }

  const validatedGroups = groups.filter((group) =>
    group.members.some(({ meta }) =>
      ["external-benchmark", "internally-evaluated", "vendor-claim"].includes(meta.validation),
    ),
  );
  if (validatedGroups.length === 0) {
    evidence = capEvidence(evidence, "low");
    reasons.push(
      "Ningún grupo con validación declarada aportó señal: los métodos propios son no validados o heurísticos.",
    );
  } else {
    reasons.push(`Grupos con validación declarada: ${validatedGroups.map((g) => g.label).join(", ")}.`);
  }

  reasons.push(
    `Señales direccionales utilizadas: ${directional.length} motor(es) en ${groups.length} grupo(s). Los motores del mismo grupo comparten un solo voto.`,
  );
  if (simulated.length > 0) reasons.push("Se excluyeron resultados simulados del cálculo agregado.");
  if (unavailable.length > 0) reasons.push(`${unavailable.length} motor(es) no disponibles por configuración o idioma.`);
  if (groups.length === 1) reasons.push("Un solo grupo: no se calcula compuesto (haría falta contraste metodológico).");

  // ----------------------------- Desacuerdos -----------------------------
  const disagreements: AggregateSummary["disagreements"] = [];
  const sorted = [...groups].sort((a, b) => b.signal - a.signal);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const delta = Math.abs(a.signal - b.signal);
      if (delta >= 0.3) {
        disagreements.push({
          engines: [...a.members.map((m) => m.run.id), ...b.members.map((m) => m.run.id)],
          description: `${a.label} (${a.signal.toFixed(2)}) frente a ${b.label} (${b.signal.toFixed(2)}): diferencia de ${(delta * 100).toFixed(0)} puntos de intensidad. Miden fenómenos distintos; la discrepancia es informativa y no se resuelve por mayoría.`,
        });
      }
    }
  }
  const high = directional.filter(({ run }) => (run.signal as number) >= 0.65);
  const low = directional.filter(({ run }) => (run.signal as number) <= 0.35);
  if (high.length > 0 && low.length > 0 && disagreements.length === 0) {
    disagreements.push({
      engines: [...high.map(({ run }) => run.id), ...low.map(({ run }) => run.id)],
      description: `${high.map(({ run }) => run.id).join(", ")} marcan intensidad alta de sus rasgos, mientras que ${low
        .map(({ run }) => run.id)
        .join(", ")} marcan intensidad baja de los suyos. Son rasgos diferentes: la discrepancia no indica error de uno de los dos.`,
    });
  }

  // ------------------------------ Avisos ------------------------------
  const warnings: string[] = [];
  if (profile.words < 80) warnings.push("Texto corto: no se calcula índice; los estadísticos son inestables.");
  if (profile.language === "unknown") warnings.push("Idioma no identificado: algunos motores pueden no ser aplicables.");
  if (groups.length === 1) warnings.push("Solo un grupo aporta señal: sin contraste metodológico no hay compuesto.");
  if (directional.length === 0) warnings.push("Sin señales direccionales: no hay nada que componer.");
  if (simulated.length > 0) warnings.push("Hay resultados simulados en la lista de motores; no cuentan para el índice.");
  if (failed.length > 0) warnings.push(`Motores con error: ${failed.map((run) => run.id).join(", ")}.`);
  if (validatedGroups.length === 0) {
    warnings.push("Ningún método propio tiene calibración publicada: el índice no está validado.");
  }

  return {
    signalIndex,
    indexKind: "heuristic-composite",
    calibrated: false,
    indexNote: INDEX_NOTE,
    signalBand,
    bandThresholds: {
      low: BAND_THRESHOLDS.low,
      high: BAND_THRESHOLDS.high,
      note: "Umbrales elegidos para presentar tres bandas en la escala; no provienen de calibración ni de una muestra etiquetada.",
    },
    signalRange,
    probability: null,
    probabilityMessage: `${CALIBRATED_PROBABILITY_MESSAGE} Se requiere un agregador entrenado y calibrado con datos etiquetados, separación por autor y por idioma, y evaluación fuera de muestra.`,
    authorshipConclusion: null,
    authorshipMessage: AUTHORSHIP_MESSAGE,
    evidence: { level: evidence, definition: EVIDENCE_DEFINITION, reasons },
    agreement: {
      score: null,
      label: "no calculable",
      method: "No se aplica ninguna medida de acuerdo entre motores.",
      reason: AGREEMENT_REASON,
    },
    dispersion: {
      sd: weightedSd === null ? null : Number(weightedSd.toFixed(4)),
      spreadPoints: weightedSd === null ? null : Math.round(weightedSd * 100),
      groups: groups.length,
      note: "Desviación típica ponderada entre grupos (pesos del compuesto). Describe separación de intensidades; no es un intervalo de confianza ni una medida de acierto.",
    },
    groups: groups.map((group) => ({
      id: group.id,
      label: group.label,
      engines: group.members.map((m) => m.run.id),
      families: [...new Set(group.members.map((m) => m.meta.family))],
      signal: Number(group.signal.toFixed(4)),
      weight: Number(group.weight.toFixed(3)),
      note:
        group.members.length > 1
          ? `${group.members.length} motores comparten la misma variable subyacente: un solo voto.`
          : "Un único motor aporta la señal de este grupo.",
    })),
    disagreements,
    warnings: [...new Set(warnings)],
    coverage: {
      enginesRegistered: metas.length,
      enginesRequested: runs.length,
      enginesRun: okRuns.length,
      enginesWithSignal: directional.length,
      enginesFailed: failed.length,
      enginesUnavailable: unavailable.length,
    },
  };
}

function clusterLabel(clusterId: string, members: Member[]): string {
  const known: Record<string, string> = {
    "information-theoretic": "Información y previsibilidad",
    "sequence-repetition": "Repetición de secuencias",
    "sentence-rhythm": "Ritmo y estructura oracional",
    "lexical-richness": "Riqueza léxica",
    "function-word-profile": "Perfil de palabras funcionales",
    "discourse-markers": "Marcadores discursivos",
    orthography: "Puntuación y tipografía",
    "trained-classifier": "Clasificador entrenado",
    simulated: "Simulación (excluida)",
  };
  if (known[clusterId]) return known[clusterId];
  if (clusterId.startsWith("vendor-")) {
    const vendor = clusterId.replace("vendor-", "");
    const name = members.find((m) => m.run.id === `commercial.${vendor}`)?.meta.name;
    return name ? `${name} (proveedor externo)` : `Proveedor ${vendor}`;
  }
  return clusterId;
}

/** Peso de un motor concreto, para reutilizar la misma regla en otros puntos. */
export function runWeight(meta: EngineMeta, evidence: EvidenceLevel): number {
  return VALIDATION_WEIGHT[meta.validation] * EVIDENCE_WEIGHT[evidence];
}
