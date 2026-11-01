/**
 * Utilidades HTTP compartidas por las rutas de API.
 *
 * El esquema de Zod limita `text` a 30 000 caracteres, pero Zod solo se aplica
 * después de parsear el cuerpo: sin esta guarda, una petición de 100 MB se
 * cargaba entera en memoria antes de ser rechazada. Además se corta la lectura
 * aunque el cliente no envíe `Content-Length` (envío por trozos).
 */

export const MAX_BODY_BYTES = Number(process.env.UMBRAL_MAX_BODY_BYTES ?? 1_500_000);

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "too_large" | "invalid_json" };

export async function readJsonLimited(request: Request, maxBytes = MAX_BODY_BYTES): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, error: "too_large" };
  }
  if (!request.body) return { ok: false, error: "invalid_json" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)) };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

/**
 * Identificadores de motor que no existen en el registro. Una petición con un
 * identificador desconocido devolvía 200 con cero motores ejecutados: el usuario
 * recibía un informe «válido» sin ningún análisis. Ahora se rechaza.
 */
export function unknownEngineIds(ids: string[] | undefined, known: (id: string) => boolean): string[] {
  if (!ids || ids.length === 0) return [];
  return [...new Set(ids.filter((id) => !known(id)))];
}

export const BODY_TOO_LARGE_MESSAGE = "El cuerpo de la petición supera el tamaño permitido.";
