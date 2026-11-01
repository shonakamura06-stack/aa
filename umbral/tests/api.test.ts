import { beforeEach, describe, expect, it } from "vitest";
import { POST as analyzeRoute } from "@/app/api/analyze/route";
import { POST as streamRoute } from "@/app/api/analyze/stream/route";
import { GET as enginesRoute } from "@/app/api/engines/route";
import { GET as providersRoute } from "@/app/api/providers/route";
import { GET as healthRoute } from "@/app/api/health/route";
import { POST as editorialRoute } from "@/app/api/editorial/route";
import { resetRateLimit } from "@/lib/rate-limit";
import { HUMAN_ES } from "./fixtures/texts";

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimit();
});

describe("POST /api/analyze", () => {
  it("devuelve 200 con el análisis completo", async () => {
    const response = await analyzeRoute(jsonRequest("http://localhost/api/analyze", { text: HUMAN_ES }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile.language).toBe("es");
    expect(body.engines.length).toBeGreaterThan(15);
    expect(body.aggregate.probability).toBeNull();
    expect(body.privacy.textRetained).toBe(false);
  });

  it("rechaza cuerpo inválido con 400 y detalle", async () => {
    const response = await analyzeRoute(jsonRequest("http://localhost/api/analyze", { text: "" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rechaza motores inexistentes con 400 en lugar de devolver un informe vacío", async () => {
    const response = await analyzeRoute(
      jsonRequest("http://localhost/api/analyze", { text: HUMAN_ES, engines: ["no.existe", "entropy.lexical"] }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("unknown_engines");
    expect(body.unknown).toEqual(["no.existe"]);
  });

  it("el stream también rechaza motores inexistentes", async () => {
    const response = await streamRoute(
      jsonRequest("http://localhost/api/analyze/stream", { text: HUMAN_ES, engines: ["tampoco.existe"] }),
    );
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("unknown_engines");
    expect(text).toContain("tampoco.existe");
  });

  it("rechaza JSON malformado", async () => {
    const response = await analyzeRoute(
      new Request("http://localhost/api/analyze", { method: "POST", body: "{no-json" }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_json");
  });

  it("limita el número de peticiones por minuto", async () => {
    process.env.UMBRAL_RATE_LIMIT_PER_MIN = "1";
    resetRateLimit();
    const first = await analyzeRoute(
      jsonRequest("http://localhost/api/analyze", { text: HUMAN_ES }, { "x-forwarded-for": "9.9.9.9" }),
    );
    const second = await analyzeRoute(
      jsonRequest("http://localhost/api/analyze", { text: HUMAN_ES }, { "x-forwarded-for": "9.9.9.9" }),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    process.env.UMBRAL_RATE_LIMIT_PER_MIN = "60";
  });
});

describe("POST /api/analyze/stream", () => {
  it("emite eventos por motor y un evento final", async () => {
    const response = await streamRoute(
      jsonRequest("http://localhost/api/analyze/stream", {
        text: HUMAN_ES,
        engines: ["entropy.lexical", "repetition.ngram", "orthography.punctuation"],
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const text = await response.text();
    const events = text.split("\n\n").filter(Boolean).map((chunk) => {
      const [eventLine, dataLine] = chunk.split("\n");
      return { event: eventLine.replace("event: ", ""), data: JSON.parse(dataLine.replace("data: ", "")) };
    });
    const engineEvents = events.filter((e) => e.event === "engine");
    expect(engineEvents).toHaveLength(3);
    expect(events.at(-1)!.event).toBe("complete");
    expect(events.at(-1)!.data.aggregate.signalIndex).toBeGreaterThanOrEqual(0);
  });

  it("informa de un cuerpo inválido como evento de error", async () => {
    const response = await streamRoute(jsonRequest("http://localhost/api/analyze/stream", { text: "" }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("invalid_request");
  });
});

describe("catálogo y estado", () => {
  it("GET /api/engines publica 19 unidades con distinción de tipo", async () => {
    const response = await enginesRoute(new Request("http://localhost/api/engines"));
    const body = await response.json();
    expect(body.count).toBe(19);
    expect(body.ownAnalyzers).toBe(15);
    const kinds = new Set(body.engines.map((e: { meta: { kind: string } }) => e.meta.kind));
    expect(kinds.has("statistical")).toBe(true);
    expect(kinds.has("commercial")).toBe(true);
    expect(kinds.has("trained-classifier")).toBe(true);
    const ml = body.engines.find((e: { meta: { id: string } }) => e.meta.id === "ml.stylometric-classifier");
    expect(ml.availability.status).toBe("dataset-required");
    const sapling = body.engines.find((e: { meta: { id: string } }) => e.meta.id === "commercial.sapling");
    expect(sapling.availability.status).not.toBe("ready");
  });

  it("GET /api/providers no expone claves y declara proveedores desactivados", async () => {
    const response = await providersRoute();
    const text = await response.text();
    expect(text).not.toContain("SAPLING_API_KEY=");
    const body = JSON.parse(text);
    expect(body.providers.length).toBeGreaterThanOrEqual(3);
    expect(body.providers.every((p: { configured: boolean }) => p.configured === false)).toBe(true);
    expect(body.externalSendingEnabled).toBe(false);
  });

  it("GET /api/health informa del estado real del entorno", async () => {
    const response = await healthRoute();
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.checks.segmentation).toBe(true);
    expect(body.enginesRegistered).toBe(19);
    expect(body.mlModelLoaded).toBe(false);
  });

  it("POST /api/editorial devuelve sugerencias separadas del detector", async () => {
    const response = await editorialRoute(jsonRequest("http://localhost/api/editorial", { text: HUMAN_ES }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.disclaimer).toContain("independiente");
    expect(body).not.toHaveProperty("score");
  });
});

describe("límites y privacidad de las rutas", () => {
  it("rechaza cuerpos que superan el máximo sin leerlos enteros", async () => {
    const huge = JSON.stringify({ text: "a".repeat(2_000_000) });
    const response = await analyzeRoute(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": String(huge.length) },
        body: huge,
      }),
    );
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBe("payload_too_large");
  });

  it("el stream también corta cuerpos demasiado grandes", async () => {
    const huge = JSON.stringify({ text: "a".repeat(2_000_000) });
    const response = await streamRoute(
      new Request("http://localhost/api/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": String(huge.length) },
        body: huge,
      }),
    );
    expect(response.status).toBe(413);
    expect(await response.text()).toContain("payload_too_large");
  });

  it("la respuesta no contiene huellas derivadas del texto ni el texto original", async () => {
    const response = await analyzeRoute(jsonRequest("http://localhost/api/analyze", { text: HUMAN_ES }));
    const body = await response.json();
    expect(body.text.stored).toBe(false);
    expect(body.text).not.toHaveProperty("hash");
    expect(body.text).not.toHaveProperty("text");
    // El identificador es aleatorio, no un prefijo del SHA-256 del texto.
    expect(body.id).not.toBe(body.text.hash);
    // El texto solo aparece donde el motor lo devuelve explícitamente por oración.
    expect(JSON.stringify(body.aggregate)).not.toContain("teleférico");
    expect(JSON.stringify(body.privacy)).not.toContain("teleférico");
  });

  it("x-forwarded-for se lee del último salto, no del primero", async () => {
    process.env.UMBRAL_RATE_LIMIT_PER_MIN = "1";
    resetRateLimit();
    const build = (xff: string) =>
      jsonRequest("http://localhost/api/analyze", { text: HUMAN_ES }, { "x-forwarded-for": xff });
    // Mismo cliente real (último salto), prefijos falsificados distintos.
    const first = await analyzeRoute(build("1.1.1.1, 203.0.113.7"));
    const second = await analyzeRoute(build("2.2.2.2, 203.0.113.7"));
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    process.env.UMBRAL_RATE_LIMIT_PER_MIN = "60";
  });

  it("x-real-ip tiene prioridad sobre x-forwarded-for", async () => {
    process.env.UMBRAL_RATE_LIMIT_PER_MIN = "1";
    resetRateLimit();
    const build = (real: string, xff: string) =>
      jsonRequest("http://localhost/api/analyze", { text: HUMAN_ES }, { "x-real-ip": real, "x-forwarded-for": xff });
    expect((await analyzeRoute(build("198.51.100.4", "a"))).status).toBe(200);
    expect((await analyzeRoute(build("198.51.100.4", "b"))).status).toBe(429);
    process.env.UMBRAL_RATE_LIMIT_PER_MIN = "60";
  });
});
