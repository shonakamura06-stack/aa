import { createHash, randomUUID } from "node:crypto";
import type { AnalysisResponse, AnalysisResponse as Response_, EngineContext, EngineRun } from "@/lib/types";
import { aggregate } from "@/lib/aggregator";
import { buildContext, buildProfile } from "@/lib/analysis";
import { buildEditorialSuggestions, EDITORIAL_DISCLAIMER } from "@/lib/editorial";
import { engineById, engineRegistry, availabilityFor } from "@/lib/engines/registry";
import { AdapterError } from "@/lib/adapters/types";
import { EngineLanguageError, EngineUnavailableError } from "@/lib/engines/errors";
import { ENGINE_VERSION } from "@/lib/version";

export interface AnalyzeOptions {
  text: string;
  language?: "auto" | "es" | "en";
  engineIds?: string[];
  allowExternal?: boolean;
  externalConsent?: Record<string, boolean>;
  includeEditorial?: boolean;
  fetchImpl?: typeof fetch;
  onEngine?: (run: EngineRun) => void;
  signal?: AbortSignal;
}

const CONCURRENCY = Math.max(1, Number(process.env.UMBRAL_CONCURRENCY ?? 4));
const ENGINE_TIMEOUT_MS = Math.max(500, Number(process.env.UMBRAL_ENGINE_TIMEOUT_MS ?? 8000));

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function runOne(
  engineId: string,
  ctx: EngineContext,
  policy: { externalAllowed: boolean; consent: Record<string, boolean> },
): Promise<EngineRun> {
  const engine = engineById(engineId);
  const started = Date.now();
  if (!engine) {
    return {
      id: engineId,
      status: "error",
      durationMs: 0,
      metrics: [],
      signal: null,
      evidence: "insufficient",
      notes: [],
      warnings: [],
      error: "Motor desconocido",
    };
  }

  // 1. Compatibilidad de idioma declarada por el propio motor.
  if (ctx.language !== "unknown" && !engine.meta.languages.includes(ctx.language)) {
    return {
      id: engineId,
      status: "unavailable",
      durationMs: 0,
      metrics: [],
      signal: null,
      evidence: "insufficient",
      notes: [`Idioma detectado (${ctx.language}) fuera de la compatibilidad declarada (${engine.meta.languages.join(", ")}).`],
      warnings: ["Motor omitido por compatibilidad de idioma."],
    };
  }

  // 2. Disponibilidad operativa (claves, presupuesto, consentimiento, dataset).
  const availability = availabilityFor(engine, policy);
  if (availability.status !== "ready") {
    return {
      id: engineId,
      status: "unavailable",
      durationMs: 0,
      metrics: [],
      signal: null,
      evidence: "insufficient",
      notes: [availability.detail],
      warnings: [],
    };
  }

  // 3. Ejecución con timeout individual.
  try {
    const output = await withTimeout(
      Promise.resolve(engine.run(ctx)),
      ENGINE_TIMEOUT_MS,
      engine.meta.id,
    );
    return {
      id: engine.meta.id,
      status: "ok",
      durationMs: Date.now() - started,
      metrics: output.metrics,
      signal: output.signal,
      signalLabel: output.signalLabel,
      evidence: output.evidence,
      notes: output.notes ?? [],
      warnings: output.warnings ?? [],
      segments: output.segments,
      simulated: output.simulated,
      meta: output.meta,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    if (error instanceof EngineUnavailableError) {
      return {
        id: engine.meta.id,
        status: "unavailable",
        durationMs,
        metrics: [],
        signal: null,
        evidence: "insufficient",
        notes: [error.message],
        warnings: [],
      };
    }
    if (error instanceof EngineLanguageError) {
      return {
        id: engine.meta.id,
        status: "unavailable",
        durationMs,
        metrics: [],
        signal: null,
        evidence: "insufficient",
        notes: [error.message],
        warnings: [],
      };
    }
    if (error instanceof AdapterError) {
      return {
        id: engine.meta.id,
        status: error.code === "quota" || error.code === "rate_limited" ? "unavailable" : "error",
        durationMs,
        metrics: [],
        signal: null,
        evidence: "insufficient",
        notes: [],
        warnings: [],
        error: `${error.code}: ${error.message}`,
        meta: { providerCode: error.code, status: error.status },
      };
    }
    const message = (error as Error).message ?? "Error desconocido";
    const isTimeout = message.startsWith("TIMEOUT:");
    return {
      id: engine.meta.id,
      status: isTimeout ? "timeout" : "error",
      durationMs,
      metrics: [],
      signal: null,
      evidence: "insufficient",
      notes: [],
      warnings: [],
      error: isTimeout
        ? `El motor superó el timeout de ${ENGINE_TIMEOUT_MS} ms`
        : message,
    };
  }
}

/** Ejecuta motores con concurrencia limitada y estado independiente por motor. */
export async function runEngines(
  ctx: EngineContext,
  engineIds: string[],
  policy: { externalAllowed: boolean; consent: Record<string, boolean> },
  onEngine?: (run: EngineRun) => void,
): Promise<EngineRun[]> {
  const results: EngineRun[] = new Array(engineIds.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, engineIds.length) }, async () => {
    while (cursor < engineIds.length) {
      const index = cursor++;
      const run = await runOne(engineIds[index], ctx, policy);
      results[index] = run;
      onEngine?.(run);
    }
  });
  await Promise.all(workers);
  return results;
}

const inflight = new Map<string, Promise<AnalysisResponse>>();

export function requestKey(text: string, opts: AnalyzeOptions): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        t: text,
        l: opts.language ?? "auto",
        e: [...(opts.engineIds ?? [])].sort(),
        x: Boolean(opts.allowExternal),
        c: opts.externalConsent ?? {},
      }),
    )
    .digest("hex");
}

export async function analyze(opts: AnalyzeOptions): Promise<AnalysisResponse> {
  const text = opts.text;
  if (!text || text.trim().length === 0) throw new Error("EMPTY_TEXT");
  const key = requestKey(text, opts);
  const existing = inflight.get(key);
  if (existing) return existing; // protección contra solicitudes duplicadas simultáneas

  const promise = (async () => {
    const startedAt = new Date();
    const t0 = Date.now();
    const ctx = buildContext(text, opts.language ?? "auto", opts.signal);
    const profile = buildProfile(text, ctx);
    const policy = {
      externalAllowed: Boolean(opts.allowExternal),
      consent: opts.externalConsent ?? {},
    };
    ctx.external = {
      allowed: policy.externalAllowed,
      consent: policy.consent,
      fetchImpl: opts.fetchImpl,
    };

    const requested = opts.engineIds?.length
      ? opts.engineIds.filter((id) => engineRegistry.some((e) => e.meta.id === id))
      : engineRegistry.map((e) => e.meta.id);

    const runs = await runEngines(ctx, requested, policy, opts.onEngine);
    const metas = engineRegistry.map((e) => e.meta);
    const aggregateSummary = aggregate({ runs, metas, profile });

    const externalProvidersContacted = runs
      .filter((r) => r.status === "ok" && !r.simulated && r.id.startsWith("commercial."))
      .map((r) => r.id.replace("commercial.", ""));

    const editorial = opts.includeEditorial === false
      ? { available: false, suggestions: [], disclaimer: EDITORIAL_DISCLAIMER }
      : {
          available: true,
          suggestions: buildEditorialSuggestions(ctx),
          disclaimer: EDITORIAL_DISCLAIMER,
        };

    const response: AnalysisResponse = {
      // Identificador aleatorio: antes se publicaba un prefijo del SHA-256 del
      // texto, lo que permitía confirmar si dos envíos contenían el mismo texto.
      id: randomUUID(),
      createdAt: startedAt.toISOString(),
      engineVersion: ENGINE_VERSION,
      text: {
        characters: text.length,
        words: ctx.wordCount,
        sentences: ctx.sentences.length,
        paragraphs: ctx.paragraphs.length,
        numericTokens: profile.numericTokens,
        stored: false,
      },
      profile,
      engines: runs,
      aggregate: aggregateSummary,
      editorial,
      privacy: {
        externalProvidersContacted,
        textRetained: false,
        note:
          "El texto no se almacena. Solo se procesa en memoria durante la petición. Si se contactó con proveedores externos, se hizo con consentimiento explícito y se registró el consumo.",
      },
      timings: { totalMs: Date.now() - t0, startedAt: startedAt.toISOString() },
    };
    return response;
  })();

  inflight.set(key, promise);
  promise.finally(() => {
    setTimeout(() => inflight.delete(key), 15_000).unref?.();
  });
  return promise;
}

export type { Response_ };
