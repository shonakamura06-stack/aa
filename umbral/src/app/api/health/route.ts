import { NextResponse } from "next/server";
import { engineRegistry } from "@/lib/engines/registry";
import { loadModel } from "@/lib/ml/model";
import { ENGINE_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const model = loadModel();
  return NextResponse.json({
    status: "ok",
    engineVersion: ENGINE_VERSION,
    enginesRegistered: engineRegistry.length,
    mlModelLoaded: Boolean(model.model),
    externalSending: process.env.UMBRAL_ENABLE_EXTERNAL === "true",
    node: process.version,
    checks: {
      segmentation: typeof Intl.Segmenter === "function",
      compression: true,
    },
    latencyMs: Date.now() - started,
  });
}
