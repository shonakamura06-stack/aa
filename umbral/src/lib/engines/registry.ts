import type { Engine, EngineAvailability } from "@/lib/types";
import { adapters } from "@/lib/adapters";
import { providerExhaustion } from "@/lib/adapters/quota";
import { loadModel } from "@/lib/ml/model";
import { lexicalEntropyEngine } from "./entropy-lexical";
import { lexicalDiversityEngine } from "./diversity-lexical";
import { yuleRichnessEngine } from "./richness-yule";
import { ngramRepetitionEngine } from "./repetition-ngram";
import { burstinessEngine } from "./burstiness";
import { structureEngine } from "./structure";
import { predictabilityEngine } from "./predictability";
import { compressionEngine } from "./compression";
import { redundancyEngine } from "./redundancy";
import { stylometryEngine } from "./stylometry";
import { connectorsEngine } from "./connectors";
import { syntaxComplexityEngine } from "./syntax";
import { morphosyntaxEngine } from "./morphosyntax";
import { orthographyEngine } from "./orthography";
import { readabilityEngine } from "./readability";
import { mlClassifierEngine } from "./ml-classifier";
import { makeCommercialEngine } from "./commercial";

/** Catálogo completo: 15 analizadores propios + ML + 3 adaptadores comerciales. */
export const engineRegistry: Engine[] = [
  lexicalEntropyEngine,
  lexicalDiversityEngine,
  yuleRichnessEngine,
  ngramRepetitionEngine,
  burstinessEngine,
  structureEngine,
  predictabilityEngine,
  compressionEngine,
  redundancyEngine,
  stylometryEngine,
  connectorsEngine,
  syntaxComplexityEngine,
  morphosyntaxEngine,
  orthographyEngine,
  readabilityEngine,
  mlClassifierEngine,
  ...adapters.map(makeCommercialEngine),
];

export function engineById(id: string): Engine | undefined {
  return engineRegistry.find((e) => e.meta.id === id);
}

export function engineMetas() {
  return engineRegistry.map((e) => e.meta);
}

export interface AvailabilityPolicy {
  externalAllowed: boolean;
  consent: Record<string, boolean>;
}

export function availabilityFor(engine: Engine, policy: AvailabilityPolicy): EngineAvailability {
  const { meta } = engine;
  if (meta.id === "ml.stylometric-classifier") {
    const model = loadModel();
    return model.model
      ? { id: meta.id, status: "ready", detail: `Artefacto cargado: ${model.path}` }
      : { id: meta.id, status: "dataset-required", detail: model.error ?? "Sin dataset licenciado no hay modelo entrenado." };
  }
  if (meta.kind === "commercial") {
    const providerId = meta.id.replace("commercial.", "");
    if (providerId === "mock") {
      return process.env.UMBRAL_ALLOW_MOCK === "true"
        ? { id: meta.id, status: "ready", detail: "Simulación habilitada solo para pruebas de interfaz." }
        : { id: meta.id, status: "disabled-by-user", detail: "Simulación desactivada (UMBRAL_ALLOW_MOCK=false)." };
    }
    if (!policy.externalAllowed) {
      return { id: meta.id, status: "disabled-by-user", detail: "UMBRAL_ENABLE_EXTERNAL=false: no se envía texto a terceros." };
    }
    const adapter = adapters.find((a) => a.id === providerId);
    if (!adapter?.isConfigured()) {
      return { id: meta.id, status: "not-configured", detail: `Falta ${adapter?.envKey ?? "la clave API"}.` };
    }
    const stop = providerExhaustion(providerId);
    if (stop) {
      return { id: meta.id, status: "disabled-by-user", detail: `Detenido tras agotar cuota: ${stop.reason}` };
    }
    if (!policy.consent[providerId]) {
      return { id: meta.id, status: "disabled-by-user", detail: "Sin consentimiento explícito para esta petición." };
    }
    return { id: meta.id, status: "ready", detail: "Configurado y autorizado." };
  }
  return { id: meta.id, status: "ready", detail: "Analizador local." };
}
