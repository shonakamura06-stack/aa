import { NextResponse } from "next/server";
import { engineRegistry, availabilityFor } from "@/lib/engines/registry";
import { adapters } from "@/lib/adapters";
import { ENGINE_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const externalAllowed = url.searchParams.get("external") === "true" && process.env.UMBRAL_ENABLE_EXTERNAL === "true";
  const consentParam = url.searchParams.get("consent");
  const consent: Record<string, boolean> = {};
  if (consentParam) {
    for (const id of consentParam.split(",")) if (id.trim()) consent[id.trim()] = true;
  }

  const engines = engineRegistry.map((engine) => ({
    meta: engine.meta,
    availability: availabilityFor(engine, { externalAllowed, consent }),
    provider: engine.meta.kind === "commercial" ? adapters.find((a) => `commercial.${a.id}` === engine.meta.id) ?? null : null,
  }));

  return NextResponse.json(
    {
      engineVersion: ENGINE_VERSION,
      count: engines.length,
      ownAnalyzers: engines.filter((e) => e.meta.kind !== "commercial" && e.meta.kind !== "trained-classifier").length,
      engines,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
