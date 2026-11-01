import type { CommercialAdapter } from "./types";
import { saplingAdapter } from "./sapling";
import { gptzeroAdapter } from "./gptzero";
import { mockAdapter } from "./mock";

export const adapters: CommercialAdapter[] = [saplingAdapter, gptzeroAdapter, mockAdapter];

export function getAdapter(id: string): CommercialAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

export * from "./types";
export { quotaState, canSpend, recordSpend, resetLedger, charBudgetFor } from "./quota";
