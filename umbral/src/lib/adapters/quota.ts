import type { QuotaState } from "@/lib/types";
import type { CommercialAdapter } from "./types";

/**
 * Contabilidad de consumo en memoria del proceso.
 *
 * Limitación explícita: en un despliegue serverless cada instancia tiene su
 * propia memoria, por lo que estos contadores son una salvaguarda operativa,
 * no un registro contable global. La fuente de verdad siempre es el panel del
 * proveedor. Se documenta así en /api/providers.
 */
interface LedgerEntry {
  requests: number;
  charsSent: number;
  lastRun: string | null;
}

const ledger = new Map<string, LedgerEntry>();

/** Proveedores detenidos tras agotar cuota o recibir un 429. */
const exhausted = new Map<string, { at: string; reason: string }>();

export function markProviderExhausted(provider: string, reason: string): void {
  exhausted.set(provider, { at: new Date().toISOString(), reason });
}

export function providerExhaustion(provider: string): { at: string; reason: string } | null {
  return exhausted.get(provider) ?? null;
}

export function clearProviderExhaustion(provider: string): void {
  exhausted.delete(provider);
}

const COST_PER_1K_CHARS: Record<string, { usd: number; model: string }> = {
  sapling: { usd: 0.005, model: "Desde 0,005 USD por 1000 caracteres (sapling.ai/docs/api/pricing)" },
  gptzero: { usd: 0, model: "Sin tarifa pública verificada por carácter; se factura por plan/uso" },
  mock: { usd: 0, model: "Simulación local, coste cero" },
};

export function charBudgetFor(provider: string): number {
  // El proveedor simulado no hace ninguna petición externa: no consume cuota.
  // Se sigue exigiendo UMBRAL_ALLOW_MOCK y consentimiento explícito por petición.
  if (provider === "mock") return Number.MAX_SAFE_INTEGER;
  const envKey =
    provider === "sapling"
      ? process.env.SAPLING_CHAR_BUDGET
      : provider === "gptzero"
        ? process.env.GPTZERO_CHAR_BUDGET
        : "0";
  const parsed = Number(envKey ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function entryFor(provider: string): LedgerEntry {
  return ledger.get(provider) ?? { requests: 0, charsSent: 0, lastRun: null };
}

export function canSpend(provider: string, chars: number): { ok: boolean; reason?: string } {
  const stop = providerExhaustion(provider);
  if (stop) {
    return { ok: false, reason: `Proveedor detenido el ${stop.at}: ${stop.reason}` };
  }
  const budget = charBudgetFor(provider);
  if (budget <= 0) {
    return { ok: false, reason: "Presupuesto de caracteres en 0: no se autoriza ningún envío externo." };
  }
  const used = entryFor(provider).charsSent;
  if (used + chars > budget) {
    return {
      ok: false,
      reason: `Presupuesto insuficiente: ${used}/${budget} caracteres consumidos y ${chars} solicitados.`,
    };
  }
  return { ok: true };
}

export function recordSpend(provider: string, chars: number): void {
  const current = entryFor(provider);
  ledger.set(provider, {
    requests: current.requests + 1,
    charsSent: current.charsSent + chars,
    lastRun: new Date().toISOString(),
  });
}

export function resetLedger(provider?: string): void {
  if (provider) ledger.delete(provider);
  else ledger.clear();
}

export function quotaState(adapter: CommercialAdapter): QuotaState {
  const entry = entryFor(adapter.id);
  const budget = charBudgetFor(adapter.id);
  const cost = COST_PER_1K_CHARS[adapter.id] ?? { usd: 0, model: "No documentado" };
  return {
    provider: adapter.id,
    requests: entry.requests,
    charsSent: entry.charsSent,
    charBudget: budget,
    remainingBudget: Math.max(0, budget - entry.charsSent),
    lastRun: entry.lastRun,
    authorized: Boolean(process.env.UMBRAL_ENABLE_EXTERNAL === "true"),
    estimatedCostUsd: Number(((entry.charsSent / 1000) * cost.usd).toFixed(4)),
    costModel: cost.model,
    freeTierClaim: adapter.freeTier,
    exhausted: budget > 0 && entry.charsSent >= budget,
  };
}
