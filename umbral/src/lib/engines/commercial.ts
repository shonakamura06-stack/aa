import type { Engine, EngineContext } from "@/lib/types";
import { canSpend, recordSpend, markProviderExhausted } from "@/lib/adapters/quota";
import { AdapterError, type CommercialAdapter } from "@/lib/adapters/types";
import { EngineUnavailableError, EngineLanguageError } from "./errors";

const PROVIDER_TIMEOUT_MS = Number(process.env.UMBRAL_PROVIDER_TIMEOUT_MS ?? 12000);

/**
 * Envuelve un adaptador comercial como motor de Umbral.
 * El fallo del proveedor nunca detiene los analizadores propios: el
 * orquestador captura el error y lo registra como estado del motor.
 */
export function makeCommercialEngine(adapter: CommercialAdapter): Engine {
  return {
    meta: {
      id: `commercial.${adapter.id}`,
      name: adapter.name,
      kind: "commercial",
      family: "commercial",
      version: "externo",
      summary:
        adapter.id === "mock"
          ? "Proveedor simulado para pruebas de interfaz. No es un detector real."
          : `Detector comercial de ${adapter.vendor}, invocado desde el servidor con consentimiento explícito.`,
      methodology:
        adapter.id === "mock"
          ? "Generación local de una respuesta ficticia reproducible. No contacta con ningún servicio."
          : `POST ${adapter.endpoint} con autenticación ${adapter.auth}. Se solicitan puntuaciones por oración cuando el proveedor las ofrece. ${adapter.supportsZeroRetention ? "Se envía zero_retention=true." : "El proveedor no documenta retención cero."}`,
      variables: ["Texto íntegro (o limitado al máximo del proveedor)", "Puntuación global del documento", "Puntuaciones por oración"],
      formulas: [
        {
          name: "Puntuación del proveedor",
          expression: "s = score_documento (escala del proveedor, 1 = generado por IA)",
          note: "No se recalcula ni se recalibra: se informa tal cual.",
        },
      ],
      limitations: [
        ...adapter.notes,
        "La precisión declarada por el proveedor no se ha replicado de forma independiente en este proyecto.",
        "Los detectores comerciales producen falsos positivos y falsos negativos documentados por sus propios autores.",
        "El texto se envía a un tercero: solo con consentimiento explícito por petición.",
      ],
      languages: adapter.spanishSupported ? ["es", "en"] : ["en"],
      minWords: 50,
      external: true,
      validation: adapter.id === "mock" ? "descriptive" : "vendor-claim",
      directionality: "directional",
      signalAnchors: {
        metric: "providerScore",
        rationale:
          "La puntuación del proveedor se informa tal cual (0-1, 1 = más compatible con generación automática). No se remapea ni se recalibra: se desconoce su calibración en español y en este dominio.",
        points: [
          [0, 0],
          [1, 1],
        ],
      },
      dependenceCluster: adapter.id === "mock" ? "simulated" : `vendor-${adapter.id}`,
      sharesVarianceWith:
        adapter.id === "sapling" || adapter.id === "gptzero"
          ? [
              {
                engine: adapter.id === "sapling" ? "commercial.gptzero" : "commercial.sapling",
                reason:
                  "Distintos proveedores, misma tarea y señales de entrenamiento relacionadas: sus errores están correlacionados aunque no sean idénticos. Se les asigna voto propio por ser implementaciones independientes.",
              },
            ]
          : undefined,
      supportsSegments: adapter.sentenceScores,
      segmentUnit: "probabilidad por oración del proveedor",
      references: adapter.docsUrl ? [adapter.docsUrl] : [],
    },
    async run(ctx: EngineContext) {
      if (!adapter.isConfigured()) {
        throw new EngineUnavailableError(
          `Proveedor no configurado: falta ${adapter.envKey} o está deshabilitado.`,
        );
      }
      if (!ctx.external?.allowed) {
        throw new EngineUnavailableError("Proveedores externos desactivados (UMBRAL_ENABLE_EXTERNAL=false).");
      }
      if (!ctx.external.consent[adapter.id]) {
        throw new EngineUnavailableError(
          `Sin consentimiento explícito para enviar el texto a ${adapter.vendor}.`,
        );
      }
      if (ctx.language !== "unknown" && !this.meta.languages.includes(ctx.language)) {
        throw new EngineLanguageError(`${adapter.name} no declara compatibilidad con el idioma detectado (${ctx.language}).`);
      }
      if (ctx.characterCount > adapter.maxChars) {
        throw new EngineUnavailableError(`El texto supera el máximo de ${adapter.maxChars} caracteres del proveedor.`);
      }
      const budget = canSpend(adapter.id, ctx.characterCount);
      if (!budget.ok) throw new EngineUnavailableError(budget.reason ?? "Presupuesto agotado.");

      const started = Date.now();
      try {
        const detection = await adapter.detect(ctx.text, {
          apiKey: adapter.envKey === "SAPLING_API_KEY" ? (process.env.SAPLING_API_KEY ?? "") : (process.env.GPTZERO_API_KEY ?? ""),
          language: ctx.language,
          timeoutMs: PROVIDER_TIMEOUT_MS,
          fetchImpl: ctx.external.fetchImpl,
          zeroRetention:
            adapter.id === "sapling" ? process.env.SAPLING_ZERO_RETENTION !== "false" : false,
        });
        recordSpend(adapter.id, ctx.characterCount);
        const simulated = adapter.id === "mock";
        return {
          metrics: [
            { key: "providerScore", label: "Puntuación del proveedor", value: Number(detection.score.toFixed(4)), unit: "0-1" },
            { key: "aiFraction", label: "Fracción marcada como IA", value: detection.aiFraction, unit: "0-1" },
            { key: "verdict", label: "Veredicto del proveedor", value: detection.verdict ?? "no informado" },
            { key: "lowConfidence", label: "Baja confianza declarada", value: detection.lowConfidence ? "sí" : "no", interpretation: detection.lowConfidenceReasons.join(", ") || undefined },
            { key: "detectorVersion", label: "Versión del detector", value: detection.detectorVersion ?? "no informada" },
            { key: "retention", label: "Retención del texto", value: detection.retention === "zero" ? "cero (solicitada)" : "política del proveedor" },
            { key: "detectedLanguage", label: "Idioma detectado por el proveedor", value: detection.detectedLanguage ?? "no informado" },
            { key: "latencyMs", label: "Latencia", value: Date.now() - started, unit: "ms" },
            ...(simulated
              ? [{ key: "simulated", label: "Resultado simulado", value: "SÍ — no es un detector real" }]
              : []),
          ],
          signal: detection.score,
          signalLabel: simulated ? "Simulación de interfaz" : "Puntuación del proveedor externo",
          evidence: simulated ? "insufficient" : "medium",
          notes: [
            simulated
              ? "Respuesta ficticia generada localmente. Excluida del agregador."
              : `Consumo registrado: ${ctx.characterCount} caracteres.`,
            ...(detection.tokenProbs ? ["El proveedor devolvió probabilidades por token."] : []),
          ],
          warnings: [
            ...(detection.lowConfidence ? [`El proveedor marca baja confianza: ${detection.lowConfidenceReasons.join(", ") || "sin motivo declarado"}.`] : []),
            ...(simulated ? ["Resultado simulado: no debe interpretarse como una detección real."] : []),
          ],
          segments: detection.sentences,
          simulated,
          /**
           * Auditoría: antes se incluía `raw: detection.raw`, la respuesta
           * completa del proveedor. En Sapling eso puede contener el texto
           * original, las oraciones y miles de probabilidades por token:
           * duplicaba el texto del usuario en la respuesta y podía multiplicar
           * el tamaño del payload. Se publican solo campos normalizados.
           */
          meta: {
            retention: detection.retention,
            providerVersion: detection.detectorVersion,
            tokenProbabilities: detection.tokenProbs ? detection.tokenProbs.tokens.length : 0,
            sentencesScored: detection.sentences.length,
          },
        };
      } catch (error) {
        if (error instanceof AdapterError) {
          if (error.code === "rate_limited" || error.code === "quota") {
            markProviderExhausted(adapter.id, error.message);
          }
          throw error;
        }
        throw error;
      }
    },
  };
}
