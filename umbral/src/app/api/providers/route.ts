import { NextResponse } from "next/server";
import { adapters } from "@/lib/adapters";
import { quotaState } from "@/lib/adapters/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      externalSendingEnabled: process.env.UMBRAL_ENABLE_EXTERNAL === "true",
      providers: adapters.map((adapter) => ({
        id: adapter.id,
        name: adapter.name,
        vendor: adapter.vendor,
        docsUrl: adapter.docsUrl,
        endpoint: adapter.endpoint,
        auth: adapter.auth,
        envKey: adapter.envKey,
        configured: adapter.isConfigured(),
        availability: adapter.apiAvailability,
        freeTier: adapter.freeTier,
        pricing: adapter.pricing,
        maxChars: adapter.maxChars,
        languages: adapter.languages,
        spanishSupported: adapter.spanishSupported,
        sentenceScores: adapter.sentenceScores,
        tokenScores: adapter.tokenScores,
        supportsZeroRetention: adapter.supportsZeroRetention,
        notes: adapter.notes,
        quota: quotaState(adapter),
      })),
      warning:
        "La contabilidad de consumo es en memoria por instancia: la fuente de verdad es el panel de cada proveedor. Ningún proveedor está habilitado por defecto.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
