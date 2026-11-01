/**
 * Rate limiting en memoria por instancia. Suficiente como defensa básica en el
 * sandbox y documentado como limitación en Vercel (varias instancias).
 * Para producción con tráfico real: solución distribuida (p. ej. Vercel KV).
 */
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export function rateLimit(key: string, limit = Number(process.env.UMBRAL_RATE_LIMIT_PER_MIN ?? 30), windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    buckets.set(key, hits);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
      limit,
    };
  }
  hits.push(now);
  buckets.set(key, hits);
  // Limpieza acotada: se eliminan los cubos sin actividad reciente en lugar de
  // borrar todos (lo que reiniciaba los límites de todos los clientes).
  if (buckets.size > 5000) {
    for (const [bucketKey, timestamps] of buckets) {
      if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > windowMs * 5) {
        buckets.delete(bucketKey);
      }
    }
  }
  return { allowed: true, remaining: limit - hits.length, retryAfterSeconds: 0, limit };
}

/**
 * Identificador de cliente para el cubo de rate limiting.
 *
 * Auditoría: la versión anterior usaba la PRIMERA entrada de `x-forwarded-for`,
 * que la escribe el propio cliente. Bastaba enviar `X-Forwarded-For: 1.2.3.4`
 * distinto en cada petición para saltarse el límite por completo. Ahora:
 *   - se prefiere `x-real-ip` (lo fija el proxy de confianza), y
 *   - si solo hay `x-forwarded-for`, se toma la ÚLTIMA entrada, que es la que
 *     añade el proxy más cercano.
 * Aun así, esto solo es fiable si el despliegue está detrás de un proxy que
 * reescribe esas cabeceras (Vercel lo hace). Se documenta en docs/PRIVACY.md.
 */
export function clientIdFrom(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "local";
}

export function resetRateLimit(): void {
  buckets.clear();
}
