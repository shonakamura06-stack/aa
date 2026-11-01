import { NextResponse } from "next/server";
import { analyzeRequestSchema } from "@/lib/types";
import { analyze } from "@/lib/orchestrator";
import { clientIdFrom, rateLimit } from "@/lib/rate-limit";
import { BODY_TOO_LARGE_MESSAGE, readJsonLimited, unknownEngineIds } from "@/lib/http";
import { engineById } from "@/lib/engines/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = rateLimit(clientIdFrom(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: `Demasiadas peticiones. Reintenta en ${limit.retryAfterSeconds} s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const read = await readJsonLimited(request);
  if (!read.ok) {
    return read.error === "too_large"
      ? NextResponse.json({ error: "payload_too_large", message: BODY_TOO_LARGE_MESSAGE }, { status: 413 })
      : NextResponse.json({ error: "invalid_json", message: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const parsed = analyzeRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Solicitud inválida.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const unknown = unknownEngineIds(parsed.data.engines, (id) => Boolean(engineById(id)));
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error: "unknown_engines",
        message: "La petición incluye motores que no existen en el catálogo.",
        unknown,
      },
      { status: 400 },
    );
  }

  try {
    const result = await analyze({
      text: parsed.data.text,
      language: parsed.data.language,
      engineIds: parsed.data.engines,
      allowExternal: parsed.data.allowExternal,
      externalConsent: parsed.data.externalConsent,
      includeEditorial: parsed.data.includeEditorial,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "EMPTY_TEXT") {
      return NextResponse.json({ error: "empty_text", message: "El texto está vacío." }, { status: 400 });
    }
    console.error("[umbral] error en /api/analyze", message);
    return NextResponse.json(
      { error: "internal_error", message: "No se pudo completar el análisis. Los motores fallidos se informan por separado." },
      { status: 500 },
    );
  }
}
