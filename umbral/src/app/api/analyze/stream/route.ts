import { analyzeRequestSchema } from "@/lib/types";
import { analyze } from "@/lib/orchestrator";
import { clientIdFrom, rateLimit } from "@/lib/rate-limit";
import { BODY_TOO_LARGE_MESSAGE, readJsonLimited, unknownEngineIds } from "@/lib/http";
import { engineById } from "@/lib/engines/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * Progreso real del análisis por Server-Sent Events: cada evento corresponde a
 * un motor que terminó de ejecutarse, en el orden en que terminó.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientIdFrom(request));
  if (!limit.allowed) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: "rate_limited", retryAfter: limit.retryAfterSeconds })}\n\n`,
      { status: 429, headers: SSE_HEADERS },
    );
  }

  const read = await readJsonLimited(request);
  if (!read.ok) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        error: read.error === "too_large" ? "payload_too_large" : "invalid_json",
        message: read.error === "too_large" ? BODY_TOO_LARGE_MESSAGE : "El cuerpo debe ser JSON válido.",
      })}\n\n`,
      { status: read.error === "too_large" ? 413 : 400, headers: SSE_HEADERS },
    );
  }
  const parsed = analyzeRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: "invalid_request", issues: parsed.error.issues.map((i) => i.message) })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }

  const unknown = unknownEngineIds(parsed.data.engines, (id) => Boolean(engineById(id)));
  if (unknown.length > 0) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        error: "unknown_engines",
        message: "La petición incluye motores que no existen en el catálogo.",
        unknown,
      })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // El cliente ya cerró la conexión.
        }
      };
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      // Si el cliente corta, se deja de escribir en lugar de lanzar al vacío.
      request.signal.addEventListener("abort", close, { once: true });
      send("start", { at: new Date().toISOString() });
      try {
        const result = await analyze({
          text: parsed.data.text,
          language: parsed.data.language,
          engineIds: parsed.data.engines,
          allowExternal: parsed.data.allowExternal,
          externalConsent: parsed.data.externalConsent,
          includeEditorial: parsed.data.includeEditorial,
          onEngine: (run) => send("engine", run),
          signal: request.signal,
        });
        send("complete", result);
      } catch (error) {
        send("error", { message: (error as Error).message });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
